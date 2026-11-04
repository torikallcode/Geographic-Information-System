import { describe, expect, it } from 'vitest';
import { reprojectFeatureCollection, CRS_OPTIONS, isSupportedCrs } from '../src/services/crs';
import type { FeatureCollection } from '../src/types';

function pointCollection(coordinates: [number, number]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates }, properties: {} }],
  };
}

describe('CRS', () => {
  it('menyediakan opsi UTM Indonesia dan WGS84', () => {
    expect(isSupportedCrs('EPSG:4326')).toBe(true);
    expect(isSupportedCrs('EPSG:32748')).toBe(true);
    expect(CRS_OPTIONS.some((option) => option.code === 'EPSG:32754')).toBe(true);
    expect(isSupportedCrs('EPSG:9999')).toBe(false);
  });

  it('mentransformasi UTM 48S ke WGS84', () => {
    const result = reprojectFeatureCollection(pointCollection([787000, 9233000]), 'EPSG:32748');
    const [lon, lat] = result.features[0].geometry!.coordinates as [number, number];
    expect(lon).toBeGreaterThan(107.5);
    expect(lon).toBeLessThan(107.7);
    expect(lat).toBeGreaterThan(-7.0);
    expect(lat).toBeLessThan(-6.8);
  });

  it('tidak mengubah data yang sudah WGS84', () => {
    const source = pointCollection([107.6191, -6.9175]);
    const result = reprojectFeatureCollection(source, 'EPSG:4326');
    expect(result).toBe(source);
  });
});
