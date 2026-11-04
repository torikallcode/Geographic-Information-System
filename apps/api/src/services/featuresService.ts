import type { Queryable } from '../db';
import type { FeatureCollection, GeoFeature } from '../types';
import { ensureFid, filterHiddenAttributes } from '../utils/geo';

const INSERT_CHUNK_SIZE = 500;

interface FeaturePayload {
  fid: string;
  geometry: GeoFeature['geometry'];
  properties: Record<string, unknown>;
}

function toPayload(fc: FeatureCollection): FeaturePayload[] {
  return fc.features.map((feature, index) => ({
    fid: ensureFid(feature.id ?? (feature.properties as Record<string, unknown> | null)?.fid, index),
    geometry: feature.geometry,
    properties: feature.properties ?? {},
  }));
}

export async function insertFeatures(
  db: Queryable,
  layerId: string,
  fc: FeatureCollection,
  userId: string | null,
  version: number,
): Promise<number> {
  const payload = toPayload(fc);
  for (let index = 0; index < payload.length; index += INSERT_CHUNK_SIZE) {
    const chunk = payload.slice(index, index + INSERT_CHUNK_SIZE);
    await db.query(
      `INSERT INTO features (fid, layer_id, geom, attributes, version, created_by)
       SELECT item->>'fid', $1,
              ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(item->'geometry'), 4326)),
              coalesce(item->'properties', '{}'::jsonb),
              $2, $3
       FROM jsonb_array_elements($4::jsonb) AS item
       WHERE item->'geometry' IS NOT NULL`,
      [layerId, version, userId, JSON.stringify(chunk)],
    );
  }
  return payload.length;
}

export async function deleteFeatures(db: Queryable, layerId: string): Promise<void> {
  await db.query('DELETE FROM features WHERE layer_id = $1', [layerId]);
}

export async function replaceFeatures(
  db: Queryable,
  layerId: string,
  fc: FeatureCollection,
  userId: string | null,
  version: number,
): Promise<number> {
  await deleteFeatures(db, layerId);
  return insertFeatures(db, layerId, fc, userId, version);
}

export async function loadFeatureCollection(
  db: Queryable,
  layerId: string,
  hiddenAttributes: unknown = [],
): Promise<FeatureCollection> {
  const result = await db.query(
    `SELECT fid, ST_AsGeoJSON(geom)::jsonb AS geometry, attributes
     FROM features WHERE layer_id = $1 ORDER BY id ASC`,
    [layerId],
  );
  const features: GeoFeature[] = result.rows.map((row) => ({
    type: 'Feature',
    id: row.fid,
    geometry: row.geometry,
    properties: filterHiddenAttributes(row.attributes, hiddenAttributes),
  }));
  return { type: 'FeatureCollection', features };
}

export async function createLayerSnapshot(
  db: Queryable,
  layerId: string,
  version: number,
  userId: string | null,
  changeSummary: string,
): Promise<void> {
  const fc = await loadFeatureCollection(db, layerId);
  await db.query(
    `INSERT INTO layer_versions (layer_id, version, change_summary, snapshot, feature_count, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (layer_id, version) DO UPDATE
       SET snapshot = EXCLUDED.snapshot,
           change_summary = EXCLUDED.change_summary,
           feature_count = EXCLUDED.feature_count,
           created_by = EXCLUDED.created_by,
           created_at = now()`,
    [layerId, version, changeSummary, JSON.stringify(fc), fc.features.length, userId],
  );
}

export async function nextLayerVersion(db: Queryable, layerId: string): Promise<number> {
  const result = await db.query<{ current_version: number }>(
    'UPDATE layers SET current_version = current_version + 1 WHERE id = $1 RETURNING current_version',
    [layerId],
  );
  return result.rows[0].current_version;
}

export async function countLayerFeatures(db: Queryable, layerId: string): Promise<number> {
  const result = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM features WHERE layer_id = $1', [layerId]);
  return result.rows[0].count;
}
