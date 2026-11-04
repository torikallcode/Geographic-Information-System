import { describe, expect, it } from 'vitest';
import { compareCollections, summarizeCollection } from '../src/services/versionCompare';
import type { FeatureCollection } from '../src/types';

function polygon(id: string, x: number, properties: Record<string, unknown> = {}): FeatureCollection['features'][number] {
  return {
    type: 'Feature',
    id,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [x, -6.9],
          [x + 0.01, -6.9],
          [x + 0.01, -6.91],
          [x, -6.91],
          [x, -6.9],
        ],
      ],
    },
    properties,
  };
}

describe('perbandingan versi', () => {
  it('meringkas jumlah fitur dan luas', () => {
    const fc: FeatureCollection = { type: 'FeatureCollection', features: [polygon('a', 107.6), polygon('b', 107.62)] };
    const summary = summarizeCollection(fc);
    expect(summary.featureCount).toBe(2);
    expect(summary.areaM2).toBeGreaterThan(0);
    expect(summary.vertexCount).toBe(10);
  });

  it('mendeteksi fitur ditambah, dihapus, diubah, dan tetap', () => {
    const previous: FeatureCollection = {
      type: 'FeatureCollection',
      features: [polygon('tetap', 107.6), polygon('ubah', 107.62), polygon('hapus', 107.64)],
    };
    const current: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        polygon('tetap', 107.6),
        polygon('ubah', 107.62, { kategori: 'baru' }),
        polygon('tambah', 107.66),
      ],
    };
    const diff = compareCollections(previous, current);
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(1);
    expect(diff.modified).toBe(1);
    expect(diff.unchanged).toBe(1);
    expect(diff.removedIds).toContain('hapus');
    expect(diff.addedIds).toContain('tambah');
  });
});
