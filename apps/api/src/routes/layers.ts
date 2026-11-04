import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { pool, withTransaction } from '../db';
import type { FeatureCollection } from '../types';
import {
  assertCanEdit,
  canEditLayer,
  adminLayerJson,
  getLayerById,
  getLayerOrThrow,
  listLayers,
} from '../services/layerService';
import {
  createLayerSnapshot,
  loadFeatureCollection,
  nextLayerVersion,
  replaceFeatures,
} from '../services/featuresService';
import { validateFeatureCollection } from '../services/validation';
import { summarizeCollection, compareCollections } from '../services/versionCompare';
import { computeFieldStatistics, pickStatsField } from '../services/statsService';
import { buildLayerReport } from '../services/report';
import { recordAudit } from '../utils/audit';
import { badRequest, forbidden, notFound } from '../utils/http';
import { filterHiddenAttributes, normalizeStyle } from '../utils/geo';
import { featuresToCsv } from '../utils/csv';
import { featureCollectionSchema, layerMetaSchema, styleSchema, legendItemSchema } from '../schemas';

const adminOnly = async (request: FastifyRequest, reply: FastifyReply) => {
  if (request.authUser?.role !== 'admin') {
    return reply.code(403).send({ error: 'Tindakan ini hanya dapat dilakukan admin.' });
  }
};

const updateLayerSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(['pola_ruang', 'administrasi', 'infrastruktur', 'aset', 'risiko']).optional(),
  source: z.string().trim().max(500).optional(),
  dataDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  attributeLabels: z.record(z.string()).optional(),
  hiddenAttributes: z.array(z.string()).max(50).optional(),
});

const layersRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (request) => {
    const query = z
      .object({
        status: z.enum(['draft', 'submitted', 'published', 'archived']).optional(),
        category: z.enum(['pola_ruang', 'administrasi', 'infrastruktur', 'aset', 'risiko']).optional(),
        q: z.string().trim().max(150).optional(),
        mine: z.coerce.boolean().optional(),
      })
      .parse(request.query);

    const layers = await listLayers(pool, {
      status: query.status ?? null,
      category: query.category ?? null,
      search: query.q ?? null,
      ownerId: query.mine ? request.authUser!.id : null,
    });
    return { layers: layers.map((layer) => adminLayerJson(layer)) };
  });

  app.get('/:id', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const layer = await getLayerOrThrow(pool, id);
    return { layer: adminLayerJson(layer) };
  });

  app.patch('/:id', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = updateLayerSchema.parse(request.body);
    const layer = await getLayerOrThrow(pool, id);
    assertCanEdit(layer, request.authUser!);

    const updates: string[] = [];
    const values: unknown[] = [];
    const push = (column: string, value: unknown) => {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };

    if (body.name !== undefined) push('name', body.name);
    if (body.description !== undefined) push('description', body.description || null);
    if (body.category !== undefined) push('category', body.category);
    if (body.source !== undefined) push('source', body.source || null);
    if (body.dataDate !== undefined) push('data_date', body.dataDate || null);
    if (body.metadata !== undefined) push('metadata', JSON.stringify(body.metadata));
    if (body.attributeLabels !== undefined) push('attribute_labels', JSON.stringify(body.attributeLabels));
    if (body.hiddenAttributes !== undefined) push('hidden_attributes', JSON.stringify(body.hiddenAttributes));

    if (updates.length === 0) throw badRequest('Tidak ada perubahan yang dikirim.');

    values.push(id);
    const result = await pool.query(
      `UPDATE layers SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING id`,
      values,
    );
    if (result.rowCount === 0) throw notFound('Layer tidak ditemukan.');

    await recordAudit(pool, {
      userId: request.authUser!.id,
      action: 'update_layer',
      objectType: 'layer',
      objectId: id,
      details: { fields: Object.keys(body) },
      ip: request.ip,
    });

    const updated = await getLayerOrThrow(pool, id);
    return { layer: adminLayerJson(updated) };
  });

  app.put('/:id/style', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        style: styleSchema,
        legend: z.array(legendItemSchema).max(30).optional().default([]),
      })
      .parse(request.body);

    const layer = await getLayerOrThrow(pool, id);
    assertCanEdit(layer, request.authUser!);

    await pool.query(
      `INSERT INTO layer_styles (layer_id, style, legend)
       VALUES ($1, $2, $3)
       ON CONFLICT (layer_id) DO UPDATE SET style = EXCLUDED.style, legend = EXCLUDED.legend, updated_at = now()`,
      [id, JSON.stringify(normalizeStyle(body.style)), JSON.stringify(body.legend)],
    );

    await recordAudit(pool, {
      userId: request.authUser!.id,
      action: 'update_style',
      objectType: 'layer',
      objectId: id,
      ip: request.ip,
    });

    return { message: 'Gaya layer berhasil disimpan.' };
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const layer = await getLayerOrThrow(pool, id);

    if (request.authUser!.role !== 'admin') {
      if (layer.owner_id !== request.authUser!.id || layer.status !== 'draft') {
        throw forbidden('Editor hanya dapat menghapus layer draf miliknya sendiri.');
      }
    }

    await pool.query('DELETE FROM layers WHERE id = $1', [id]);
    await recordAudit(pool, {
      userId: request.authUser!.id,
      action: 'delete_layer',
      objectType: 'layer',
      objectId: id,
      details: { name: layer.name, status: layer.status },
      ip: request.ip,
    });
    return reply.code(204).send();
  });

  app.get('/:id/features', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const layer = await getLayerOrThrow(pool, id);
    const fc = await loadFeatureCollection(pool, id, []);
    return { layer: adminLayerJson(layer), ...fc };
  });

  app.put('/:id/features', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        type: z.literal('FeatureCollection'),
        features: z.array(z.any()),
        changeSummary: z.string().max(300).optional(),
      })
      .parse(request.body) as { type: 'FeatureCollection'; features: unknown[]; changeSummary?: string };

    const layer = await getLayerOrThrow(pool, id);
    assertCanEdit(layer, request.authUser!);

    const fc = body as unknown as FeatureCollection;
    if (!Array.isArray(fc.features)) throw badRequest('Fitur tidak valid.');

    const validation = validateFeatureCollection(fc, { expectedType: layer.geometry_type });
    if (!validation.valid) {
      throw badRequest('Perubahan belum dapat disimpan karena geometri tidak valid.', validation.issues);
    }

    const result = await withTransaction(async (client) => {
      const version = await nextLayerVersion(client, id);
      const count = await replaceFeatures(client, id, fc, request.authUser!.id, version);
      await createLayerSnapshot(client, id, version, request.authUser!.id, body.changeSummary ?? 'Perubahan geometri dan atribut');
      await recordAudit(client, {
        userId: request.authUser!.id,
        action: 'save_features',
        objectType: 'layer',
        objectId: id,
        details: { version, featureCount: count, validationIssues: validation.issues.length },
        ip: request.ip,
      });
      return { version, count };
    });

    return {
      message: 'Perubahan tersimpan sebagai versi baru.',
      version: result.version,
      featureCount: result.count,
      validation,
    };
  });

  app.post('/:id/validate', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const layer = await getLayerOrThrow(pool, id);
    const fc = await loadFeatureCollection(pool, id, []);
    const validation = validateFeatureCollection(fc, { expectedType: layer.geometry_type });
    const summary = summarizeCollection(fc);
    return { validation, summary };
  });

  app.post('/:id/submit', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const layer = await getLayerOrThrow(pool, id);
    if (!canEditLayer(layer, request.authUser!)) throw forbidden('Anda hanya dapat mengajukan layer milik sendiri.');
    if (layer.status !== 'draft') throw badRequest('Hanya layer berstatus draf yang dapat diajukan.');

    const fc = await loadFeatureCollection(pool, id, []);
    if (fc.features.length === 0) throw badRequest('Layer belum memiliki fitur.');
    const validation = validateFeatureCollection(fc, { expectedType: layer.geometry_type });
    if (!validation.valid) throw badRequest('Layer belum lolos validasi.', validation.issues);

    await pool.query(
      `UPDATE layers SET status = 'submitted', submitted_at = now(), rejection_note = NULL WHERE id = $1`,
      [id],
    );
    await recordAudit(pool, {
      userId: request.authUser!.id,
      action: 'submit_layer',
      objectType: 'layer',
      objectId: id,
      details: { featureCount: fc.features.length },
      ip: request.ip,
    });

    return { message: 'Layer diajukan untuk ditinjau admin.', status: 'submitted' };
  });

  app.post('/:id/approve', { preHandler: adminOnly }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const layer = await getLayerOrThrow(pool, id);
    if (layer.status !== 'submitted') throw badRequest('Hanya layer yang diajukan dapat disetujui.');

    const fc = await loadFeatureCollection(pool, id, []);
    const validation = validateFeatureCollection(fc, { expectedType: layer.geometry_type });
    if (!validation.valid) throw badRequest('Layer belum lolos validasi sehingga tidak dapat diterbitkan.', validation.issues);

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE layers SET status = 'published', published_at = now(), archived_at = NULL,
           rejection_note = NULL, submitted_at = COALESCE(submitted_at, now()) WHERE id = $1`,
        [id],
      );
      await createLayerSnapshot(client, id, layer.current_version, request.authUser!.id, `Diterbitkan (v${layer.current_version})`);
      await recordAudit(client, {
        userId: request.authUser!.id,
        action: 'publish_layer',
        objectType: 'layer',
        objectId: id,
        details: { version: layer.current_version, featureCount: fc.features.length },
        ip: request.ip,
      });
    });

    return { message: 'Layer berhasil diterbitkan dan kini tampil di portal publik.' };
  });

  app.post('/:id/publish', { preHandler: adminOnly }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const layer = await getLayerOrThrow(pool, id);
    if (layer.status === 'published') throw badRequest('Layer sudah berstatus terbit.');

    const fc = await loadFeatureCollection(pool, id, []);
    if (fc.features.length === 0) throw badRequest('Layer belum memiliki fitur.');
    const validation = validateFeatureCollection(fc, { expectedType: layer.geometry_type });
    if (!validation.valid) throw badRequest('Layer belum lolos validasi.', validation.issues);

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE layers SET status = 'published', published_at = now(), archived_at = NULL, rejection_note = NULL WHERE id = $1`,
        [id],
      );
      await createLayerSnapshot(client, id, layer.current_version, request.authUser!.id, 'Diterbitkan langsung oleh admin');
      await recordAudit(client, {
        userId: request.authUser!.id,
        action: 'publish_layer',
        objectType: 'layer',
        objectId: id,
        ip: request.ip,
      });
    });

    return { message: 'Layer diterbitkan.' };
  });

  app.post('/:id/reject', { preHandler: adminOnly }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ note: z.string().trim().min(3).max(1000) }).parse(request.body);
    const layer = await getLayerOrThrow(pool, id);
    if (layer.status !== 'submitted') throw badRequest('Hanya layer yang diajukan dapat ditolak.');

    await pool.query(
      `UPDATE layers SET status = 'draft', rejection_note = $2, submitted_at = NULL WHERE id = $1`,
      [id, body.note],
    );
    await recordAudit(pool, {
      userId: request.authUser!.id,
      action: 'reject_layer',
      objectType: 'layer',
      objectId: id,
      details: { note: body.note },
      ip: request.ip,
    });

    return { message: 'Layer dikembalikan ke editor dengan catatan.' };
  });

  app.post('/:id/reorder', { preHandler: adminOnly }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { direction } = z.object({ direction: z.enum(['up', 'down']) }).parse(request.body);
    await getLayerOrThrow(pool, id);

    await withTransaction(async (client) => {
      const rows = await client.query<{ id: string }>('SELECT id FROM layers ORDER BY sort_order ASC, name ASC');
      const ids = rows.rows.map((row) => row.id);
      const currentIndex = ids.indexOf(id);
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ids.length) return;
      [ids[currentIndex], ids[targetIndex]] = [ids[targetIndex], ids[currentIndex]];
      for (let index = 0; index < ids.length; index += 1) {
        await client.query('UPDATE layers SET sort_order = $1 WHERE id = $2', [index * 10, ids[index]]);
      }
      await recordAudit(client, {
        userId: request.authUser!.id,
        action: 'reorder_layer',
        objectType: 'layer',
        objectId: id,
        details: { direction },
        ip: request.ip,
      });
    });

    return { message: 'Urutan layer diperbarui.' };
  });

  app.post('/:id/archive', { preHandler: adminOnly }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const layer = await getLayerOrThrow(pool, id);
    if (layer.status === 'archived') throw badRequest('Layer sudah diarsipkan.');

    await pool.query(`UPDATE layers SET status = 'archived', archived_at = now() WHERE id = $1`, [id]);
    await recordAudit(pool, {
      userId: request.authUser!.id,
      action: 'archive_layer',
      objectType: 'layer',
      objectId: id,
      ip: request.ip,
    });
    return { message: 'Layer diarsipkan dan tidak lagi tampil publik.' };
  });

  app.get('/:id/versions', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await getLayerOrThrow(pool, id);
    const result = await pool.query(
      `SELECT v.version, v.change_summary, v.feature_count, v.created_at, u.name AS created_by_name
       FROM layer_versions v
       LEFT JOIN users u ON u.id = v.created_by
       WHERE v.layer_id = $1
       ORDER BY v.version DESC`,
      [id],
    );
    return { versions: result.rows };
  });

  app.get('/:id/versions/:version', async (request) => {
    const { id, version } = z
      .object({ id: z.string().uuid(), version: z.coerce.number().int().positive() })
      .parse(request.params);
    const result = await pool.query<{ snapshot: FeatureCollection; version: number; change_summary: string | null }>(
      'SELECT snapshot, version, change_summary FROM layer_versions WHERE layer_id = $1 AND version = $2',
      [id, version],
    );
    if (result.rows.length === 0) throw notFound('Versi tidak ditemukan.');
    return { version: result.rows[0].version, changeSummary: result.rows[0].change_summary, ...result.rows[0].snapshot };
  });

  app.post('/:id/restore', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ version: z.number().int().positive() }).parse(request.body);
    const layer = await getLayerOrThrow(pool, id);
    assertCanEdit(layer, request.authUser!);

    const versionRow = await pool.query<{ snapshot: FeatureCollection }>(
      'SELECT snapshot FROM layer_versions WHERE layer_id = $1 AND version = $2',
      [id, body.version],
    );
    if (versionRow.rows.length === 0) throw notFound('Versi yang ingin dipulihkan tidak ditemukan.');

    const snapshot = versionRow.rows[0].snapshot;
    const validation = validateFeatureCollection(snapshot, { expectedType: layer.geometry_type });
    if (!validation.valid) throw badRequest('Snapshot versi lama tidak lolos validasi.', validation.issues);

    const result = await withTransaction(async (client) => {
      const version = await nextLayerVersion(client, id);
      await replaceFeatures(client, id, snapshot, request.authUser!.id, version);
      if (layer.status !== 'published') {
        await client.query(`UPDATE layers SET status = 'draft', rejection_note = NULL WHERE id = $1`, [id]);
      }
      await createLayerSnapshot(client, id, version, request.authUser!.id, `Pemulihan dari versi ${body.version}`);
      await recordAudit(client, {
        userId: request.authUser!.id,
        action: 'restore_version',
        objectType: 'layer',
        objectId: id,
        details: { restoredFrom: body.version, newVersion: version },
        ip: request.ip,
      });
      return version;
    });

    return { message: `Layer dipulihkan ke kondisi versi ${body.version}.`, version: result };
  });

  app.get('/:id/compare', { preHandler: adminOnly }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const layer = await getLayerOrThrow(pool, id);

    const versionRows = await pool.query<{ version: number; snapshot: FeatureCollection; change_summary: string | null; created_at: string }>(
      `SELECT version, snapshot, change_summary, created_at
       FROM layer_versions WHERE layer_id = $1 ORDER BY version DESC LIMIT 2`,
      [id],
    );

    const currentSnapshot = versionRows.rows[0]?.snapshot ?? { type: 'FeatureCollection', features: [] };
    const previousSnapshot = versionRows.rows[1]?.snapshot ?? { type: 'FeatureCollection', features: [] };

    const current = summarizeCollection(currentSnapshot);
    const previous = summarizeCollection(previousSnapshot);
    const diff = compareCollections(previousSnapshot, currentSnapshot);

    const liveFc = await loadFeatureCollection(pool, id, []);
    const validation = validateFeatureCollection(liveFc, { expectedType: layer.geometry_type });

    return {
      layer: adminLayerJson(layer),
      current: { version: versionRows.rows[0]?.version ?? 0, ...current, changeSummary: versionRows.rows[0]?.change_summary ?? null },
      previous: { version: versionRows.rows[1]?.version ?? 0, ...previous, changeSummary: versionRows.rows[1]?.change_summary ?? null },
      diff,
      validation,
    };
  });

  app.get('/:id/export', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { format } = z.object({ format: z.enum(['geojson', 'csv']).default('geojson') }).parse(request.query);
    const layer = await getLayerOrThrow(pool, id);
    const fc = await loadFeatureCollection(pool, id, []);

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

  app.get('/:id/report.pdf', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const layer = await getLayerOrThrow(pool, id);
    const fc = await loadFeatureCollection(pool, id, []);
    const summary = summarizeCollection(fc);
    const statsField = pickStatsField(fc, typeof layer.metadata?.statsField === 'string' ? (layer.metadata.statsField as string) : null);
    const categories = computeFieldStatistics(fc, statsField);
    const validation = validateFeatureCollection(fc, { expectedType: layer.geometry_type });

    const versions = await pool.query<{
      version: number;
      change_summary: string | null;
      feature_count: number;
      created_at: string;
      created_by_name: string | null;
    }>(
      `SELECT v.version, v.change_summary, v.feature_count, v.created_at, u.name AS created_by_name
       FROM layer_versions v LEFT JOIN users u ON u.id = v.created_by
       WHERE v.layer_id = $1 ORDER BY v.version DESC LIMIT 25`,
      [id],
    );

    const pdf = await buildLayerReport({
      layer: {
        name: layer.name,
        description: layer.description,
        category: layer.category,
        status: layer.status,
        owner_name: layer.owner_name,
        source: layer.source,
        data_date: layer.data_date,
        geometry_type: layer.geometry_type,
        feature_count: layer.feature_count ?? fc.features.length,
        current_version: layer.current_version,
        updated_at: layer.updated_at,
      },
      summary,
      categories,
      validation,
      versions: versions.rows,
      generatedAt: new Date(),
    });

    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="laporan-${layer.slug}.pdf"`);
    return reply.send(pdf);
  });
};

export default layersRoutes;
