import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool, withTransaction } from '../db';
import { env } from '../env';
import { layerMetaSchema } from '../schemas';
import { parseImportBuffer, persistImport, readImport, cleanupOldImports } from '../services/importService';
import { createLayerSnapshot, insertFeatures } from '../services/featuresService';
import { validateFeatureCollection } from '../services/validation';
import { normalizeStyle, randomSuffix, resolveGeometryType, slugify } from '../utils/geo';
import { recordAudit } from '../utils/audit';
import { badRequest, forbidden } from '../utils/http';

const importRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.post('/preview', async (request) => {
    const file = await request.file();
    if (!file) throw badRequest('Berkas belum dipilih.');

    const buffer = await file.toBuffer();
    if (buffer.length === 0) throw badRequest('Berkas kosong.');

    const sourceCrs = typeof file.fields.sourceCrs === 'object' && file.fields.sourceCrs !== null && 'value' in file.fields.sourceCrs
      ? String((file.fields.sourceCrs as { value: unknown }).value ?? 'EPSG:4326')
      : 'EPSG:4326';

    const filename = file.filename || 'upload.geojson';
    const parsed = await parseImportBuffer(buffer, filename, sourceCrs);

    if (parsed.featureCount === 0) throw badRequest('Berkas tidak memuat fitur.');

    await cleanupOldImports();
    const importId = randomUUID();
    await persistImport(importId, filename, sourceCrs, parsed.geojson);

    const previewFeatures = parsed.geojson.features.slice(0, 200);

    return {
      importId,
      filename,
      sourceCrs,
      detectedCrs: parsed.detectedCrs,
      featureCount: parsed.featureCount,
      geometryType: parsed.geometryType,
      geometryTypes: parsed.geometryTypes,
      fields: parsed.fields,
      validation: parsed.validation,
      warnings: parsed.warnings,
      bbox: parsed.bbox,
      preview: { type: 'FeatureCollection', features: previewFeatures },
    };
  });

  app.post('/commit', async (request, reply) => {
    if (!request.authUser) throw forbidden();
    const body = z
      .object({
        importId: z.string().uuid(),
        layer: layerMetaSchema,
        geometryType: z.string().optional(),
      })
      .parse(request.body);

    const stored = await readImport(body.importId).catch(() => {
      throw badRequest('Berkas impor tidak ditemukan atau sudah kedaluwarsa. Silakan unggah ulang.');
    }) as Awaited<ReturnType<typeof readImport>>;

    const validation = validateFeatureCollection(stored.geojson, { maxIssues: 100 });
    if (!validation.valid) {
      throw badRequest('Data belum lolos validasi. Perbaiki kesalahan berikut sebelum menyimpan.', validation.issues);
    }

    const geometryType = resolveGeometryType(validation.geometryTypes);
    const baseSlug = slugify(body.layer.name) || 'layer';
    const slug = `${baseSlug}-${randomSuffix()}`;

    const created = await withTransaction(async (client) => {
      const layerResult = await client.query<{ id: string; current_version: number }>(
        `INSERT INTO layers
           (name, slug, description, category, geometry_type, source_crs, status,
            source, data_date, owner_id, metadata, attribute_labels, hidden_attributes)
         VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8, $9, $10, $11, $12)
         RETURNING id, current_version`,
        [
          body.layer.name,
          slug,
          body.layer.description || null,
          body.layer.category,
          geometryType,
          stored.sourceCrs ?? 'EPSG:4326',
          body.layer.source || null,
          body.layer.dataDate || null,
          request.authUser!.id,
          JSON.stringify(body.layer.metadata ?? {}),
          JSON.stringify(body.layer.attributeLabels ?? {}),
          JSON.stringify(body.layer.hiddenAttributes ?? []),
        ],
      );
      const layerId = layerResult.rows[0].id;

      await client.query(
        `INSERT INTO layer_styles (layer_id, style, legend) VALUES ($1, $2, $3)`,
        [
          layerId,
          JSON.stringify(normalizeStyle(body.layer.style)),
          JSON.stringify(body.layer.legend ?? []),
        ],
      );

      await insertFeatures(client, layerId, stored.geojson, request.authUser!.id, 1);
      await client.query('UPDATE layers SET current_version = 1 WHERE id = $1', [layerId]);
      await createLayerSnapshot(client, layerId, 1, request.authUser!.id, 'Impor awal');

      await recordAudit(client, {
        userId: request.authUser!.id,
        action: 'import_layer',
        objectType: 'layer',
        objectId: layerId,
        details: { filename: stored.filename, featureCount: stored.geojson.features.length, sourceCrs: stored.sourceCrs },
        ip: request.ip,
      });

      return { layerId, featureCount: stored.geojson.features.length, validation };
    });

    return reply.code(201).send({
      layer: { id: created.layerId, name: body.layer.name, status: 'draft', feature_count: created.featureCount },
      validation: created.validation,
      message: 'Layer berhasil dibuat sebagai draf. Tinjau dan ajukan untuk penerbitan.',
    });
  });

  app.get('/config', async () => ({
    maxUploadMb: env.MAX_UPLOAD_MB,
    acceptedFormats: ['.geojson', '.json', '.zip (Shapefile)', '.kml', '.csv'],
  }));
};

export default importRoutes;
