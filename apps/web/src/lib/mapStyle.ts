import type { LayerSpecification, RasterSourceSpecification, StyleSpecification } from 'maplibre-gl';
import type { Layer } from './types';

export type BasemapId = 'streets' | 'satellite' | 'light';

export interface BasemapDefinition {
  id: BasemapId;
  label: { id: string; en: string };
  tiles: string[];
  attribution: string;
}

export const BASEMAPS: Record<BasemapId, BasemapDefinition> = {
  streets: {
    id: 'streets',
    label: { id: 'Jalan', en: 'Streets' },
    tiles: [
      'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
    ],
    attribution: '© OpenStreetMap contributors',
  },
  satellite: {
    id: 'satellite',
    label: { id: 'Citra Satelit', en: 'Satellite' },
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics',
  },
  light: {
    id: 'light',
    label: { id: 'Terang', en: 'Light' },
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
    attribution: 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors',
  },
};

export function buildMapStyle(active: BasemapId = 'streets'): StyleSpecification {
  const sources: Record<string, RasterSourceSpecification> = {};
  const layers: LayerSpecification[] = [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#eef2ee' },
    },
  ];

  for (const basemap of Object.values(BASEMAPS)) {
    sources[`basemap-${basemap.id}`] = {
      type: 'raster',
      tiles: basemap.tiles,
      tileSize: 256,
      maxzoom: 19,
      attribution: basemap.attribution,
    };
    layers.push({
      id: `basemap-${basemap.id}`,
      type: 'raster',
      source: `basemap-${basemap.id}`,
      layout: { visibility: basemap.id === active ? 'visible' : 'none' },
    });
  }

  return { version: 8, sources, layers };
}

export function setBasemapVisibility(map: import('maplibre-gl').Map, active: BasemapId): void {
  for (const basemap of Object.values(BASEMAPS)) {
    if (map.getLayer(`basemap-${basemap.id}`)) {
      map.setLayoutProperty(`basemap-${basemap.id}`, 'visibility', basemap.id === active ? 'visible' : 'none');
    }
  }
}

export function sourceIdForLayer(layerId: string): string {
  return `gis-src-${layerId}`;
}

export function mapLayerIds(layerId: string): string[] {
  return [`gis-fill-${layerId}`, `gis-line-${layerId}`, `gis-circle-${layerId}`];
}

function colorExpression(layer: Layer, fallback: string): unknown {
  const classification = layer.style?.classification;
  if (!classification || classification.classes.length === 0) return fallback;
  const expression: unknown[] = ['match', ['get', classification.field]];
  for (const item of classification.classes) {
    expression.push(item.value, item.color);
  }
  expression.push(classification.fallbackColor ?? fallback);
  return expression;
}

export function buildGisLayers(layer: Layer, opacity = 1): LayerSpecification[] {
  const style = layer.style ?? {};
  const geometry = layer.geometry_type;
  const fillColor = colorExpression(layer, style.fillColor ?? '#2f7d5a');
  const circleColor = colorExpression(layer, style.circleColor ?? '#1f6feb');
  const ids = mapLayerIds(layer.id);
  const layers: LayerSpecification[] = [];

  if (geometry === 'Polygon' || geometry === 'MultiPolygon' || geometry === 'Geometry') {
    layers.push({
      id: ids[0],
      type: 'fill',
      source: sourceIdForLayer(layer.id),
      'source-layer': 'features',
      paint: {
        'fill-color': fillColor as never,
        'fill-opacity': Math.min(1, Math.max(0, (style.fillOpacity ?? 0.6) * opacity)),
      },
    });
    layers.push({
      id: ids[1],
      type: 'line',
      source: sourceIdForLayer(layer.id),
      'source-layer': 'features',
      paint: {
        'line-color': style.lineColor ?? '#1b4d38',
        'line-width': style.lineWidth ?? 1.2,
        'line-opacity': Math.min(1, Math.max(0, (style.lineOpacity ?? 0.9) * opacity)),
      },
    });
  }

  if (geometry === 'LineString' || geometry === 'MultiLineString') {
    layers.push({
      id: ids[1],
      type: 'line',
      source: sourceIdForLayer(layer.id),
      'source-layer': 'features',
      paint: {
        'line-color': style.lineColor ?? '#37474f',
        'line-width': style.lineWidth ?? 2,
        'line-opacity': Math.min(1, Math.max(0, (style.lineOpacity ?? 0.9) * opacity)),
      },
    });
  }

  if (geometry === 'Point' || geometry === 'MultiPoint' || geometry === 'Geometry') {
    layers.push({
      id: ids[2],
      type: 'circle',
      source: sourceIdForLayer(layer.id),
      'source-layer': 'features',
      paint: {
        'circle-color': circleColor as never,
        'circle-radius': style.circleRadius ?? 6,
        'circle-stroke-color': style.circleStrokeColor ?? '#ffffff',
        'circle-stroke-width': 1.5,
        'circle-opacity': opacity,
        'circle-stroke-opacity': opacity,
      },
    });
  }

  return layers;
}

export function interactiveLayerIds(layers: Layer[]): string[] {
  const ids: string[] = [];
  for (const layer of layers) {
    for (const id of mapLayerIds(layer.id)) ids.push(id);
  }
  return ids;
}

export function layerIdFromMapLayer(mapLayer: string): string | null {
  const match = mapLayer.match(/^gis-(?:fill|line|circle)-(.+)$/);
  return match?.[1] ?? null;
}

export function primaryValue(layer: Layer, properties: Record<string, unknown>): string {
  const candidates = ['nama', 'name', 'zona', 'kecamatan', 'sungai', 'subzona', 'kode', 'id'];
  for (const key of candidates) {
    const value = properties[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value);
  }
  return layer.name;
}
