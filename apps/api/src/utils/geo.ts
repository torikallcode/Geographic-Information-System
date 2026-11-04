import type { FeatureCollection, GeoFeature, LayerStyle } from '../types';

export const GEOMETRY_TYPES = [
  'Point',
  'LineString',
  'Polygon',
  'MultiPoint',
  'MultiLineString',
  'MultiPolygon',
  'Geometry',
] as const;

export type GeometryType = (typeof GEOMETRY_TYPES)[number];

export function emptyFeatureCollection(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

export function asFeatureCollection(input: unknown): FeatureCollection {
  if (!input || typeof input !== 'object') {
    throw new Error('Berkas bukan GeoJSON yang valid.');
  }
  const obj = input as Record<string, unknown>;
  if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
    return { type: 'FeatureCollection', features: obj.features as GeoFeature[] };
  }
  if (obj.type === 'Feature') {
    return { type: 'FeatureCollection', features: [obj as unknown as GeoFeature] };
  }
  if (typeof obj.type === 'string' && 'coordinates' in obj) {
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: obj as unknown as GeoFeature['geometry'], properties: {} }],
    };
  }
  throw new Error('GeoJSON harus berupa FeatureCollection, Feature, atau Geometry.');
}

export function parseBbox(value: unknown): [number, number, number, number] | null {
  if (!value) return null;
  if (Array.isArray(value) && value.length === 4 && value.every((n) => typeof n === 'number')) {
    return value as [number, number, number, number];
  }
  if (typeof value === 'string') {
    const match = value.match(/BOX\(([-\d.]+) ([-\d.]+),([-\d.]+) ([-\d.]+)\)/i);
    if (match) {
      return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
    }
  }
  return null;
}

export function filterHiddenAttributes(
  attributes: Record<string, unknown> | null | undefined,
  hidden: unknown,
): Record<string, unknown> {
  if (!attributes) return {};
  const hiddenKeys = Array.isArray(hidden) ? hidden.map(String) : [];
  if (hiddenKeys.length === 0) return attributes;
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (!hiddenKeys.includes(key)) filtered[key] = value;
  }
  return filtered;
}

export function canonicalGeometryGroup(type: string | undefined | null): 'point' | 'line' | 'polygon' | 'other' {
  if (!type) return 'other';
  const normalized = type.replace(/^Multi/, '');
  if (normalized === 'Point') return 'point';
  if (normalized === 'LineString') return 'line';
  if (normalized === 'Polygon') return 'polygon';
  return 'other';
}

export function resolveGeometryType(types: string[]): GeometryType {
  const unique = [...new Set(types.filter(Boolean))];
  if (unique.length === 0) return 'Geometry';
  if (unique.length === 1) {
    const type = unique[0];
    if ((GEOMETRY_TYPES as readonly string[]).includes(type)) return type as GeometryType;
    return 'Geometry';
  }
  return 'Geometry';
}

export function ensureFid(value: unknown, fallbackIndex: number): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return `f-${fallbackIndex + 1}`;
}

export function normalizeStyle(style: unknown): LayerStyle {
  const raw = (style && typeof style === 'object' ? style : {}) as LayerStyle;
  return {
    fillColor: raw.fillColor ?? '#2f7d5a',
    fillOpacity: typeof raw.fillOpacity === 'number' ? raw.fillOpacity : 0.65,
    lineColor: raw.lineColor ?? '#1f5c43',
    lineWidth: typeof raw.lineWidth === 'number' ? raw.lineWidth : 1.5,
    lineOpacity: typeof raw.lineOpacity === 'number' ? raw.lineOpacity : 0.9,
    circleColor: raw.circleColor ?? '#1f5c43',
    circleRadius: typeof raw.circleRadius === 'number' ? raw.circleRadius : 6,
    circleStrokeColor: raw.circleStrokeColor ?? '#ffffff',
    ...(raw.classification ? { classification: raw.classification } : {}),
  };
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function randomSuffix(length = 6): string {
  return Math.random().toString(36).slice(2, 2 + length);
}
