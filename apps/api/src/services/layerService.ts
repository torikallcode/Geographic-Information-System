import type { Queryable } from '../db';
import type { AuthUser, LayerRow, LayerStyle, LegendItem } from '../types';
import { forbidden, notFound } from '../utils/http';
import { normalizeStyle, parseBbox } from '../utils/geo';

interface RawLayerRow extends Record<string, unknown> {
  style: LayerStyle | null;
  legend: LegendItem[] | null;
  ext: string | null;
}

function mapLayerRow(row: RawLayerRow): LayerRow {
  const { ext, ...rest } = row;
  return {
    ...(rest as unknown as LayerRow),
    style: row.style ?? null,
    legend: row.legend ?? [],
    bbox: parseBbox(ext),
    hidden_attributes: Array.isArray(row.hidden_attributes) ? (row.hidden_attributes as string[]) : [],
    attribute_labels: (row.attribute_labels as Record<string, string>) ?? {},
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    feature_count: Number(row.feature_count ?? 0),
  };
}

const SELECT_LAYER = `
  SELECT l.*, u.name AS owner_name, s.style, s.legend,
         coalesce(fc.cnt, 0)::int AS feature_count, fc.ext
  FROM layers l
  LEFT JOIN users u ON u.id = l.owner_id
  LEFT JOIN layer_styles s ON s.layer_id = l.id
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS cnt, ST_Extent(geom) AS ext
    FROM features
    WHERE layer_id = l.id
  ) fc ON TRUE
`;

export async function getLayerById(db: Queryable, id: string): Promise<LayerRow | null> {
  const result = await db.query(`${SELECT_LAYER} WHERE l.id = $1`, [id]);
  if (result.rows.length === 0) return null;
  return mapLayerRow(result.rows[0] as RawLayerRow);
}

export async function getLayerOrThrow(db: Queryable, id: string): Promise<LayerRow> {
  const layer = await getLayerById(db, id);
  if (!layer) throw notFound('Layer tidak ditemukan.');
  return layer;
}

export interface LayerFilters {
  status?: string | null;
  category?: string | null;
  search?: string | null;
  ownerId?: string | null;
  publicOnly?: boolean;
}

export async function listLayers(db: Queryable, filters: LayerFilters = {}): Promise<LayerRow[]> {
  const result = await db.query(
    `${SELECT_LAYER}
     WHERE ($1::layer_status IS NULL OR l.status = $1::layer_status)
       AND ($2::text IS NULL OR l.category = $2::text)
       AND ($3::text IS NULL OR l.name ILIKE '%' || $3::text || '%' OR coalesce(l.description, '') ILIKE '%' || $3::text || '%')
       AND ($4::uuid IS NULL OR l.owner_id = $4::uuid)
       AND ($5::boolean IS NOT TRUE OR l.status = 'published')
     ORDER BY l.sort_order ASC,
              CASE l.status
                WHEN 'published' THEN 0
                WHEN 'submitted' THEN 1
                WHEN 'draft' THEN 2
                ELSE 3
              END,
              l.name ASC`,
    [filters.status ?? null, filters.category ?? null, filters.search ?? null, filters.ownerId ?? null, filters.publicOnly ?? false],
  );
  return result.rows.map((row) => mapLayerRow(row as RawLayerRow));
}

export function canEditLayer(layer: LayerRow, user: AuthUser): boolean {
  if (user.role === 'admin') return true;
  return layer.owner_id === user.id && layer.status !== 'archived';
}

export function assertCanEdit(layer: LayerRow, user: AuthUser): void {
  if (!canEditLayer(layer, user)) {
    throw forbidden('Anda hanya dapat mengubah layer milik sendiri.');
  }
  if (user.role === 'editor' && layer.status === 'published') {
    throw forbidden('Layer sudah terbit. Minta admin untuk menariknya sebelum mengubah data.');
  }
}

export function publicLayerJson(layer: LayerRow): Record<string, unknown> {
  return {
    id: layer.id,
    name: layer.name,
    slug: layer.slug,
    description: layer.description,
    category: layer.category,
    geometry_type: layer.geometry_type,
    status: layer.status,
    source: layer.source,
    data_date: layer.data_date,
    metadata: layer.metadata,
    attribute_labels: layer.attribute_labels,
    hidden_attributes: layer.hidden_attributes,
    feature_count: layer.feature_count ?? 0,
    sort_order: layer.sort_order ?? 0,
    style: normalizeStyle(layer.style),
    legend: layer.legend ?? [],
    bbox: layer.bbox,
    published_at: layer.published_at,
    updated_at: layer.updated_at,
  };
}

export function adminLayerJson(layer: LayerRow): Record<string, unknown> {
  return {
    ...publicLayerJson(layer),
    owner_id: layer.owner_id,
    owner_name: layer.owner_name,
    source_crs: layer.source_crs,
    current_version: layer.current_version,
    rejection_note: layer.rejection_note,
    submitted_at: layer.submitted_at,
    archived_at: layer.archived_at,
    created_at: layer.created_at,
    status: layer.status,
  };
}
