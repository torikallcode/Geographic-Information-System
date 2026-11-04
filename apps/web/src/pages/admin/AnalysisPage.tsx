import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import * as turf from '@turf/turf';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Boxes,
  CircleDot,
  Download,
  FileDown,
  History,
  Layers3,
  LocateFixed,
  Play,
  Save,
  Sigma,
} from 'lucide-react';
import { api, downloadFile, errorMessage } from '../../lib/api';
import { useToast } from '../../lib/toast';
import type { AnalysisHistoryItem, Category, FeatureCollection, Layer } from '../../lib/types';
import { CATEGORY_ORDER, categoryLabel, formatArea, formatDateTime, formatLength, formatNumber } from '../../lib/format';
import { MapView } from '../../components/MapView';
import { EmptyState, LoadingBlock, Modal } from '../../components/ui';

type AnalysisTab = 'buffer' | 'intersect' | 'radius' | 'statistics';

interface AnalysisResult {
  id: string;
  type: AnalysisTab;
  params: Record<string, unknown>;
  geojson?: FeatureCollection;
  summary: Record<string, unknown>;
}

const TABS: Array<{ id: AnalysisTab; label: string; description: string; icon: ReactNode }> = [
  { id: 'buffer', label: 'Buffer', description: 'Zona radius di sekitar fitur layer', icon: <CircleDot size={16} /> },
  { id: 'intersect', label: 'Overlay', description: 'Perpotongan antara dua layer', icon: <Boxes size={16} /> },
  { id: 'radius', label: 'Radius', description: 'Cari fitur dalam radius titik', icon: <LocateFixed size={16} /> },
  { id: 'statistics', label: 'Statistik', description: 'Rekap fitur, luas, dan kategori', icon: <Sigma size={16} /> },
];

function AnalysisMap({ data }: { data: FeatureCollection }) {
  const [map, setMap] = useState<MapLibreMap | null>(null);

  const fit = useCallback((readyMap: MapLibreMap, collection: FeatureCollection) => {
    if (collection.features.length === 0) return;
    try {
      const bounds = turf.bbox(collection as never);
      if (bounds.every((value) => Number.isFinite(value))) {
        readyMap.fitBounds(
          [
            [bounds[0], bounds[1]],
            [bounds[2], bounds[3]],
          ],
          { padding: 50, maxZoom: 16, duration: 0 },
        );
      }
    } catch {
      // abaikan
    }
  }, []);

  const handleReady = useCallback(
    (readyMap: MapLibreMap) => {
      readyMap.addSource('analysis-result', { type: 'geojson', data: data as never });
      readyMap.addLayer({
        id: 'analysis-fill',
        type: 'fill',
        source: 'analysis-result',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#c26b3b', 'fill-opacity': 0.35 },
      });
      readyMap.addLayer({
        id: 'analysis-line',
        type: 'line',
        source: 'analysis-result',
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
        paint: { 'line-color': '#8f431c', 'line-width': 2 },
      });
      readyMap.addLayer({
        id: 'analysis-point',
        type: 'circle',
        source: 'analysis-result',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-color': '#8f431c', 'circle-radius': 6, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
      });
      fit(readyMap, data);
      setMap(readyMap);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (!map) return;
    (map.getSource('analysis-result') as GeoJSONSource | undefined)?.setData(data as never);
    fit(map, data);
  }, [map, data, fit]);

  return (
    <div className="analysis-map">
      <MapView center={[107.6191, -6.9175]} zoom={13} onReady={handleReady} ariaLabel="Pratinjau hasil analisis" />
    </div>
  );
}

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export default function AnalysisPage() {
  const navigate = useNavigate();
  const { notify } = useToast();

  const [tab, setTab] = useState<AnalysisTab>('buffer');
  const [layers, setLayers] = useState<Layer[]>([]);
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bufferLayer, setBufferLayer] = useState('');
  const [distance, setDistance] = useState(250);
  const [intersectA, setIntersectA] = useState('');
  const [intersectB, setIntersectB] = useState('');
  const [radiusLat, setRadiusLat] = useState(-6.9175);
  const [radiusLon, setRadiusLon] = useState(107.6191);
  const [radiusMeters, setRadiusMeters] = useState(1000);
  const [statLayer, setStatLayer] = useState('');
  const [statField, setStatField] = useState('');
  const [regionLayer, setRegionLayer] = useState('');
  const [regionField, setRegionField] = useState('name');

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveForm, setSaveForm] = useState({ name: '', category: 'pola_ruang' as Category, description: '' });
  const [saving, setSaving] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await api.get<{ analyses: AnalysisHistoryItem[] }>('/api/analysis');
      setHistory(response.analyses);
    } catch {
      // riwayat tidak menghalangi analisis baru
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    api
      .get<{ layers: Layer[] }>('/api/layers')
      .then((response) => {
        setLayers(response.layers);
        const first = response.layers[0]?.id ?? '';
        setBufferLayer((current) => current || first);
        setIntersectA((current) => current || first);
        setIntersectB((current) => current || response.layers[1]?.id || first);
        setStatLayer((current) => current || first);
      })
      .catch((caught) => setError(errorMessage(caught)));
    void loadHistory();
  }, [loadHistory]);

  const activeTab = useMemo(() => TABS.find((item) => item.id === tab)!, [tab]);

  async function runAnalysis(): Promise<void> {
    setRunning(true);
    setError(null);
    try {
      let response: AnalysisResult;
      if (tab === 'buffer') {
        if (!bufferLayer) throw new Error('Pilih layer sumber.');
        response = await api.post<AnalysisResult>('/api/analysis/buffer', { layerId: bufferLayer, distanceMeters: distance });
      } else if (tab === 'intersect') {
        if (!intersectA || !intersectB) throw new Error('Pilih dua layer.');
        response = await api.post<AnalysisResult>('/api/analysis/intersect', { layerA: intersectA, layerB: intersectB });
      } else if (tab === 'radius') {
        response = await api.post<AnalysisResult>('/api/analysis/radius', {
          lat: radiusLat,
          lon: radiusLon,
          radiusMeters,
        });
      } else {
        if (!statLayer) throw new Error('Pilih layer yang akan dihitung.');
        response = await api.post<AnalysisResult>('/api/analysis/statistics', {
          layerId: statLayer,
          ...(statField.trim() ? { field: statField.trim() } : {}),
          ...(regionLayer ? { regionLayerId: regionLayer, regionField: regionField.trim() || 'name' } : {}),
        });
      }
      setResult(response);
      await loadHistory();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setRunning(false);
    }
  }

  async function loadAnalysis(id: string): Promise<void> {
    setRunning(true);
    setError(null);
    try {
      const response = await api.get<{
        analysis: { id: string; type: AnalysisTab; params: Record<string, unknown>; result: { geojson?: FeatureCollection; summary: Record<string, unknown> } };
      }>(`/api/analysis/${id}`);
      const loaded = response.analysis;
      setResult({
        id: loaded.id,
        type: loaded.type,
        params: loaded.params,
        geojson: loaded.result.geojson,
        summary: loaded.result.summary,
      });
      if (TABS.some((item) => item.id === loaded.type)) setTab(loaded.type);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setRunning(false);
    }
  }

  async function saveAsLayer(): Promise<void> {
    if (!result) return;
    setSaving(true);
    try {
      const response = await api.post<{ layerId: string; message: string }>(`/api/analysis/${result.id}/save-as-layer`, {
        name: saveForm.name,
        category: saveForm.category,
        description: saveForm.description,
      });
      notify(response.message, 'success');
      setSaveOpen(false);
      await loadHistory();
      navigate(`/admin/layers/${response.layerId}/edit`);
    } catch (caught) {
      notify(errorMessage(caught), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function downloadPdf(): Promise<void> {
    if (!result) return;
    try {
      await downloadFile(`/api/analysis/${result.id}/report.pdf`, `analisis-${result.type}.pdf`);
      notify('Laporan PDF diunduh.', 'success');
    } catch (caught) {
      notify(errorMessage(caught), 'error');
    }
  }

  const summary = result?.summary ?? {};
  const summaryLayers = Array.isArray(summary.layers) ? (summary.layers as Array<Record<string, unknown>>) : [];
  const summaryCategories = Array.isArray(summary.categories) ? (summary.categories as Array<Record<string, unknown>>) : [];
  const summaryRegions = Array.isArray(summary.regions) ? (summary.regions as Array<Record<string, unknown>>) : [];

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div className="page-toolbar-copy">
          <h2>Analisis spasial</h2>
          <p>Jalankan buffer, overlay, pencarian radius, dan statistik wilayah menggunakan PostGIS.</p>
        </div>
      </div>

      <div className="analysis-tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'active' : ''}
            onClick={() => {
              setTab(item.id);
              setResult(null);
              setError(null);
            }}
          >
            {item.icon}
            <span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="analysis-layout">
        <section className="card analysis-form-card">
          <header className="card-header">
            <div>
              <h3>{activeTab.label}</h3>
              <p>{activeTab.description}</p>
            </div>
          </header>

          {tab === 'buffer' ? (
            <div className="form-grid">
              <label className="field">
                <span>Layer sumber</span>
                <select value={bufferLayer} onChange={(event) => setBufferLayer(event.target.value)}>
                  {layers.map((layer) => (
                    <option key={layer.id} value={layer.id}>
                      {layer.name} ({formatNumber(layer.feature_count)} fitur)
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Jarak buffer (meter)</span>
                <input type="number" min={1} max={20000} value={distance} onChange={(event) => setDistance(Number(event.target.value))} />
              </label>
              <div className="preset-row">
                {[100, 250, 500, 1000, 2500].map((preset) => (
                  <button type="button" key={preset} className={distance === preset ? 'active' : ''} onClick={() => setDistance(preset)}>
                    {preset} m
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {tab === 'intersect' ? (
            <div className="form-grid">
              <label className="field">
                <span>Layer A</span>
                <select value={intersectA} onChange={(event) => setIntersectA(event.target.value)}>
                  {layers.map((layer) => (
                    <option key={layer.id} value={layer.id}>
                      {layer.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Layer B</span>
                <select value={intersectB} onChange={(event) => setIntersectB(event.target.value)}>
                  {layers.map((layer) => (
                    <option key={layer.id} value={layer.id}>
                      {layer.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted-text small">Analisis menghitung pasangan fitur yang bersinggungan dan luas irisan hasil overlay.</p>
            </div>
          ) : null}

          {tab === 'radius' ? (
            <div className="form-grid">
              <div className="form-row">
                <label className="field">
                  <span>Lintang</span>
                  <input type="number" step="0.000001" value={radiusLat} onChange={(event) => setRadiusLat(Number(event.target.value))} />
                </label>
                <label className="field">
                  <span>Bujur</span>
                  <input type="number" step="0.000001" value={radiusLon} onChange={(event) => setRadiusLon(Number(event.target.value))} />
                </label>
              </div>
              <label className="field">
                <span>Radius (meter)</span>
                <input type="number" min={10} max={100000} value={radiusMeters} onChange={(event) => setRadiusMeters(Number(event.target.value))} />
              </label>
              <div className="preset-row">
                {[250, 500, 1000, 2500, 5000].map((preset) => (
                  <button type="button" key={preset} className={radiusMeters === preset ? 'active' : ''} onClick={() => setRadiusMeters(preset)}>
                    {preset} m
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {tab === 'statistics' ? (
            <div className="form-grid">
              <label className="field">
                <span>Layer yang dihitung</span>
                <select value={statLayer} onChange={(event) => setStatLayer(event.target.value)}>
                  {layers.map((layer) => (
                    <option key={layer.id} value={layer.id}>
                      {layer.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Kolom kategori (opsional)</span>
                <input value={statField} onChange={(event) => setStatField(event.target.value)} placeholder="Kosongkan untuk deteksi otomatis" />
              </label>
              <div className="form-row">
                <label className="field">
                  <span>Layer wilayah (opsional)</span>
                  <select value={regionLayer} onChange={(event) => setRegionLayer(event.target.value)}>
                    <option value="">Tanpa per wilayah</option>
                    {layers.map((layer) => (
                      <option key={layer.id} value={layer.id}>
                        {layer.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Kolom nama wilayah</span>
                  <input value={regionField} onChange={(event) => setRegionField(event.target.value)} placeholder="name" />
                </label>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="alert alert-error">
              <AlertCircle size={16} /> {error}
            </div>
          ) : null}

          <div className="card-actions">
            <button type="button" className="btn btn-primary" onClick={() => void runAnalysis()} disabled={running || layers.length === 0}>
              <Play size={15} /> {running ? 'Menjalankan…' : 'Jalankan analisis'}
            </button>
          </div>
        </section>

        <section className="analysis-result">
          {!result ? (
            <EmptyState
              icon={<BarChart3 size={24} />}
              title="Belum ada hasil"
              description="Pilih metode, isi parameter, lalu jalankan analisis untuk melihat ringkasan dan pratinjau peta."
            />
          ) : (
            <div className="page-stack">
              <div className="result-header">
                <div>
                  <h3>Hasil {activeTab.label}</h3>
                  <p>Analisis tersimpan otomatis di riwayat dengan ID {result.id.slice(0, 8)}…</p>
                </div>
                <div className="row-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => void downloadPdf()}>
                    <FileDown size={14} /> PDF
                  </button>
                  {result.geojson && result.geojson.features.length > 0 ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => downloadJson(result.geojson, `analisis-${result.type}.geojson`)}
                      >
                        <Download size={14} /> GeoJSON
                      </button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => setSaveOpen(true)}>
                        <Save size={14} /> Simpan sebagai layer
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {result.type === 'buffer' ? (
                <div className="result-stat-grid">
                  <div>
                    <span>Fitur sumber</span>
                    <strong>{formatNumber(numberValue(summary.source_feature_count))}</strong>
                  </div>
                  <div>
                    <span>Jarak buffer</span>
                    <strong>{formatNumber(numberValue(summary.distance_m))} m</strong>
                  </div>
                  <div>
                    <span>Luas buffer</span>
                    <strong>{formatArea(numberValue(summary.buffer_area_m2))}</strong>
                  </div>
                </div>
              ) : null}

              {result.type === 'intersect' ? (
                <div className="result-stat-grid">
                  <div>
                    <span>Pasangan beririsan</span>
                    <strong>{formatNumber(numberValue(summary.intersecting_feature_pairs))}</strong>
                  </div>
                  <div>
                    <span>Luas irisan</span>
                    <strong>{formatArea(numberValue(summary.intersection_area_m2))}</strong>
                  </div>
                  <div>
                    <span>Pratinjau</span>
                    <strong>{summary.preview_truncated ? 'Dibatasi 500' : 'Lengkap'}</strong>
                  </div>
                </div>
              ) : null}

              {result.type === 'radius' ? (
                <>
                  <div className="result-stat-grid">
                    <div>
                      <span>Total fitur ditemukan</span>
                      <strong>{formatNumber(numberValue(summary.total_features))}</strong>
                    </div>
                    <div>
                      <span>Radius</span>
                      <strong>{formatNumber(numberValue(summary.radius_m))} m</strong>
                    </div>
                    <div>
                      <span>Layer terlibat</span>
                      <strong>{summaryLayers.length}</strong>
                    </div>
                  </div>
                  <div className="card table-card">
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Layer</th>
                            <th className="align-right">Fitur</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summaryLayers.map((row) => (
                            <tr key={String(row.layer_id)}>
                              <td>{String(row.layer_name)}</td>
                              <td className="align-right mono">{formatNumber(numberValue(row.feature_count))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}

              {result.type === 'statistics' ? (
                <>
                  <div className="result-stat-grid">
                    <div>
                      <span>Layer</span>
                      <strong className="small-text">{String(summary.layer ?? '-')}</strong>
                    </div>
                    <div>
                      <span>Kolom kategori</span>
                      <strong className="small-text">{String(summary.field ?? 'Tidak terdeteksi')}</strong>
                    </div>
                    <div>
                      <span>Wilayah</span>
                      <strong>{summaryRegions.length > 0 ? formatNumber(summaryRegions.length) : '—'}</strong>
                    </div>
                  </div>

                  {summaryCategories.length > 0 ? (
                    <div className="card table-card">
                      <header className="card-header">
                        <div>
                          <h3>Statistik per kategori</h3>
                          <p>Jumlah fitur, luas, dan panjang per nilai kategori</p>
                        </div>
                      </header>
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Kategori</th>
                              <th className="align-right">Fitur</th>
                              <th className="align-right">Luas</th>
                              <th className="align-right">Panjang</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summaryCategories.map((row) => (
                              <tr key={String(row.category)}>
                                <td>{String(row.category)}</td>
                                <td className="align-right mono">{formatNumber(numberValue(row.feature_count))}</td>
                                <td className="align-right mono">{formatArea(numberValue(row.area_m2))}</td>
                                <td className="align-right mono">{formatLength(numberValue(row.length_km))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  {summaryRegions.length > 0 ? (
                    <div className="card table-card">
                      <header className="card-header">
                        <div>
                          <h3>Statistik per wilayah</h3>
                          <p>Fitur dan luas yang beririsan dengan tiap wilayah</p>
                        </div>
                      </header>
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Wilayah</th>
                              <th className="align-right">Fitur</th>
                              <th className="align-right">Luas irisan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summaryRegions.map((row, index) => (
                              <tr key={`${row.region_id ?? index}`}>
                                <td>{String(row.region_name ?? row.region_id ?? '-')}</td>
                                <td className="align-right mono">{formatNumber(numberValue(row.feature_count))}</td>
                                <td className="align-right mono">{formatArea(numberValue(row.area_m2))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}

              {result.geojson && result.geojson.features.length > 0 ? (
                <section className="card">
                  <header className="card-header">
                    <div>
                      <h3>Pratinjau geometri</h3>
                      <p>{formatNumber(result.geojson.features.length)} fitur hasil analisis</p>
                    </div>
                    <Layers3 size={18} className="muted-icon" />
                  </header>
                  <AnalysisMap data={result.geojson} />
                </section>
              ) : null}
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <header className="card-header">
          <div>
            <h3>Riwayat analisis</h3>
            <p>50 analisis terakhir yang tersimpan</p>
          </div>
          <History size={18} className="muted-icon" />
        </header>
        {historyLoading ? <LoadingBlock label="Memuat riwayat…" /> : null}
        {!historyLoading && history.length === 0 ? <p className="muted-text">Belum ada analisis tersimpan.</p> : null}
        {!historyLoading && history.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Jenis</th>
                  <th>Waktu</th>
                  <th>Dibuat oleh</th>
                  <th>Ringkasan</th>
                  <th>Layer hasil</th>
                  <th className="align-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="badge badge-info">{TABS.find((tabItem) => tabItem.id === item.type)?.label ?? item.type}</span>
                    </td>
                    <td className="nowrap">{formatDateTime(item.created_at)}</td>
                    <td>{item.created_by_name ?? '-'}</td>
                    <td>
                      <small className="table-sub">{summarizeHistory(item)}</small>
                    </td>
                    <td>
                      {item.saved_layer_name ? (
                        <button type="button" className="text-link" onClick={() => navigate(`/admin/layers/${item.layer_id}/edit`)}>
                          {item.saved_layer_name} <ArrowRight size={12} />
                        </button>
                      ) : (
                        <span className="muted-text">Belum disimpan</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions end">
                        <button type="button" className="btn btn-outline btn-xs" onClick={() => void loadAnalysis(item.id)}>
                          Muat
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          title="Unduh PDF"
                          aria-label="Unduh PDF"
                          onClick={() => void downloadFile(`/api/analysis/${item.id}/report.pdf`, `analisis-${item.type}.pdf`).catch((caught) => notify(errorMessage(caught), 'error'))}
                        >
                          <FileDown size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <Modal
        open={saveOpen}
        title="Simpan hasil analisis sebagai layer"
        onClose={() => setSaveOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setSaveOpen(false)} disabled={saving}>
              Batal
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void saveAsLayer()} disabled={saving || saveForm.name.trim().length < 2}>
              {saving ? 'Menyimpan…' : 'Simpan sebagai draf'}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <label className="field">
            <span>Nama layer baru</span>
            <input value={saveForm.name} onChange={(event) => setSaveForm((current) => ({ ...current, name: event.target.value }))} placeholder="Contoh: Buffer 500m Zona Perdagangan" />
          </label>
          <label className="field">
            <span>Kategori</span>
            <select value={saveForm.category} onChange={(event) => setSaveForm((current) => ({ ...current, category: event.target.value as Category }))}>
              {CATEGORY_ORDER.map((category) => (
                <option key={category} value={category}>
                  {categoryLabel(category)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Deskripsi</span>
            <textarea rows={3} value={saveForm.description} onChange={(event) => setSaveForm((current) => ({ ...current, description: event.target.value }))} />
          </label>
        </div>
        <p className="muted-text small">Layer akan dibuat sebagai draf dan dapat diajukan untuk penerbitan setelah diperiksa.</p>
      </Modal>
    </div>
  );
}

function summarizeHistory(item: AnalysisHistoryItem): string {
  const summary = item.summary;
  if (!summary) return '-';
  if (item.type === 'buffer') return `${summary.distance_m ?? '-'} m · ${summary.source_feature_count ?? '-'} fitur sumber`;
  if (item.type === 'intersect') return `${summary.intersecting_feature_pairs ?? '-'} pasangan · ${summary.layer_a ?? ''} ∩ ${summary.layer_b ?? ''}`;
  if (item.type === 'radius') return `${summary.total_features ?? '-'} fitur dalam ${summary.radius_m ?? '-'} m`;
  return `${summary.layer ?? ''} · ${summary.field ?? 'kategori otomatis'}`;
}
