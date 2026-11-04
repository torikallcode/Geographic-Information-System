import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool, query, queryOne } from '../db';
import { env } from '../env';
import { getLayerById, listLayers, publicLayerJson } from '../services/layerService';
import { loadFeatureCollection } from '../services/featuresService';
import { filterHiddenAttributes, normalizeStyle } from '../utils/geo';
import { featuresToCsv } from '../utils/csv';
import { notFound } from '../utils/http';

interface SearchResult {
  label: string;
  lat: number;
  lon: number;
  type: string;
  bbox?: [number, number, number, number];
}

const searchCache = new Map<string, { expires: number; results: SearchResult[] }>();

function parseCoordinateQuery(input: string): SearchResult | null {
  const match = input
    .trim()
    .match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) return null;
  let lat = Number(match[1]);
  let lon = Number(match[2]);
  if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) {
    [lat, lon] = [lon, lat];
  }
  if (Number.isNaN(lat) || Number.isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { label: `Koordinat ${lat.toFixed(6)}, ${lon.toFixed(6)}`, lat, lon, type: 'coordinate' };
}

async function fetchNominatim(pathname: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(pathname, env.NOMINATIM_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: {
      'User-Agent': env.NOMINATIM_USER_AGENT,
      'Accept-Language': 'id,en',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Nominatim merespons ${response.status}`);
  return (await response.json()) as unknown[];
}

const publicRoutes: FastifyPluginAsync = async (app) => {
  app.get('/layers', async () => {
    const layers = await listLayers(pool, { publicOnly: true });
    return { layers: layers.map((layer) => publicLayerJson(layer)) };
  });

  app.get('/layers/:id', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const layer = await getLayerById(pool, id);
    if (!layer || layer.status !== 'published') throw notFound('Layer tidak ditemukan atau belum terbit.');
    return { layer: publicLayerJson(layer) };
  });

  app.get('/layers/:id/geojson', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const layer = await getLayerById(pool, id);
    if (!layer || layer.status !== 'published') throw notFound('Layer tidak ditemukan atau belum terbit.');
    const fc = await loadFeatureCollection(pool, id, layer.hidden_attributes);
    reply.header('Content-Disposition', `attachment; filename="${layer.slug}.geojson"`);
    return fc;
  });

  app.get('/layers/:id/export', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { format } = z.object({ format: z.enum(['geojson', 'csv']).default('geojson') }).parse(request.query);
    const layer = await getLayerById(pool, id);
    if (!layer || layer.status !== 'published') throw notFound('Layer tidak ditemukan atau belum terbit.');
    const fc = await loadFeatureCollection(pool, id, layer.hidden_attributes);
    if (format === 'csv') {
      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${layer.slug}.csv"`);
      return reply.send(featuresToCsv(fc.features));
    }
    reply
      .header('Content-Type', 'application/geo+json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${layer.slug}.geojson"`);
    return reply.send(JSON.stringify(fc));
  });

  app.post('/check-location', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request) => {
    const { lat, lon } = z
      .object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
      })
      .parse(request.body);

    const rows = await query<{
      layer_id: string;
      layer_name: string;
      category: string;
      metadata: Record<string, unknown>;
      attribute_labels: Record<string, string>;
      hidden_attributes: string[];
      fid: string;
      attributes: Record<string, unknown>;
      style: Record<string, unknown> | null;
      legend: unknown;
    }>(
      `SELECT l.id AS layer_id, l.name AS layer_name, l.category, l.metadata,
              l.attribute_labels, l.hidden_attributes, f.fid, f.attributes,
              s.style, s.legend
       FROM layers l
       JOIN features f ON f.layer_id = l.id
       LEFT JOIN layer_styles s ON s.layer_id = l.id
       WHERE l.status = 'published'
         AND l.geometry_type IN ('Polygon', 'MultiPolygon', 'Geometry')
         AND ST_Intersects(f.geom, ST_SetSRID(ST_Point($1, $2), 4326))
       ORDER BY l.name ASC
       LIMIT 25`,
      [lon, lat],
    );

    const matches = rows.map((row) => ({
      layer_id: row.layer_id,
      layer_name: row.layer_name,
      category: row.category,
      fid: row.fid,
      attributes: filterHiddenAttributes(row.attributes, row.hidden_attributes),
      attribute_labels: row.attribute_labels ?? {},
      metadata: row.metadata ?? {},
      rules: (row.metadata as { rules?: unknown } | null)?.rules ?? null,
      style: normalizeStyle(row.style),
      legend: Array.isArray(row.legend) ? row.legend : [],
    }));

    return {
      lat,
      lon,
      matches,
      message:
        matches.length === 0
          ? 'Titik ini berada di luar wilayah data terbit. Coba geser peta ke area yang memiliki layer pola ruang.'
          : undefined,
    };
  });

  app.get('/search', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { q } = z.object({ q: z.string().trim().min(2).max(200) }).parse(request.query);
    const coordinate = parseCoordinateQuery(q);
    if (coordinate) return { results: [coordinate], source: 'coordinate' };

    const cacheKey = q.toLowerCase();
    const cached = searchCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return { results: cached.results, source: 'cache' };

    try {
      const raw = (await fetchNominatim('/search', {
        q,
        format: 'jsonv2',
        limit: '6',
        countrycodes: 'id',
        addressdetails: '0',
      })) as Array<{ display_name?: string; lat?: string; lon?: string; type?: string; boundingbox?: string[] }>;

      const results: SearchResult[] = raw
        .map((item) => {
          const lat = Number(item.lat);
          const lon = Number(item.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
          const bbox = item.boundingbox?.map(Number);
          return {
            label: item.display_name ?? `${lat}, ${lon}`,
            lat,
            lon,
            type: item.type ?? 'place',
            ...(bbox && bbox.length === 4 ? { bbox: bbox as [number, number, number, number] } : {}),
          };
        })
        .filter((item): item is SearchResult => item !== null);

      searchCache.set(cacheKey, { expires: Date.now() + 10 * 60 * 1000, results });
      if (searchCache.size > 300) {
        const oldest = searchCache.keys().next().value;
        if (oldest) searchCache.delete(oldest);
      }
      return { results, source: 'nominatim' };
    } catch {
      reply.code(200);
      return { results: [], source: 'unavailable', warning: 'Layanan pencarian alamat sedang tidak dapat dihubungi.' };
    }
  });

  app.get('/reverse', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const { lat, lon } = z
      .object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) })
      .parse(request.query);
    try {
      const raw = await fetchNominatim('/reverse', {
        lat: String(lat),
        lon: String(lon),
        format: 'jsonv2',
        zoom: '18',
      });
      const item = (Array.isArray(raw) ? raw[0] : raw) as { display_name?: string } | undefined;
      return { label: item?.display_name ?? null };
    } catch {
      return { label: null };
    }
  });

  app.post('/visit', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async () => {
    await query(
      `INSERT INTO site_stats (day, visits) VALUES (CURRENT_DATE, 1)
       ON CONFLICT (day) DO UPDATE SET visits = site_stats.visits + 1`,
    );
    return { ok: true };
  });

  app.get('/stats', async () => {
    const summary = await queryOne<{ layers: number; features: number }>(
      `SELECT (SELECT count(*)::int FROM layers WHERE status = 'published') AS layers,
              (SELECT count(*)::int FROM features f JOIN layers l ON l.id = f.layer_id WHERE l.status = 'published') AS features`,
    );
    return { summary: summary ?? { layers: 0, features: 0 } };
  });
};

export default publicRoutes;
