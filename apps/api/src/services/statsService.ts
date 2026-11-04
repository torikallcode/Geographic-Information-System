import * as turf from '@turf/turf';
import type { FeatureCollection } from '../types';
import type { ReportCategoryRow } from './report';

export function pickStatsField(fc: FeatureCollection, preferred?: string | null): string | null {
  if (preferred) return preferred;
  const keys = new Set<string>();
  for (const feature of fc.features.slice(0, 25)) {
    for (const key of Object.keys(feature.properties ?? {})) keys.add(key);
  }
  const preferredKeys = ['kategori', 'zona', 'jenis', 'fungsi', 'name', 'nama', 'kecamatan', 'kelurahan'];
  for (const key of preferredKeys) {
    const found = [...keys].find((candidate) => candidate.toLowerCase() === key);
    if (found) return found;
  }
  return [...keys][0] ?? null;
}

export function computeFieldStatistics(fc: FeatureCollection, field: string | null): ReportCategoryRow[] {
  if (!field) return [];
  const groups = new Map<string, ReportCategoryRow>();

  for (const feature of fc.features) {
    const raw = (feature.properties ?? {})[field];
    const key = raw === null || raw === undefined || raw === '' ? '(kosong)' : String(raw);
    const row = groups.get(key) ?? { category: key, featureCount: 0, areaM2: 0, lengthKm: 0 };
    row.featureCount += 1;
    try {
      if (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon') {
        row.areaM2 += turf.area(feature as never);
      }
      if (feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString') {
        row.lengthKm = (row.lengthKm ?? 0) + turf.length(feature as never, { units: 'kilometers' });
      }
    } catch {
      // lewati geometri yang gagal dihitung
    }
    groups.set(key, row);
  }

  return [...groups.values()].sort((a, b) => b.featureCount - a.featureCount).slice(0, 40);
}
