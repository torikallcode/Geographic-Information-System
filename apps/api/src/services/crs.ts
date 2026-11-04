import proj4 from 'proj4';
import type { FeatureCollection, GeoFeature } from '../types';

export interface CrsOption {
  code: string;
  label: string;
  definition?: string;
}

const UTM_ZONES = Array.from({ length: 9 }, (_, index) => 46 + index); // 46S - 54S (Indonesia)

for (const zone of UTM_ZONES) {
  const code = `EPSG:${32700 + zone}`;
  proj4.defs(code, `+proj=utm +zone=${zone} +south +datum=WGS84 +units=m +no_defs +type=crs`);
}

proj4.defs(
  'EPSG:3857',
  '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs',
);

export const CRS_OPTIONS: CrsOption[] = [
  { code: 'EPSG:4326', label: 'WGS 84 / geografis (EPSG:4326)' },
  { code: 'EPSG:3857', label: 'Web Mercator (EPSG:3857)' },
  ...UTM_ZONES.map((zone) => ({
    code: `EPSG:${32700 + zone}`,
    label: `WGS 84 / UTM zona ${zone}S (EPSG:${32700 + zone})`,
  })),
];

export function isSupportedCrs(code: string): boolean {
  return CRS_OPTIONS.some((option) => option.code === code);
}

function projDefinition(code: string): string {
  if (code === 'EPSG:4326') return 'EPSG:4326';
  const option = CRS_OPTIONS.find((item) => item.code === code);
  if (option?.definition) return option.definition;
  if (proj4.defs(code)) return code;
  throw new Error(`Sistem koordinat ${code} belum didukung.`);
}

function mapCoordinates(coords: unknown, project: (coord: number[]) => number[]): unknown {
  if (!Array.isArray(coords)) return coords;
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return project(coords as number[]);
  }
  return coords.map((child) => mapCoordinates(child, project));
}

export function reprojectFeatureCollection(fc: FeatureCollection, fromCrs: string, toCrs = 'EPSG:4326'): FeatureCollection {
  if (!fromCrs || fromCrs === toCrs || fromCrs === 'EPSG:4326') return fc;
  const from = projDefinition(fromCrs);
  const to = projDefinition(toCrs);
  const project = (coord: number[]): number[] => {
    const [x, y] = coord;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return coord;
    const [lon, lat] = proj4(from, to, [x, y]);
    return [Number(lon.toFixed(9)), Number(lat.toFixed(9)), ...coord.slice(2)];
  };

  const features: GeoFeature[] = fc.features.map((feature) => {
    if (!feature.geometry) return feature;
    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: mapCoordinates(feature.geometry.coordinates, project),
      },
    };
  });

  return { type: 'FeatureCollection', features };
}

export function findOutOfBoundsCoordinate(coords: unknown): [number, number] | null {
  if (!Array.isArray(coords)) return null;
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    const [x, y] = coords as number[];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [x, y];
    if (Math.abs(x) > 180.000001 || Math.abs(y) > 90.000001) return [x, y];
    return null;
  }
  for (const child of coords) {
    const found = findOutOfBoundsCoordinate(child);
    if (found) return found;
  }
  return null;
}
