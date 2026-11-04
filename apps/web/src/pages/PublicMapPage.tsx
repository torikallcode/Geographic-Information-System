import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type MapMouseEvent } from 'maplibre-gl';
import * as turf from '@turf/turf';
import { AlertCircle, Loader2 } from 'lucide-react';
import type {
  GeoFeature,
  Layer,
  LocationMatch,
  MapSelection,
  MeasureState,
  SelectedFeature,
} from '../lib/types';
import { api, apiUrl } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { formatArea, formatLength } from '../lib/format';
import {
  BASEMAPS,
  buildGisLayers,
  interactiveLayerIds,
  layerIdFromMapLayer,
  mapLayerIds,
  setBasemapVisibility,
  sourceIdForLayer,
  type BasemapId,
} from '../lib/mapStyle';
import { MapView } from '../components/MapView';
import { SiteHeader } from '../components/public/SiteHeader';
import { SearchBox } from '../components/public/SearchBox';
import { LayerPanel } from '../components/public/LayerPanel';
import { InfoPanel } from '../components/public/InfoPanel';
import { MapToolbar } from '../components/public/MapToolbar';
import { MeasurePanel } from '../components/public/MeasurePanel';
import { AboutModal } from '../components/public/AboutModal';

const DEFAULT_CENTER: [number, number] = [107.6191, -6.9175];
const DEFAULT_ZOOM = 13;
const MEASURE_SOURCE = 'measure-data';

interface InitialView {
  center: [number, number];
  zoom: number;
  layers: Set<string> | null;
  basemap: BasemapId;
}

function parseInitialView(): InitialView {
  const params = new URLSearchParams(window.location.search);
  const latParam = params.get('lat');
  const lngParam = params.get('lng');
  const zoomParam = params.get('z');
  const lat = latParam ? Number(latParam) : NaN;
  const lng = lngParam ? Number(lngParam) : NaN;
  const zoom = zoomParam ? Number(zoomParam) : NaN;
  const basemapParam = params.get('basemap');
  const layersParam = params.get('layers');

  const validCenter =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const basemap: BasemapId =
    basemapParam && basemapParam in BASEMAPS ? (basemapParam as BasemapId) : 'streets';

  return {
    center: validCenter ? [lng, lat] : DEFAULT_CENTER,
    zoom: Number.isFinite(zoom) && zoom >= 2 && zoom <= 21 ? zoom : DEFAULT_ZOOM,
    layers: layersParam !== null ? new Set(layersParam.split(',').filter(Boolean)) : null,
    basemap,
  };
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildMeasureFeatures(measure: MeasureState): GeoFeature[] {
  const features: GeoFeature[] = measure.points.map((point, index) => ({
    type: 'Feature',
    id: `vertex-${index}`,
    geometry: { type: 'Point', coordinates: point },
    properties: { vertex: index + 1 },
  }));

  if (measure.points.length >= 2) {
    if (measure.mode === 'area' && measure.points.length >= 3) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[...measure.points, measure.points[0]]] },
        properties: {},
      });
    } else {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: measure.points },
        properties: {},
      });
    }
  }
  return features;
}

function ensureMeasureLayers(map: MapLibreMap): void {
  if (!map.getSource(MEASURE_SOURCE)) {
    map.addSource(MEASURE_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!map.getLayer('measure-fill')) {
    map.addLayer({
      id: 'measure-fill',
      type: 'fill',
      source: MEASURE_SOURCE,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': '#d97706', 'fill-opacity': 0.18 },
    });
  }
  if (!map.getLayer('measure-line')) {
    map.addLayer({
      id: 'measure-line',
      type: 'line',
      source: MEASURE_SOURCE,
      filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
      paint: { 'line-color': '#d97706', 'line-width': 2.2, 'line-dasharray': [1.2, 1] },
    });
  }
  if (!map.getLayer('measure-points')) {
    map.addLayer({
      id: 'measure-points',
      type: 'circle',
      source: MEASURE_SOURCE,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-color': '#d97706',
        'circle-radius': 5,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });
  }
}

function renderMeasure(map: MapLibreMap, measure: MeasureState): void {
  ensureMeasureLayers(map);
  const source = map.getSource(MEASURE_SOURCE) as GeoJSONSource | undefined;
  source?.setData({ type: 'FeatureCollection', features: buildMeasureFeatures(measure) } as never);
}

export default function PublicMapPage() {
  const { t, lang } = useI18n();
  const { notify } = useToast();

  const initialRef = useRef<InitialView>(parseInitialView());
  const mapRef = useRef<MapLibreMap | null>(null);
  const layersRef = useRef<Layer[]>([]);
  const enabledRef = useRef<Record<string, boolean>>({});
  const opacityRef = useRef<Record<string, number>>({});
  const basemapRef = useRef<BasemapId>(initialRef.current.basemap);
  const measureRef = useRef<MeasureState>({ mode: null, points: [], finished: false });
  const finishMeasureRef = useRef<() => void>(() => undefined);
  const clickHandlerRef = useRef<(event: MapMouseEvent) => void>(() => undefined);
  const selectionRequestRef = useRef(0);

  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const [basemap, setBasemap] = useState<BasemapId>(initialRef.current.basemap);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [measure, setMeasure] = useState<MeasureState>({ mode: null, points: [], finished: false });
  const [layersOpen, setLayersOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const selectionMarkerRef = useRef<maplibregl.Marker | null>(null);
  const locateMarkerRef = useRef<maplibregl.Marker | null>(null);

  layersRef.current = layers;
  enabledRef.current = enabled;
  opacityRef.current = opacity;
  basemapRef.current = basemap;
  measureRef.current = measure;

  const loadLayers = useCallback(async () => {
    setStatus('loading');
    try {
      const response = await api.get<{ layers: Layer[] }>('/api/public/layers');
      setLayers(response.layers);
      setEnabled((current) => {
        const requested = initialRef.current.layers;
        const next: Record<string, boolean> = {};
        for (const layer of response.layers) {
          if (Object.keys(current).length > 0 && layer.id in current) {
            next[layer.id] = current[layer.id];
          } else {
            next[layer.id] = requested ? requested.has(layer.id) : layer.category === 'pola_ruang';
          }
        }
        return next;
      });
      setOpacity((current) => {
        const next: Record<string, number> = {};
        for (const layer of response.layers) next[layer.id] = current[layer.id] ?? 1;
        return next;
      });
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadLayers();
    void api.post('/api/public/visit', undefined, { auth: false }).catch(() => undefined);
  }, [loadLayers]);

  const updateUrl = useCallback(() => {
    const currentMap = mapRef.current;
    if (!currentMap) return;
    const center = currentMap.getCenter();
    const params = new URLSearchParams(window.location.search);
    params.set('lat', center.lat.toFixed(6));
    params.set('lng', center.lng.toFixed(6));
    params.set('z', currentMap.getZoom().toFixed(2));
    params.set('basemap', basemapRef.current);
    const layerIds = Object.entries(enabledRef.current)
      .filter(([, value]) => value)
      .map(([key]) => key);
    if (layerIds.length > 0) params.set('layers', layerIds.join(','));
    else params.delete('layers');
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }, []);

  const checkLocation = useCallback(async (lon: number, lat: number, feature: SelectedFeature | null) => {
    const requestId = ++selectionRequestRef.current;
    setSelection({ lngLat: [lon, lat], loading: true, matches: [], address: null, feature });
    try {
      const [locationResult, addressResult] = await Promise.allSettled([
        api.post<{ matches: LocationMatch[]; message?: string }>('/api/public/check-location', { lat, lon }),
        api.get<{ label: string | null }>(`/api/public/reverse?lat=${lat}&lon=${lon}`),
      ]);
      if (requestId !== selectionRequestRef.current) return;
      const matches = locationResult.status === 'fulfilled' ? locationResult.value.matches : [];
      setSelection({
        lngLat: [lon, lat],
        loading: false,
        matches,
        address: addressResult.status === 'fulfilled' ? addressResult.value.label : null,
        feature,
        outsideMessage: locationResult.status === 'fulfilled' ? locationResult.value.message ?? null : null,
        error:
          locationResult.status === 'rejected'
            ? 'Pemeriksaan lokasi gagal. Periksa koneksi lalu coba lagi.'
            : null,
      });
    } catch {
      if (requestId !== selectionRequestRef.current) return;
      setSelection({
        lngLat: [lon, lat],
        loading: false,
        matches: [],
        address: null,
        feature,
        error: 'Pemeriksaan lokasi gagal. Periksa koneksi lalu coba lagi.',
      });
    }
  }, []);

  const addMeasurePoint = useCallback((point: [number, number]) => {
    const currentMap = mapRef.current;
    const current = measureRef.current;
    if (!currentMap || !current.mode || current.finished) return;
    const next: MeasureState = { ...current, points: [...current.points, point] };
    measureRef.current = next;
    setMeasure(next);
    renderMeasure(currentMap, next);
  }, []);

  const handleMapClick = useCallback(
    (event: MapMouseEvent) => {
      const currentMap = mapRef.current;
      if (!currentMap) return;
      const currentMeasure = measureRef.current;
      if (currentMeasure.mode && !currentMeasure.finished) {
        addMeasurePoint([event.lngLat.lng, event.lngLat.lat]);
        return;
      }

      const activeLayers = layersRef.current.filter((layer) => enabledRef.current[layer.id]);
      const ids = interactiveLayerIds(activeLayers).filter((id) => Boolean(currentMap.getLayer(id)));
      let selected: SelectedFeature | null = null;
      if (ids.length > 0) {
        const rendered = currentMap.queryRenderedFeatures(event.point, { layers: ids });
        const first = rendered[0];
        if (first) {
          const layerId = layerIdFromMapLayer(first.layer.id);
          const layer = activeLayers.find((item) => item.id === layerId);
          if (layer && layerId) {
            selected = {
              layerId,
              layerName: layer.name,
              properties: (first.properties ?? {}) as Record<string, unknown>,
              attributeLabels: layer.attribute_labels ?? {},
            };
          }
        }
      }
      void checkLocation(event.lngLat.lng, event.lngLat.lat, selected);
    },
    [addMeasurePoint, checkLocation],
  );

  clickHandlerRef.current = handleMapClick;

  const finishMeasure = useCallback(() => {
    const currentMap = mapRef.current;
    const current = measureRef.current;
    if (!currentMap || !current.mode) return;
    let points = current.points;
    if (points.length >= 2) {
      const last = points[points.length - 1];
      const previous = points[points.length - 2];
      if (last[0] === previous[0] && last[1] === previous[1]) points = points.slice(0, -1);
    }
    const next: MeasureState = { ...current, points, finished: true };
    measureRef.current = next;
    setMeasure(next);
    renderMeasure(currentMap, next);
    currentMap.doubleClickZoom.enable();
    currentMap.getCanvas().style.cursor = '';
  }, []);
  finishMeasureRef.current = finishMeasure;

  const startMeasure = useCallback((mode: 'distance' | 'area') => {
    const currentMap = mapRef.current;
    if (!currentMap) return;
    const next: MeasureState = { mode, points: [], finished: false };
    measureRef.current = next;
    setMeasure(next);
    renderMeasure(currentMap, next);
    currentMap.doubleClickZoom.disable();
    currentMap.getCanvas().style.cursor = 'crosshair';
    setSelection(null);
  }, []);

  const clearMeasure = useCallback(() => {
    const currentMap = mapRef.current;
    const next: MeasureState = { mode: null, points: [], finished: false };
    measureRef.current = next;
    setMeasure(next);
    if (currentMap) {
      renderMeasure(currentMap, next);
      currentMap.doubleClickZoom.enable();
      currentMap.getCanvas().style.cursor = '';
    }
  }, []);

  const handleMapReady = useCallback(
    (readyMap: MapLibreMap) => {
      mapRef.current = readyMap;
      setMap(readyMap);
      readyMap.jumpTo({ center: initialRef.current.center, zoom: initialRef.current.zoom });
      readyMap.on('click', (event) => clickHandlerRef.current(event));
      readyMap.on('dblclick', () => {
        if (measureRef.current.mode && !measureRef.current.finished) finishMeasureRef.current();
      });
      readyMap.on('moveend', updateUrl);
      updateUrl();
    },
    [updateUrl],
  );

  useEffect(() => {
    if (!map) return;
    for (const layer of layers) {
      const sourceId = sourceIdForLayer(layer.id);
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'vector',
          tiles: [apiUrl(`/api/tiles/${layer.id}/{z}/{x}/{y}`)],
          minzoom: 0,
          maxzoom: 21,
          promoteId: 'fid',
        });
      }
      for (const spec of buildGisLayers(layer, opacityRef.current[layer.id] ?? 1)) {
        if (!map.getLayer(spec.id)) map.addLayer(spec);
      }
    }
  }, [map, layers]);

  useEffect(() => {
    if (!map) return;
    for (const layer of layers) {
      for (const id of mapLayerIds(layer.id)) {
        if (!map.getLayer(id)) continue;
        map.setLayoutProperty(id, 'visibility', enabled[layer.id] ? 'visible' : 'none');
      }
    }
  }, [map, layers, enabled]);

  useEffect(() => {
    if (!map) return;
    for (const layer of layers) {
      const multiplier = opacity[layer.id] ?? 1;
      const style = layer.style ?? {};
      const ids = mapLayerIds(layer.id);
      if (map.getLayer(ids[0])) {
        map.setPaintProperty(ids[0], 'fill-opacity', Math.min(1, Math.max(0, (style.fillOpacity ?? 0.6) * multiplier)));
      }
      if (map.getLayer(ids[1])) {
        map.setPaintProperty(ids[1], 'line-opacity', Math.min(1, Math.max(0, (style.lineOpacity ?? 0.9) * multiplier)));
      }
      if (map.getLayer(ids[2])) {
        map.setPaintProperty(ids[2], 'circle-opacity', multiplier);
        map.setPaintProperty(ids[2], 'circle-stroke-opacity', multiplier);
      }
    }
  }, [map, layers, opacity]);

  useEffect(() => {
    if (!map) return;
    setBasemapVisibility(map, basemap);
  }, [map, basemap]);

  useEffect(() => {
    updateUrl();
  }, [enabled, basemap, updateUrl]);

  useEffect(() => {
    const currentMap = mapRef.current;
    selectionMarkerRef.current?.remove();
    selectionMarkerRef.current = null;
    if (currentMap && selection) {
      selectionMarkerRef.current = new maplibregl.Marker({ color: '#d97706' })
        .setLngLat(selection.lngLat)
        .addTo(currentMap);
    }
    return () => {
      selectionMarkerRef.current?.remove();
      selectionMarkerRef.current = null;
    };
  }, [selection]);

  useEffect(() => {
    return () => {
      locateMarkerRef.current?.remove();
      selectionMarkerRef.current?.remove();
    };
  }, []);

  const measureValue = useMemo(() => {
    if (measure.points.length < 2) return '';
    try {
      if (measure.mode === 'area') {
        if (measure.points.length < 3) return '';
        const ring = [...measure.points, measure.points[0]];
        const polygon = turf.polygon([ring as [number, number][]]);
        return formatArea(turf.area(polygon));
      }
      const line = turf.lineString(measure.points as [number, number][]);
      return formatLength(turf.length(line, { units: 'kilometers' }));
    } catch {
      return '';
    }
  }, [measure]);

  const toggleLayer = useCallback((id: string, value: boolean) => {
    setEnabled((current) => ({ ...current, [id]: value }));
  }, []);

  const changeOpacity = useCallback((id: string, value: number) => {
    setOpacity((current) => ({ ...current, [id]: value }));
  }, []);

  const toggleAll = useCallback(
    (value: boolean) => {
      setEnabled(() => {
        const next: Record<string, boolean> = {};
        for (const layer of layersRef.current) next[layer.id] = value;
        return next;
      });
    },
    [],
  );

  const zoomToLayer = useCallback(
    (layer: Layer) => {
      const currentMap = mapRef.current;
      if (!currentMap) return;
      if (!layer.bbox) {
        notify('Layer ini belum memiliki batas wilayah yang dapat di-zoom.', 'info');
        return;
      }
      const [minX, minY, maxX, maxY] = layer.bbox;
      currentMap.fitBounds(
        [
          [minX, minY],
          [maxX, maxY],
        ],
        { padding: 80, maxZoom: 17, duration: 900 },
      );
    },
    [notify],
  );

  const share = useCallback(async () => {
    updateUrl();
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify(t('share.copied'), 'success');
    } catch {
      notify(t('share.failed'), 'error');
    }
  }, [notify, t, updateUrl]);

  const locate = useCallback(() => {
    const currentMap = mapRef.current;
    if (!currentMap) return;
    if (!navigator.geolocation) {
      notify('Perangkat tidak mendukung geolokasi.', 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        currentMap.flyTo({ center: [longitude, latitude], zoom: 16, essential: true });
        locateMarkerRef.current?.remove();
        locateMarkerRef.current = new maplibregl.Marker({ color: '#1f7a54' })
          .setLngLat([longitude, latitude])
          .addTo(currentMap);
      },
      () => notify('Lokasi tidak dapat diakses. Izinkan akses lokasi di peramban.', 'error'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [notify]);

  const printMap = useCallback(() => {
    const currentMap = mapRef.current;
    if (!currentMap) return;
    const enabledLayers = layersRef.current.filter((layer) => enabledRef.current[layer.id]);
    let image = '';
    try {
      image = currentMap.getCanvas().toDataURL('image/png');
    } catch {
      image = '';
    }
    const legendItems = enabledLayers.flatMap((layer) => {
      if (layer.legend.length > 0) return layer.legend.map((item) => ({ label: item.label, color: item.color }));
      const color =
        layer.style.fillColor ?? layer.style.lineColor ?? layer.style.circleColor ?? '#2f7d5a';
      return [{ label: layer.name, color }];
    });
    const legendHtml = legendItems
      .map(
        (item) =>
          `<li><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${escapeHtml(item.color)};margin-right:8px;vertical-align:middle"></span>${escapeHtml(item.label)}</li>`,
      )
      .join('');
    const zoneHtml = selection?.matches?.length
      ? `<section><h2>Zona pada titik terpilih</h2>${selection.matches
          .map(
            (match) =>
              `<p><strong>${escapeHtml(match.layer_name)}</strong> — ${escapeHtml(
                match.attributes.zona ?? match.attributes.nama ?? match.attributes.subzona ?? '',
              )}</p>`,
          )
          .join('')}<p style="color:#5b6f67;font-size:11px">${escapeHtml(
          selection.lngLat[1].toFixed(6),
        )}, ${escapeHtml(selection.lngLat[0].toFixed(6))}</p></section>`
      : '';

    const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${escapeHtml(
      t('print.title'),
    )}</title><style>
      *{box-sizing:border-box} body{font-family:"Segoe UI",Arial,sans-serif;color:#17332a;margin:32px}
      header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1f7a54;padding-bottom:14px;margin-bottom:18px}
      h1{font-size:22px;margin:0 0 4px} .muted{color:#5b6f67;font-size:12px}
      .map{width:100%;border:1px solid #d7e2dc;border-radius:8px;overflow:hidden;margin-bottom:18px}
      .map img{width:100%;display:block}
      section{margin-bottom:18px} h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#5b6f67;margin:0 0 8px}
      ul{list-style:none;padding:0;margin:0;columns:2;font-size:12px} li{margin:0 0 6px;break-inside:avoid}
      footer{margin-top:26px;border-top:1px solid #d7e2dc;padding-top:10px;color:#5b6f67;font-size:10px}
      .badge{display:inline-block;background:#e9f5ee;color:#1f5c43;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:600}
      @media print{body{margin:14mm} .map{break-inside:avoid}}
    </style></head><body>
      <header><div><h1>${escapeHtml(t('print.title'))}</h1><div class="muted">${
        selection?.address ? escapeHtml(selection.address) : escapeHtml(t('app.tagline'))
      }</div></div><div style="text-align:right"><span class="badge">GIS Tata Ruang</span><div class="muted">${escapeHtml(
        t('print.generated'),
      )}: ${escapeHtml(new Date().toLocaleString(lang === 'id' ? 'id-ID' : 'en-GB'))}</div></div></header>
      <div class="map">${image ? `<img src="${image}" alt="Peta">` : `<div style="padding:40px;text-align:center;color:#5b6f67">Peta tidak dapat diekspor sebagai gambar pada peramban ini.</div>`}</div>
      ${zoneHtml}
      <section><h2>${escapeHtml(t('print.legend'))}</h2><ul>${legendHtml || '<li>Tidak ada layer aktif.</li>'}</ul></section>
      <footer>${escapeHtml(t('print.note'))} · ${escapeHtml(t('footer.data'))}</footer>
      <script>window.addEventListener('load',function(){setTimeout(function(){window.print()},400)})</script>
    </body></html>`;

    const printWindow = window.open('', '_blank', 'width=980,height=1200');
    if (!printWindow) {
      notify('Jendela cetak diblokir peramban. Izinkan pop-up untuk mencetak.', 'error');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }, [lang, notify, selection, t]);

  const downloadImage = useCallback(() => {
    const currentMap = mapRef.current;
    if (!currentMap) return;
    try {
      const dataUrl = currentMap.getCanvas().toDataURL('image/png');
      const anchor = document.createElement('a');
      anchor.href = dataUrl;
      anchor.download = `peta-tata-ruang-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      notify('Gambar peta berhasil diunduh.', 'success');
    } catch {
      notify('Gambar peta tidak dapat diekspor pada peramban ini. Gunakan Cetak lalu simpan sebagai PDF.', 'error');
    }
  }, [notify]);

  const resetView = useCallback(() => {
    mapRef.current?.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, duration: 800 });
  }, []);

  return (
    <div className="public-page">
      <SiteHeader
        searchSlot={<SearchBox map={map} />}
        onAbout={() => setAboutOpen(true)}
        onToggleLayers={() => setLayersOpen((open) => !open)}
        layersOpen={layersOpen}
      />

      <main className="public-main">
        <MapView
          center={initialRef.current.center}
          zoom={initialRef.current.zoom}
          onReady={handleMapReady}
          ariaLabel="Peta tata ruang Kota Bandung"
        />

        <div className={`layers-shell ${layersOpen ? 'is-open' : ''}`}>
          <LayerPanel
            layers={layers}
            enabled={enabled}
            opacity={opacity}
            onToggle={toggleLayer}
            onOpacity={changeOpacity}
            onToggleAll={toggleAll}
            onZoom={zoomToLayer}
            onClose={() => setLayersOpen(false)}
          />
        </div>
        {layersOpen ? <button type="button" className="mobile-scrim" aria-label="Tutup panel layer" onClick={() => setLayersOpen(false)} /> : null}

        <MapToolbar
          basemap={basemap}
          onBasemap={setBasemap}
          measureMode={measure.mode && !measure.finished ? measure.mode : null}
          onMeasure={startMeasure}
          onPrint={printMap}
          onDownloadImage={downloadImage}
          onShare={() => void share()}
          onLocate={locate}
          onReset={resetView}
        />

        {selection ? <InfoPanel selection={selection} onClose={() => setSelection(null)} /> : null}

        {measure.mode ? (
          <MeasurePanel
            mode={measure.mode}
            value={measureValue}
            pointCount={measure.points.length}
            finished={measure.finished}
            onFinish={finishMeasure}
            onClear={clearMeasure}
          />
        ) : null}

        {status === 'loading' ? (
          <div className="map-status-chip">
            <Loader2 size={15} className="spin" /> {t('common.loading')}
          </div>
        ) : null}
        {status === 'error' ? (
          <div className="map-status-chip map-status-error">
            <AlertCircle size={15} />
            <span>{t('common.error')}</span>
            <button type="button" onClick={() => void loadLayers()}>
              {t('common.retry')}
            </button>
          </div>
        ) : null}

        <div className="map-footer-note">
          <span className="live-dot" aria-hidden="true" />
          {t('footer.data')} · EPSG:4326
        </div>
      </main>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}
