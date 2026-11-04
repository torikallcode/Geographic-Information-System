export interface CrsOption {
  code: string;
  label: string;
}

const UTM_ZONES = Array.from({ length: 9 }, (_, index) => 46 + index);

export const CRS_OPTIONS: CrsOption[] = [
  { code: 'EPSG:4326', label: 'WGS 84 / geografis (EPSG:4326)' },
  { code: 'EPSG:3857', label: 'Web Mercator (EPSG:3857)' },
  ...UTM_ZONES.map((zone) => ({
    code: `EPSG:${32700 + zone}`,
    label: `WGS 84 / UTM zona ${zone}S (EPSG:${32700 + zone})`,
  })),
];
