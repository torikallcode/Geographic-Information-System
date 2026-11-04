import { describe, expect, it } from 'vitest';
import { validateFeatureCollection } from '../src/services/validation';
import type { FeatureCollection, GeoFeature } from '../src/types';

function feature(id: string, geometryType: string, coordinates: unknown, properties: Record<string, unknown> = { nama: id }): GeoFeature {
  return { type: 'Feature', id, geometry: { type: geometryType, coordinates }, properties };
}

function collection(features: GeoFeature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

const polygonRing = [
  [107.6, -6.93],
  [107.615, -6.93],
  [107.615, -6.918],
  [107.6, -6.918],
  [107.6, -6.93],
];

describe('validateFeatureCollection', () => {
  it('menerima poligon tertutup yang valid', () => {
    const result = validateFeatureCollection(collection([feature('p1', 'Polygon', [polygonRing])]), { expectedType: 'Polygon' });
    expect(result.valid).toBe(true);
    expect(result.featureCount).toBe(1);
    expect(result.totalAreaM2).toBeGreaterThan(0);
    expect(result.issues.filter((issue) => issue.severity === 'error')).toHaveLength(0);
  });

  it('menolak cincin poligon yang tidak tertutup', () => {
    const ring = polygonRing.slice(0, -1);
    const result = validateFeatureCollection(collection([feature('p1', 'Polygon', [ring])]), { expectedType: 'Polygon' });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'ring_not_closed')).toBe(true);
  });

  it('menolak poligon dengan cincin kurang dari empat koordinat', () => {
    const result = validateFeatureCollection(
      collection([feature('p1', 'Polygon', [[[107.6, -6.9], [107.61, -6.9], [107.6, -6.9]]])]),
      { expectedType: 'Polygon' },
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'invalid_ring')).toBe(true);
  });

  it('menolak koordinat di luar rentang WGS84', () => {
    const result = validateFeatureCollection(
      collection([feature('p1', 'Point', [787000, 9924000])]),
      { expectedType: 'Point' },
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'out_of_bounds')).toBe(true);
  });

  it('menolak geometri yang tidak sesuai dengan tipe layer', () => {
    const result = validateFeatureCollection(collection([feature('l1', 'LineString', [[107.6, -6.9], [107.61, -6.91]])]), {
      expectedType: 'Polygon',
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'mixed_geometry')).toBe(true);
  });

  it('menerima layer titik dan menghitung jumlah fitur', () => {
    const result = validateFeatureCollection(
      collection([feature('a', 'Point', [107.6, -6.9]), feature('b', 'Point', [107.61, -6.91])]),
      { expectedType: 'Point' },
    );
    expect(result.valid).toBe(true);
    expect(result.featureCount).toBe(2);
    expect(result.geometryTypes).toContain('Point');
  });

  it('menandai layer kosong sebagai tidak valid', () => {
    const result = validateFeatureCollection(collection([]));
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe('empty_layer');
  });

  it('menandai ID fitur duplikat', () => {
    const result = validateFeatureCollection(
      collection([feature('sama', 'Point', [107.6, -6.9]), feature('sama', 'Point', [107.61, -6.91])]),
      { expectedType: 'Point' },
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'duplicate_fid')).toBe(true);
  });
});
