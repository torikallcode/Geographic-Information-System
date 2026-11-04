import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import { kml as kmlToGeoJSON } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';
import shp from 'shpjs';
import { env } from '../env';
import type { FeatureCollection, GeoFeature, ValidationResult } from '../types';
import { asFeatureCollection, ensureFid, resolveGeometryType } from '../utils/geo';
import { reprojectFeatureCollection } from './crs';
import { validateFeatureCollection } from './validation';

export interface ParsedImport {
  geojson: FeatureCollection;
  featureCount: number;
  fields: string[];
  geometryType: ReturnType<typeof resolveGeometryType>;
  geometryTypes: string[];
  detectedCrs: string;
  validation: ValidationResult;
  warnings: string[];
  bbox: [number, number, number, number] | null;
}

const LAT_ALIASES = ['lat', 'latitude', 'lintang', 'y', 'northing'];
const LON_ALIASES = ['lon', 'lng', 'long', 'longitude', 'bujur', 'x', 'easting'];

function normalizeFeatures(fc: FeatureCollection): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features
      .filter((feature): feature is GeoFeature => Boolean(feature) && feature.type === 'Feature')
      .map((feature, index) => ({
        ...feature,
        id: ensureFid(feature.id ?? (feature.properties as Record<string, unknown> | null)?.id, index),
        properties: feature.properties && typeof feature.properties === 'object' ? feature.properties : {},
      })),
  };
}

function mergeShapefileResults(result: GeoJSON.FeatureCollection | GeoJSON.FeatureCollection[]): FeatureCollection {
  if (Array.isArray(result)) {
    const features: GeoFeature[] = [];
    for (const collection of result) {
      features.push(...((collection.features ?? []) as GeoFeature[]));
    }
    return { type: 'FeatureCollection', features };
  }
  return { type: 'FeatureCollection', features: (result.features ?? []) as GeoFeature[] };
}

function parseCoordinateNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function coerceValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const number = Number(trimmed);
    if (Number.isFinite(number)) return number;
  }
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
  return value;
}

function parseCsvToGeoJson(buffer: Buffer): { geojson: FeatureCollection; warnings: string[] } {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const records = parseCsv(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  if (records.length === 0) throw new Error('CSV tidak memiliki baris data.');

  const headers = Object.keys(records[0]);
  const lowerHeaders = headers.map((header) => header.toLowerCase());
  const findHeader = (aliases: string[]) => headers[lowerHeaders.findIndex((header) => aliases.includes(header))];

  let latKey: string | undefined = findHeader(LAT_ALIASES);
  let lonKey: string | undefined = findHeader(LON_ALIASES);

  if (!latKey || !lonKey) {
    latKey = headers.find((header) => /lat|lintang|northing/i.test(header));
    lonKey = headers.find((header) => /lon|lng|longitude|bujur|easting/i.test(header) && header !== latKey);
  }

  if (!latKey || !lonKey) {
    throw new Error(
      'Kolom koordinat tidak ditemukan. Sertakan kolom lintang/bujur, misalnya "lat" dan "lon", atau "latitude" dan "longitude".',
    );
  }

  const features: GeoFeature[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  records.forEach((record, index) => {
    const lat = parseCoordinateNumber(record[latKey!]);
    const lon = parseCoordinateNumber(record[lonKey!]);
    if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      skipped += 1;
      return;
    }
    const properties: Record<string, unknown> = {};
    for (const header of headers) properties[header] = coerceValue(record[header] ?? '');
    const explicitId = record.id ?? record.fid ?? record.ID;
    features.push({
      type: 'Feature',
      id: explicitId ? String(explicitId) : `csv-${index + 1}`,
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties,
    });
  });

  if (skipped > 0) warnings.push(`${skipped} baris dilewati karena koordinat tidak valid atau kosong.`);
  if (features.length === 0) throw new Error('Tidak ada baris CSV dengan koordinat yang valid.');

  return { geojson: { type: 'FeatureCollection', features }, warnings };
}

function collectFields(fc: FeatureCollection): string[] {
  const fields = new Set<string>();
  for (const feature of fc.features) {
    if (!feature.properties) continue;
    for (const key of Object.keys(feature.properties)) fields.add(key);
  }
  return [...fields].sort((a, b) => a.localeCompare(b));
}

function computeBbox(fc: FeatureCollection): [number, number, number, number] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const visit = (coords: unknown) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      minX = Math.min(minX, coords[0]);
      minY = Math.min(minY, coords[1]);
      maxX = Math.max(maxX, coords[0]);
      maxY = Math.max(maxY, coords[1]);
      return;
    }
    for (const child of coords) visit(child);
  };

  for (const feature of fc.features) visit(feature.geometry?.coordinates);
  if (!Number.isFinite(minX)) return null;
  return [minX, minY, maxX, maxY];
}

export async function parseImportBuffer(
  buffer: Buffer,
  filename: string,
  sourceCrs = 'EPSG:4326',
): Promise<ParsedImport> {
  const extension = path.extname(filename).toLowerCase();
  const warnings: string[] = [];
  let detectedCrs = 'EPSG:4326';
  let raw: FeatureCollection;

  const isZip = extension === '.zip' || (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b);

  if (isZip) {
    const parsed = await shp.parseZip(buffer as unknown as ArrayBuffer);
    raw = mergeShapefileResults(parsed);
    detectedCrs = 'EPSG:4326 (dari .prj Shapefile, jika tersedia)';
    warnings.push('Shapefile dibaca dengan pustaka shpjs. Bila .prj tidak ada, pilih sistem koordinat sumber secara manual.');
  } else if (extension === '.kml') {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const document = new DOMParser().parseFromString(text, 'text/xml');
    raw = kmlToGeoJSON(document as never) as unknown as FeatureCollection;
  } else if (extension === '.csv') {
    const csv = parseCsvToGeoJson(buffer);
    raw = csv.geojson;
    warnings.push(...csv.warnings);
  } else if (extension === '.json' || extension === '.geojson') {
    let json: unknown;
    try {
      json = JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, ''));
    } catch {
      throw new Error('Berkas JSON tidak dapat dibaca. Pastikan formatnya GeoJSON yang valid.');
    }
    raw = asFeatureCollection(json);
  } else {
    throw new Error('Format berkas tidak didukung. Gunakan GeoJSON, Shapefile (.zip), KML, atau CSV.');
  }

  if (!raw || !Array.isArray(raw.features)) throw new Error('Berkas tidak memuat fitur yang dapat dibaca.');

  let geojson = normalizeFeatures(raw);

  if (sourceCrs && sourceCrs !== 'EPSG:4326' && !isZip) {
    warnings.push(`Koordinat ditransformasi dari ${sourceCrs} ke WGS84 (EPSG:4326).`);
    geojson = reprojectFeatureCollection(geojson, sourceCrs);
    detectedCrs = sourceCrs;
  }

  const validation = validateFeatureCollection(geojson, { maxIssues: 100 });
  const geometryTypes = validation.geometryTypes;

  return {
    geojson,
    featureCount: geojson.features.length,
    fields: collectFields(geojson),
    geometryType: resolveGeometryType(geometryTypes),
    geometryTypes,
    detectedCrs,
    validation,
    warnings,
    bbox: computeBbox(geojson),
  };
}

export interface StoredImport {
  id: string;
  filename: string;
  createdAt: string;
  sourceCrs: string;
  geojson: FeatureCollection;
}

export function importsDirectory(): string {
  return path.resolve(env.UPLOAD_DIR, 'imports');
}

export async function ensureUploadDirectories(): Promise<void> {
  await fs.mkdir(importsDirectory(), { recursive: true });
}

export async function persistImport(importId: string, filename: string, sourceCrs: string, geojson: FeatureCollection): Promise<void> {
  await ensureUploadDirectories();
  const payload: StoredImport = {
    id: importId,
    filename,
    createdAt: new Date().toISOString(),
    sourceCrs,
    geojson,
  };
  await fs.writeFile(path.join(importsDirectory(), `${importId}.json`), JSON.stringify(payload), 'utf8');
}

export async function readImport(importId: string): Promise<StoredImport> {
  if (!/^[a-f0-9-]{36}$/i.test(importId)) throw new Error('ID impor tidak valid.');
  const file = path.join(importsDirectory(), `${importId}.json`);
  const text = await fs.readFile(file, 'utf8');
  return JSON.parse(text) as StoredImport;
}

export async function cleanupOldImports(maxAgeHours = 24): Promise<void> {
  try {
    const dir = importsDirectory();
    const entries = await fs.readdir(dir);
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    await Promise.all(
      entries.map(async (entry) => {
        const file = path.join(dir, entry);
        const stat = await fs.stat(file);
        if (stat.mtimeMs < cutoff) await fs.unlink(file).catch(() => undefined);
      }),
    );
  } catch {
    // folder belum ada, abaikan
  }
}
