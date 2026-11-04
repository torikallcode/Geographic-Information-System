import * as turf from '@turf/turf';
import type { FeatureCollection, GeoFeature } from '../types';

export interface CollectionSummary {
  featureCount: number;
  areaM2: number;
  lengthKm: number;
  vertexCount: number;
  geometryTypes: string[];
}

export interface CollectionDiff {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  addedIds: string[];
  removedIds: string[];
  modifiedIds: string[];
}

function featureHash(feature: GeoFeature): string {
  return JSON.stringify({ geometry: feature.geometry, properties: feature.properties ?? {} });
}

function featureId(feature: GeoFeature, index: number): string {
  if (feature.id !== undefined && feature.id !== null) return String(feature.id);
  const props = feature.properties ?? {};
  if (props.fid !== undefined) return String(props.fid);
  return `index-${index}`;
}

export function summarizeCollection(fc: FeatureCollection): CollectionSummary {
  let areaM2 = 0;
  let lengthKm = 0;
  let vertexCount = 0;
  const types = new Set<string>();

  const countVertices = (coords: unknown): number => {
    if (!Array.isArray(coords)) return 0;
    if (typeof coords[0] === 'number') return 1;
    return coords.reduce<number>((sum, child) => sum + countVertices(child), 0);
  };

  for (const feature of fc.features) {
    if (feature.geometry) {
      types.add(feature.geometry.type);
      vertexCount += countVertices(feature.geometry.coordinates);
      try {
        if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
          areaM2 += turf.area(feature as never);
        }
        if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') {
          lengthKm += turf.length(feature as never, { units: 'kilometers' });
        }
      } catch {
        // geometri tidak valid, lewati perhitungan
      }
    }
  }

  return { featureCount: fc.features.length, areaM2, lengthKm, vertexCount, geometryTypes: [...types] };
}

export function compareCollections(previous: FeatureCollection, current: FeatureCollection): CollectionDiff {
  const previousMap = new Map<string, string>();
  previous.features.forEach((feature, index) => previousMap.set(featureId(feature, index), featureHash(feature)));

  const currentIds = new Set<string>();
  const addedIds: string[] = [];
  const modifiedIds: string[] = [];
  let unchanged = 0;

  current.features.forEach((feature, index) => {
    const id = featureId(feature, index);
    currentIds.add(id);
    const previousHash = previousMap.get(id);
    if (previousHash === undefined) {
      addedIds.push(id);
    } else if (previousHash !== featureHash(feature)) {
      modifiedIds.push(id);
    } else {
      unchanged += 1;
    }
  });

  const removedIds = [...previousMap.keys()].filter((id) => !currentIds.has(id));

  return {
    added: addedIds.length,
    removed: removedIds.length,
    modified: modifiedIds.length,
    unchanged,
    addedIds: addedIds.slice(0, 50),
    removedIds: removedIds.slice(0, 50),
    modifiedIds: modifiedIds.slice(0, 50),
  };
}
