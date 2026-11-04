import type { GeoFeature } from '../types';

export function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (typeof value === 'object') text = JSON.stringify(value);
  else text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function rowsToCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCsv).join(',')];
  for (const row of rows) lines.push(row.map(escapeCsv).join(','));
  return `\uFEFF${lines.join('\r\n')}`;
}

export function featuresToCsv(features: GeoFeature[]): string {
  const attributeKeys = new Set<string>();
  for (const feature of features) {
    for (const key of Object.keys(feature.properties ?? {})) attributeKeys.add(key);
  }
  const headers = ['fid', 'geometry_type', ...[...attributeKeys].sort((a, b) => a.localeCompare(b))];
  const rows = features.map((feature) => [
    feature.id ?? '',
    feature.geometry?.type ?? '',
    ...[...attributeKeys].sort((a, b) => a.localeCompare(b)).map((key) => (feature.properties ?? {})[key]),
  ]);
  return rowsToCsv(headers, rows);
}
