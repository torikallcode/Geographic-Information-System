import * as turf from '@turf/turf';
import type { FeatureCollection, GeoFeature, ValidationIssue, ValidationResult } from '../types';
import { canonicalGeometryGroup, ensureFid } from '../utils/geo';
import { findOutOfBoundsCoordinate } from './crs';

const ALLOWED_TYPES = new Set([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
  'GeometryCollection',
]);

interface ValidateOptions {
  expectedType?: string | null;
  maxIssues?: number;
}

function isValidPosition(coords: unknown): boolean {
  if (!Array.isArray(coords) || coords.length < 2) return false;
  return typeof coords[0] === 'number' && typeof coords[1] === 'number' && Number.isFinite(coords[0]) && Number.isFinite(coords[1]);
}

function validateCoordinates(type: string, coordinates: unknown, addIssue: (code: string, message: string, index: number) => void, index: number): void {
  switch (type) {
    case 'Point':
      if (!isValidPosition(coordinates)) addIssue('invalid_coordinates', 'Koordinat titik tidak valid.', index);
      break;
    case 'MultiPoint':
      if (!Array.isArray(coordinates) || coordinates.length === 0) addIssue('invalid_coordinates', 'MultiPoint tidak memiliki koordinat.', index);
      else if (!coordinates.every(isValidPosition)) addIssue('invalid_coordinates', 'Sebagian koordinat titik tidak valid.', index);
      break;
    case 'LineString':
      if (!Array.isArray(coordinates) || coordinates.length < 2) addIssue('invalid_line', 'Garis memerlukan minimal dua titik.', index);
      else if (!coordinates.every(isValidPosition)) addIssue('invalid_coordinates', 'Sebagian koordinat garis tidak valid.', index);
      break;
    case 'MultiLineString':
      if (!Array.isArray(coordinates) || coordinates.length === 0) addIssue('invalid_line', 'MultiLineString tidak memiliki garis.', index);
      else (coordinates as unknown[]).forEach((line) => {
        if (!Array.isArray(line) || line.length < 2 || !line.every(isValidPosition)) {
          addIssue('invalid_line', 'Sebagian garis tidak valid atau kurang dari dua titik.', index);
        }
      });
      break;
    case 'Polygon':
    case 'MultiPolygon': {
      if (!Array.isArray(coordinates) || coordinates.length === 0) {
        addIssue('invalid_polygon', 'Poligon tidak memiliki cincin.', index);
        break;
      }
      const rings = type === 'Polygon' ? (coordinates as unknown[]) : (coordinates as unknown[]).flat();
      for (const ring of rings as unknown[]) {
        if (!Array.isArray(ring) || ring.length < 4) {
          addIssue('invalid_ring', 'Cincin poligon memerlukan minimal empat koordinat.', index);
          continue;
        }
        if (!ring.every(isValidPosition)) {
          addIssue('invalid_coordinates', 'Sebagian koordinat poligon tidak valid.', index);
          continue;
        }
        const first = ring[0] as number[];
        const last = ring[ring.length - 1] as number[];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          addIssue('ring_not_closed', 'Cincin poligon tidak tertutup (koordinat awal dan akhir harus sama).', index);
        }
      }
      break;
    }
    default:
      addIssue('unsupported_geometry', `Tipe geometri ${type} tidak didukung.`, index);
  }
}

function tryBooleanValid(feature: GeoFeature): boolean {
  try {
    return turf.booleanValid(feature as never);
  } catch {
    return true;
  }
}

function tryKinks(feature: GeoFeature): number {
  try {
    if (feature.geometry?.type !== 'Polygon' && feature.geometry?.type !== 'MultiPolygon') return 0;
    const result = turf.kinks(feature as never);
    return result.features.length;
  } catch {
    return 0;
  }
}

function tryArea(feature: GeoFeature): number {
  try {
    return turf.area(feature as never) / 1_000_000;
  } catch {
    return 0;
  }
}

function tryLengthKm(feature: GeoFeature): number {
  try {
    if (feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString') {
      return turf.length(feature as never, { units: 'kilometers' });
    }
    return 0;
  } catch {
    return 0;
  }
}

function geometryTypeOf(feature: GeoFeature): string {
  return feature.geometry?.type ?? 'None';
}

export function validateFeatureCollection(fc: FeatureCollection, options: ValidateOptions = {}): ValidationResult {
  const maxIssues = options.maxIssues ?? 100;
  const issues: ValidationIssue[] = [];
  const geometryTypes = new Set<string>();
  let totalAreaKm2 = 0;
  let totalLengthKm = 0;
  let vertexCount = 0;
  const seenFids = new Set<string>();

  const addIssue = (severity: ValidationIssue['severity'], code: string, message: string, featureIndex?: number) => {
    if (issues.length >= maxIssues) return;
    issues.push({ severity, code, message, ...(featureIndex !== undefined ? { featureIndex } : {}) });
  };

  if (!Array.isArray(fc.features) || fc.features.length === 0) {
    addIssue('error', 'empty_layer', 'Layer tidak memiliki fitur.');
    return { valid: false, issues, featureCount: 0, geometryTypes: [], totalAreaM2: 0, totalLengthKm: 0, vertexCount: 0 };
  }

  const expectedGroup = options.expectedType ? canonicalGeometryGroup(options.expectedType) : null;

  fc.features.forEach((feature, index) => {
    if (!feature || feature.type !== 'Feature') {
      addIssue('error', 'invalid_feature', 'Objek bukan Feature GeoJSON yang valid.', index);
      return;
    }
    if (!feature.geometry) {
      addIssue('error', 'empty_geometry', 'Fitur tidak memiliki geometri.', index);
      return;
    }
    const type = geometryTypeOf(feature);
    geometryTypes.add(type);
    if (!ALLOWED_TYPES.has(type)) {
      addIssue('error', 'unsupported_geometry', `Tipe geometri ${type} tidak didukung.`, index);
      return;
    }

    const fid = ensureFid(feature.id ?? (feature.properties as Record<string, unknown> | null)?.fid, index);
    if (seenFids.has(fid)) {
      addIssue('error', 'duplicate_fid', `ID fitur "${fid}" duplikat. Setiap fitur harus memiliki ID unik.`, index);
    }
    seenFids.add(fid);

    if (expectedGroup && expectedGroup !== 'other') {
      const actualGroup = canonicalGeometryGroup(type);
      if (actualGroup !== expectedGroup && type !== 'GeometryCollection') {
        addIssue('error', 'mixed_geometry', `Geometri ${type} tidak sesuai dengan tipe layer (${options.expectedType}).`, index);
      }
    }

    validateCoordinates(feature.geometry.type, feature.geometry.coordinates, (code, message, idx) => addIssue('error', code, message, idx), index);

    const outOfBounds = findOutOfBoundsCoordinate(feature.geometry.coordinates);
    if (outOfBounds) {
      addIssue(
        'error',
        'out_of_bounds',
        `Koordinat [${outOfBounds[0]}, ${outOfBounds[1]}] berada di luar rentang WGS84. Periksa sistem koordinat sumber.`,
        index,
      );
    }

    if (type === 'Polygon' || type === 'MultiPolygon') {
      if (!tryBooleanValid(feature)) {
        addIssue('error', 'invalid_geometry', 'Geometri poligon tidak valid (mis. batas bersilangan).', index);
      } else if (tryKinks(feature) > 0) {
        addIssue('error', 'self_intersection', 'Poligon memiliki persilangan batas (self-intersection).', index);
      }
    }

    const properties = feature.properties;
    if (!properties || Object.keys(properties).length === 0) {
      addIssue('warning', 'empty_attributes', 'Fitur tidak memiliki atribut.', index);
    }

    totalAreaKm2 += tryArea(feature);
    totalLengthKm += tryLengthKm(feature);
    vertexCount += countVertices(feature.geometry.coordinates);
  });

  if (geometryTypes.size > 1) {
    addIssue('warning', 'mixed_geometry_types', `Layer memuat lebih dari satu tipe geometri: ${[...geometryTypes].join(', ')}.`);
  }

  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues,
    featureCount: fc.features.length,
    geometryTypes: [...geometryTypes],
    totalAreaM2: totalAreaKm2 * 1_000_000,
    totalLengthKm,
    vertexCount,
  };
}

function countVertices(coords: unknown): number {
  if (!Array.isArray(coords)) return 0;
  if (typeof coords[0] === 'number') return 1;
  return coords.reduce<number>((sum, child) => sum + countVertices(child), 0);
}
