import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool, queryOne, withTransaction } from '../db';
import type { FeatureCollection, GeoFeature } from '../types';
import { asFeatureCollection, normalizeStyle, randomSuffix, resolveGeometryType, slugify } from '../utils/geo';
import { validateFeatureCollection } from '../services/validation';
import { insertFeatures, createLayerSnapshot } from '../services/featuresService';
import { buildAnalysisReport } from '../services/report';
import { recordAudit } from '../utils/audit';
import { badRequest, forbidden, notFound } from '../utils/http';

function geojsonFeature(geometry: unknown, properties: Record<string, unknown> = {}): GeoFeature | null {
  if (!geometry || typeof geometry !== 'object') return null;
  return { type: 'Feature', geometry: geometry as GeoFeature['geometry'], properties };
}

function featureCollectionOf(features: GeoFeature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

async function saveAnalysis(
  type: string,
  params: Record<string, unknown>,
  result: Record<string, unknown>,
  userId: string,
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO analyses (type, params, result, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
    [type, JSON.stringify(params), JSON.stringify(result), userId],
  );
  return row!.id;
}

const analysisRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (request) => {
    const rows = await pool.query(
      `SELECT a.id, a.type, a.params, a.result, a.layer_id, a.created_at, u.name AS created_by_name, l.name AS saved_layer_name
       FROM analyses a
       LEFT JOIN users u ON u.id = a.created_by
       LEFT JOIN layers l ON l.id = a.layer_id
       WHERE ($1::boolean IS TRUE OR a.created_by = $2)
       ORDER BY a.created_at DESC LIMIT 50`,
      [request.authUser!.role === 'admin', request.authUser!.id],
    );
    return {
      analyses: rows.rows.map((row) => {
        const result = row.result as Record<string, unknown>;
        return {
          id: row.id,
          type: row.type,
          params: row.params,
          summary: result.summary ?? null,
          layer_id: row.layer_id,
          created_at: row.created_at,
          created_by_name: row.created_by_name,
          saved_layer_name: row.saved_layer_name,
        };
      }),
    };
  });

  app.post('/buffer', async (request) => {
    const body = z
      .object({
        layerId: z.string().uuid(),
        distanceMeters: z.number().min(1).max(20_000),
        name: z.string().max(200).optional(),
      })
      .parse(request.body);

    const layer = await queryOne<{ id: string; name: string }>('SELECT id, name FROM layers WHERE id = $1', [body.layerId]);
    if (!layer) throw notFound('Layer tidak ditemukan.');

    const result = await pool.query<{ feature_count: number; geojson: string | null; area_m2: number }>(
      `WITH buffered AS (
         SELECT ST_Buffer(geom::geography, $2)::geometry AS geom
         FROM features WHERE layer_id = $1
       )
       SELECT count(*)::int AS feature_count,
              ST_AsGeoJSON(ST_Union(geom)) AS geojson,
              coalesce(ST_Area(ST_Union(geom)::geography), 0) AS area_m2
       FROM buffered`,
      [body.layerId, body.distanceMeters],
    );

    const row = result.rows[0];
    const geoFeature = row.geojson ? geojsonFeature(JSON.parse(row.geojson), { buffer_m: body.distanceMeters, source_layer: layer.name }) : null;
    const geojson = featureCollectionOf(geoFeature ? [geoFeature] : []);
    const summary = {
      source_layer: layer.name,
      distance_m: body.distanceMeters,
      source_feature_count: row.feature_count,
      buffer_area_m2: Number(row.area_m2),
    };

    const id = await saveAnalysis('buffer', body, { geojson, summary }, request.authUser!.id);
    return { id, type: 'buffer', geojson, summary, params: body };
  });

  app.post('/intersect', async (request) => {
    const body = z
      .object({
        layerA: z.string().uuid(),
        layerB: z.string().uuid(),
      })
      .parse(request.body);

    if (body.layerA === body.layerB) throw badRequest('Pilih dua layer yang berbeda.');

    const layers = await pool.query<{ id: string; name: string }>(
      'SELECT id, name FROM layers WHERE id = ANY($1::uuid[])',
      [[body.layerA, body.layerB]],
    );
    const layerA = layers.rows.find((layer) => layer.id === body.layerA);
    const layerB = layers.rows.find((layer) => layer.id === body.layerB);
    if (!layerA || !layerB) throw notFound('Salah satu layer tidak ditemukan.');

    const stats = await pool.query<{ feature_count: number; area_m2: number }>(
      `SELECT count(*)::int AS feature_count,
              coalesce(sum(ST_Area(ST_Intersection(a.geom, b.geom)::geography)), 0) AS area_m2
       FROM features a
       JOIN features b ON ST_Intersects(a.geom, b.geom)
       WHERE a.layer_id = $1 AND b.layer_id = $2`,
      [body.layerA, body.layerB],
    );

    const preview = await pool.query<{ features: GeoFeature[] }>(
      `SELECT coalesce(jsonb_agg(jsonb_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(geom)::jsonb,
                'properties', jsonb_build_object('layer_a', $3::text, 'layer_b', $4::text)
              )), '[]'::jsonb) AS features
       FROM (
         SELECT ST_Intersection(a.geom, b.geom) AS geom
         FROM features a
         JOIN features b ON ST_Intersects(a.geom, b.geom)
         WHERE a.layer_id = $1 AND b.layer_id = $2
           AND NOT ST_IsEmpty(ST_Intersection(a.geom, b.geom))
         LIMIT 500
       ) parts`,
      [body.layerA, body.layerB, layerA.name, layerB.name],
    );

    const geojson = featureCollectionOf(Array.isArray(preview.rows[0]?.features) ? preview.rows[0].features : []);

    const summary = {
      layer_a: layerA.name,
      layer_b: layerB.name,
      intersecting_feature_pairs: stats.rows[0].feature_count,
      intersection_area_m2: Number(stats.rows[0].area_m2),
      preview_truncated: stats.rows[0].feature_count > 500,
    };

    const id = await saveAnalysis('intersect', body, { geojson, summary }, request.authUser!.id);
    return { id, type: 'intersect', geojson, summary, params: body };
  });

  app.post('/radius', async (request) => {
    const body = z
      .object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        radiusMeters: z.number().min(10).max(100_000),
        layerIds: z.array(z.string().uuid()).max(50).optional(),
      })
      .parse(request.body);

    const isAdmin = request.authUser!.role === 'admin';
    const rows = await pool.query<{ layer_id: string; layer_name: string; feature_count: number }>(
      `SELECT l.id AS layer_id, l.name AS layer_name, count(*)::int AS feature_count
       FROM features f
       JOIN layers l ON l.id = f.layer_id
       WHERE (l.status = 'published' OR l.owner_id = $4 OR $5::boolean)
         AND ($6::uuid[] IS NULL OR l.id = ANY($6::uuid[]))
         AND ST_DWithin(f.geom::geography, ST_SetSRID(ST_Point($1, $2), 4326)::geography, $3)
       GROUP BY l.id, l.name
       ORDER BY feature_count DESC`,
      [body.lon, body.lat, body.radiusMeters, request.authUser!.id, isAdmin, body.layerIds ?? null],
    );

    const preview = await pool.query<{ geojson: FeatureCollection }>(
      `SELECT jsonb_build_object(
         'type', 'FeatureCollection',
         'features', coalesce(jsonb_agg(jsonb_build_object(
           'type', 'Feature',
           'id', x.fid,
           'geometry', ST_AsGeoJSON(x.geom)::jsonb,
           'properties', x.attributes || jsonb_build_object('_layer', x.layer_name)
         )), '[]'::jsonb)
       ) AS geojson
       FROM (
         SELECT f.fid, f.geom, f.attributes, l.name AS layer_name
         FROM features f JOIN layers l ON l.id = f.layer_id
         WHERE (l.status = 'published' OR l.owner_id = $4 OR $5::boolean)
           AND ($6::uuid[] IS NULL OR l.id = ANY($6::uuid[]))
           AND ST_DWithin(f.geom::geography, ST_SetSRID(ST_Point($1, $2), 4326)::geography, $3)
         LIMIT 500
       ) x`,
      [body.lon, body.lat, body.radiusMeters, request.authUser!.id, isAdmin, body.layerIds ?? null],
    );

    const geojson = preview.rows[0]?.geojson ?? featureCollectionOf([]);
    const totalFeatures = rows.rows.reduce((sum, row) => sum + row.feature_count, 0);
    const summary = {
      center: { lat: body.lat, lon: body.lon },
      radius_m: body.radiusMeters,
      total_features: totalFeatures,
      layers: rows.rows,
      preview_truncated: totalFeatures > 500,
    };

    const id = await saveAnalysis('radius', body, { geojson, summary }, request.authUser!.id);
    return { id, type: 'radius', geojson, summary, params: body };
  });

  app.post('/statistics', async (request) => {
    const body = z
      .object({
        layerId: z.string().uuid(),
        field: z.string().max(100).optional(),
        regionLayerId: z.string().uuid().optional(),
        regionField: z.string().max(100).optional(),
      })
      .parse(request.body);

    const layer = await queryOne<{ id: string; name: string; metadata: Record<string, unknown> }>(
      'SELECT id, name, metadata FROM layers WHERE id = $1',
      [body.layerId],
    );
    if (!layer) throw notFound('Layer tidak ditemukan.');

    let field = body.field;
    if (!field) {
      const attrs = await queryOne<{ key: string }>(
        `SELECT key FROM features, jsonb_object_keys(attributes) AS key WHERE layer_id = $1 GROUP BY key ORDER BY count(*) DESC LIMIT 1`,
        [body.layerId],
      );
      field = attrs?.key;
    }

    const categories = field
      ? await pool.query<{ category: string; feature_count: number; area_m2: number; length_km: number }>(
          `SELECT coalesce(attributes->>$2, '(kosong)') AS category,
                  count(*)::int AS feature_count,
                  coalesce(sum(ST_Area(geom::geography)), 0) AS area_m2,
                  coalesce(sum(ST_Length(geom::geography)) / 1000.0, 0) AS length_km
           FROM features WHERE layer_id = $1
           GROUP BY 1 ORDER BY feature_count DESC LIMIT 50`,
          [body.layerId, field],
        )
      : { rows: [] };

    let regionStats: Array<Record<string, unknown>> = [];
    if (body.regionLayerId) {
      const regionField = body.regionField ?? 'name';
      const regions = await pool.query(
        `SELECT r.fid AS region_id,
                r.attributes->>$3 AS region_name,
                count(f.id)::int AS feature_count,
                coalesce(sum(ST_Area(ST_Intersection(f.geom, r.geom)::geography)), 0) AS area_m2
         FROM features r
         LEFT JOIN features f ON f.layer_id = $1 AND ST_Intersects(f.geom, r.geom)
         WHERE r.layer_id = $2
         GROUP BY r.id, r.fid, r.attributes->>$3
         ORDER BY region_name NULLS LAST LIMIT 200`,
        [body.layerId, body.regionLayerId, regionField],
      );
      regionStats = regions.rows;
    }

    const summary = {
      layer: layer.name,
      field: field ?? null,
      categories: categories.rows,
      regions: regionStats,
    };

    const id = await saveAnalysis('statistics', body, { summary }, request.authUser!.id);
    return { id, type: 'statistics', summary, params: body };
  });

  app.get('/:id', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const row = await pool.query(
      `SELECT a.*, u.name AS created_by_name, l.name AS saved_layer_name
       FROM analyses a LEFT JOIN users u ON u.id = a.created_by LEFT JOIN layers l ON l.id = a.layer_id
       WHERE a.id = $1`,
      [id],
    );
    if (row.rows.length === 0) throw notFound('Analisis tidak ditemukan.');
    const analysis = row.rows[0];
    if (request.authUser!.role !== 'admin' && analysis.created_by !== request.authUser!.id) {
      throw forbidden('Anda tidak memiliki akses ke analisis ini.');
    }
    return { analysis };
  });

  app.get('/:id/report.pdf', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const row = await queryOne<{
      id: string;
      type: string;
      params: Record<string, unknown>;
      result: Record<string, unknown>;
      created_at: string;
      created_by: string;
      created_by_name: string | null;
    }>(
      `SELECT a.*, u.name AS created_by_name FROM analyses a LEFT JOIN users u ON u.id = a.created_by WHERE a.id = $1`,
      [id],
    );
    if (!row) throw notFound('Analisis tidak ditemukan.');
    if (request.authUser!.role !== 'admin' && row.created_by !== request.authUser!.id) throw forbidden();

    const pdf = await buildAnalysisReport({
      title: `Analisis ${row.type}`,
      type: row.type,
      createdAt: row.created_at,
      createdBy: row.created_by_name,
      params: row.params,
      result: row.result,
      generatedAt: new Date(),
    });

    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="analisis-${row.type}-${id.slice(0, 8)}.pdf"`);
    return reply.send(pdf);
  });

  app.post('/:id/save-as-layer', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        name: z.string().trim().min(2).max(150),
        category: z.enum(['pola_ruang', 'administrasi', 'infrastruktur', 'aset', 'risiko']).default('pola_ruang'),
        description: z.string().max(2000).optional().default(''),
      })
      .parse(request.body);

    const row = await queryOne<{
      id: string;
      type: string;
      result: Record<string, unknown>;
      created_by: string;
      layer_id: string | null;
      params: Record<string, unknown>;
    }>('SELECT id, type, result, created_by, layer_id, params FROM analyses WHERE id = $1', [id]);
    if (!row) throw notFound('Analisis tidak ditemukan.');
    if (request.authUser!.role !== 'admin' && row.created_by !== request.authUser!.id) throw forbidden();
    if (row.layer_id) throw badRequest('Analisis ini sudah disimpan sebagai layer.');

    const raw = row.result.geojson;
    if (!raw) throw badRequest('Analisis ini tidak memiliki geometri untuk disimpan sebagai layer.');

    const fc = asFeatureCollection(raw);
    const validation = validateFeatureCollection(fc, { maxIssues: 50 });
    if (!validation.valid) throw badRequest('Hasil analisis tidak lolos validasi.', validation.issues);

    const geometryType = resolveGeometryType(validation.geometryTypes);
    const slug = `${slugify(body.name) || 'analisis'}-${randomSuffix()}`;
    const style = normalizeStyle({
      fillColor: '#c26b3b',
      lineColor: '#8f431c',
      circleColor: '#8f431c',
    });

    const created = await withTransaction(async (client) => {
      const layerResult = await client.query<{ id: string }>(
        `INSERT INTO layers (name, slug, description, category, geometry_type, source_crs, status, source, owner_id, metadata)
         VALUES ($1, $2, $3, $4, $5, 'EPSG:4326', 'draft', $6, $7, $8) RETURNING id`,
        [
          body.name,
          slug,
          body.description || `Hasil analisis ${row.type}`,
          body.category,
          geometryType,
          `Analisis ${row.type}`,
          request.authUser!.id,
          JSON.stringify({ analysisSource: row.id, analysisType: row.type }),
        ],
      );
      const layerId = layerResult.rows[0].id;
      await client.query('INSERT INTO layer_styles (layer_id, style, legend) VALUES ($1, $2, $3)', [
        layerId,
        JSON.stringify(style),
        JSON.stringify([]),
      ]);
      await insertFeatures(client, layerId, fc, request.authUser!.id, 1);
      await client.query('UPDATE layers SET current_version = 1 WHERE id = $1', [layerId]);
      await createLayerSnapshot(client, layerId, 1, request.authUser!.id, `Hasil analisis ${row.type}`);
      await client.query('UPDATE analyses SET layer_id = $1 WHERE id = $2', [layerId, id]);
      await recordAudit(client, {
        userId: request.authUser!.id,
        action: 'save_analysis_layer',
        objectType: 'layer',
        objectId: layerId,
        details: { analysisId: id, type: row.type },
        ip: request.ip,
      });
      return layerId;
    });

    return reply.code(201).send({ layerId: created, message: 'Hasil analisis disimpan sebagai layer draf.' });
  });
};

export default analysisRoutes;
