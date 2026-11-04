import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  GitCompareArrows,
  MapPin,
  RefreshCw,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useToast } from '../../lib/toast';
import type { FeatureCollection, GeoFeature, Layer, ValidationResult } from '../../lib/types';
import { categoryLabel, formatDateTime, formatNumber, statusLabel, STATUS_META } from '../../lib/format';
import { MapView } from '../../components/MapView';
import { Badge, EmptyState, LoadingBlock, Modal } from '../../components/ui';

interface CollectionSummary {
  version: number;
  featureCount: number;
  areaM2: number;
  lengthKm: number;
  vertexCount: number;
  geometryTypes: string[];
  changeSummary: string | null;
}

interface CompareResponse {
  layer: Layer;
  current: CollectionSummary;
  previous: CollectionSummary;
  diff: { added: number; removed: number; modified: number; unchanged: number };
  validation: ValidationResult;
}

function ComparisonMap({
  current,
  previous,
  bbox,
}: {
  current: FeatureCollection;
  previous: FeatureCollection;
  bbox: [number, number, number, number] | null;
}) {
  const [map, setMap] = useState<MapLibreMap | null>(null);

  const handleReady = useCallback(
    (readyMap: MapLibreMap) => {
      readyMap.addSource('review-previous', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as never });
      readyMap.addLayer({
        id: 'review-previous-fill',
        type: 'fill',
        source: 'review-previous',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#b23c3c', 'fill-opacity': 0.12 },
      });
      readyMap.addLayer({
        id: 'review-previous-line',
        type: 'line',
        source: 'review-previous',
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
        paint: { 'line-color': '#b23c3c', 'line-width': 2, 'line-dasharray': [2, 1.4] },
      });

      readyMap.addSource('review-current', { type: 'geojson', data: current as never });
      readyMap.addLayer({
        id: 'review-current-fill',
        type: 'fill',
        source: 'review-current',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#2f7d5a', 'fill-opacity': 0.35 },
      });
      readyMap.addLayer({
        id: 'review-current-line',
        type: 'line',
        source: 'review-current',
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]],
        paint: { 'line-color': '#1b4d38', 'line-width': 1.6 },
      });
      readyMap.addLayer({
        id: 'review-current-point',
        type: 'circle',
        source: 'review-current',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-color': '#1f6feb', 'circle-radius': 6, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.4 },
      });

      if (bbox) {
        readyMap.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          { padding: 60, maxZoom: 16, duration: 0 },
        );
      }
      setMap(readyMap);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (!map) return;
    (map.getSource('review-current') as GeoJSONSource | undefined)?.setData(current as never);
  }, [map, current]);

  useEffect(() => {
    if (!map) return;
    (map.getSource('review-previous') as GeoJSONSource | undefined)?.setData(previous as never);
  }, [map, previous]);

  return (
    <div className="review-map">
      <MapView center={[107.6191, -6.9175]} zoom={13} onReady={handleReady} ariaLabel="Perbandingan versi layer" />
      <div className="review-map-legend">
        <span><i style={{ background: '#2f7d5a' }} /> Versi saat ini</span>
        <span><i className="dashed" /> Versi sebelumnya</span>
      </div>
    </div>
  );
}

export function ReviewPage() {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ layers: Layer[] }>('/api/layers?status=submitted');
      setLayers(response.layers);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div className="page-toolbar-copy">
          <h2>Antrean tinjauan</h2>
          <p>Periksa validasi dan bandingkan versi sebelum menerbitkan layer.</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => void load()}>
          <RefreshCw size={15} /> Segarkan
        </button>
      </div>

      {loading ? <LoadingBlock label="Memuat antrean tinjauan…" /> : null}
      {!loading && error ? (
        <EmptyState
          icon={<AlertCircle size={22} />}
          title="Antrean gagal dimuat"
          description={error}
          action={
            <button type="button" className="btn btn-primary" onClick={() => void load()}>
              Coba lagi
            </button>
          }
        />
      ) : null}
      {!loading && !error && layers.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={24} />}
          title="Tidak ada pengajuan menunggu"
          description="Semua layer sudah ditinjau. Pengajuan baru dari editor akan muncul di sini."
        />
      ) : null}

      {!loading && layers.length > 0 ? (
        <div className="review-grid">
          {layers.map((layer) => (
            <article className="card review-card" key={layer.id}>
              <div className="review-card-top">
                <Badge tone="warn">Diajukan</Badge>
                <span>{formatDateTime(layer.submitted_at)}</span>
              </div>
              <h3>{layer.name}</h3>
              <p>{layer.description ?? 'Tanpa deskripsi.'}</p>
              <dl className="review-card-facts">
                <div>
                  <dt>Kategori</dt>
                  <dd>{categoryLabel(layer.category)}</dd>
                </div>
                <div>
                  <dt>Fitur</dt>
                  <dd>{formatNumber(layer.feature_count)}</dd>
                </div>
                <div>
                  <dt>Versi</dt>
                  <dd>v{layer.current_version}</dd>
                </div>
                <div>
                  <dt>Pemilik</dt>
                  <dd>{layer.owner_name ?? '-'}</dd>
                </div>
              </dl>
              <Link to={`/admin/review/${layer.id}`} className="btn btn-primary btn-sm btn-block">
                <ClipboardCheck size={15} /> Tinjau pengajuan
              </Link>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();

  const [layer, setLayer] = useState<Layer | null>(null);
  const [compare, setCompare] = useState<CompareResponse | null>(null);
  const [currentFeatures, setCurrentFeatures] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [previousFeatures, setPreviousFeatures] = useState<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [showPrevious, setShowPrevious] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [layerResponse, compareResponse, featuresResponse] = await Promise.all([
        api.get<{ layer: Layer }>(`/api/layers/${id}`),
        api.get<CompareResponse>(`/api/layers/${id}/compare`),
        api.get<{ features: GeoFeature[] }>(`/api/layers/${id}/features`),
      ]);
      setLayer(layerResponse.layer);
      setCompare(compareResponse);
      setCurrentFeatures({ type: 'FeatureCollection', features: featuresResponse.features });

      if (compareResponse.previous.version > 0) {
        try {
          const snapshot = await api.get<FeatureCollection & { version: number; changeSummary: string | null }>(
            `/api/layers/${id}/versions/${compareResponse.previous.version}`,
          );
          setPreviousFeatures({ type: 'FeatureCollection', features: snapshot.features });
        } catch {
          setPreviousFeatures({ type: 'FeatureCollection', features: [] });
        }
      } else {
        setPreviousFeatures({ type: 'FeatureCollection', features: [] });
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(): Promise<void> {
    if (!layer) return;
    if (!window.confirm(`Terbitkan layer "${layer.name}"? Layer akan langsung tampil di portal publik.`)) return;
    setBusy(true);
    try {
      const response = await api.post<{ message: string }>(`/api/layers/${layer.id}/approve`);
      notify(response.message, 'success');
      navigate('/admin/review');
    } catch (caught) {
      notify(errorMessage(caught), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function reject(): Promise<void> {
    if (!layer) return;
    if (rejectNote.trim().length < 3) {
      notify('Tuliskan catatan penolakan minimal 3 karakter.', 'error');
      return;
    }
    setBusy(true);
    try {
      const response = await api.post<{ message: string }>(`/api/layers/${layer.id}/reject`, { note: rejectNote.trim() });
      notify(response.message, 'success');
      navigate('/admin/review');
    } catch (caught) {
      notify(errorMessage(caught), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingBlock label="Memuat perbandingan versi…" />;

  if (error || !layer || !compare) {
    return (
      <EmptyState
        icon={<AlertCircle size={22} />}
        title="Tinjauan tidak dapat dimuat"
        description={error ?? 'Data tinjauan tidak ditemukan.'}
        action={
          <Link to="/admin/review" className="btn btn-primary">
            Kembali ke antrean
          </Link>
        }
      />
    );
  }

  const isSubmitted = layer.status === 'submitted';
  const errorCount = compare.validation.issues.filter((issue) => issue.severity === 'error').length;

  return (
    <div className="page-stack">
      <div className="editor-header">
        <div className="editor-header-left">
          <button type="button" className="icon-button" onClick={() => navigate('/admin/review')} aria-label="Kembali">
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="editor-title-row">
              <h2>{layer.name}</h2>
              <Badge tone={STATUS_META[layer.status]?.tone ?? 'neutral'}>{statusLabel(layer.status)}</Badge>
            </div>
            <p>
              Diajukan {formatDateTime(layer.submitted_at)} · {layer.owner_name ?? '-'} · {formatNumber(layer.feature_count)} fitur
            </p>
          </div>
        </div>
        <div className="row-actions">
          {isSubmitted ? (
            <>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setRejectOpen(true)} disabled={busy}>
                <XCircle size={15} /> Tolak
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void approve()} disabled={busy || errorCount > 0}>
                <CheckCircle2 size={15} /> Setujui & terbitkan
              </button>
            </>
          ) : (
            <Link to="/admin/layers" className="btn btn-outline btn-sm">
              Kembali ke daftar
            </Link>
          )}
        </div>
      </div>

      {errorCount > 0 ? (
        <div className="alert alert-error">
          <AlertCircle size={17} />
          <span>Layer belum lolos validasi ({errorCount} error). Penerbitan diblokir sampai data diperbaiki.</span>
        </div>
      ) : (
        <div className="alert alert-success">
          <CheckCircle2 size={17} />
          <span>Validasi lolos. Periksa perbandingan versi sebelum menerbitkan.</span>
        </div>
      )}

      <section className="stat-grid review-stats">
        <div className="review-stat">
          <span>Versi saat ini</span>
          <strong>v{compare.current.version}</strong>
          <small>{formatNumber(compare.current.featureCount)} fitur · {formatNumber(compare.current.areaM2 / 1_000_000, 2)} km²</small>
        </div>
        <div className="review-stat">
          <span>Versi sebelumnya</span>
          <strong>{compare.previous.version ? `v${compare.previous.version}` : '—'}</strong>
          <small>
            {compare.previous.version
              ? `${formatNumber(compare.previous.featureCount)} fitur · ${formatNumber(compare.previous.areaM2 / 1_000_000, 2)} km²`
              : 'Belum ada versi pembanding'}
          </small>
        </div>
        <div className="review-stat">
          <span>Perubahan</span>
          <strong>
            +{compare.diff.added} / -{compare.diff.removed}
          </strong>
          <small>{compare.diff.modified} diubah · {compare.diff.unchanged} tetap</small>
        </div>
        <div className="review-stat">
          <span>Validasi</span>
          <strong className={errorCount > 0 ? 'danger-text' : 'success-text'}>{errorCount > 0 ? `${errorCount} error` : 'Lolos'}</strong>
          <small>{compare.validation.issues.length} catatan</small>
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <div>
            <h3>Perbandingan geometri</h3>
            <p>{compare.current.changeSummary ?? 'Ringkasan perubahan tidak tersedia'}</p>
          </div>
          <label className="switch-inline">
            <input type="checkbox" checked={showPrevious} onChange={(event) => setShowPrevious(event.target.checked)} />
            Tampilkan versi sebelumnya
          </label>
        </header>
        <ComparisonMap
          current={currentFeatures}
          previous={showPrevious ? previousFeatures : { type: 'FeatureCollection', features: [] }}
          bbox={layer.bbox ?? null}
        />
      </section>

      <div className="review-details-grid">
        <section className="card">
          <header className="card-header">
            <div>
              <h3>Hasil validasi</h3>
              <p>Pemeriksaan geometri dan atribut</p>
            </div>
            <GitCompareArrows size={18} className="muted-icon" />
          </header>
          {compare.validation.issues.length === 0 ? (
            <p className="muted-text">Tidak ada masalah yang ditemukan.</p>
          ) : (
            <ul className="issue-list">
              {compare.validation.issues.map((issue, index) => (
                <li key={`${issue.code}-${index}`} className={issue.severity === 'error' ? 'issue-error' : 'issue-warning'}>
                  {issue.severity === 'error' ? <AlertCircle size={14} /> : <TriangleAlert size={14} />}
                  <span>
                    {issue.message}
                    {issue.featureIndex !== undefined ? ` (fitur #${issue.featureIndex + 1})` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <header className="card-header">
            <div>
              <h3>Rincian perubahan</h3>
              <p>Berdasarkan ID fitur antar versi</p>
            </div>
          </header>
          <ul className="diff-list">
            <li><span className="diff-dot added" /> Fitur ditambahkan <strong>{compare.diff.added}</strong></li>
            <li><span className="diff-dot removed" /> Fitur dihapus <strong>{compare.diff.removed}</strong></li>
            <li><span className="diff-dot modified" /> Fitur diubah <strong>{compare.diff.modified}</strong></li>
            <li><span className="diff-dot unchanged" /> Fitur tidak berubah <strong>{compare.diff.unchanged}</strong></li>
          </ul>
          <dl className="review-meta">
            <div><dt>Kategori</dt><dd>{categoryLabel(layer.category)}</dd></div>
            <div><dt>Sumber</dt><dd>{layer.source ?? '-'}</dd></div>
            <div><dt>Tanggal data</dt><dd>{layer.data_date ?? '-'}</dd></div>
            <div><dt>Tipe geometri</dt><dd>{layer.geometry_type}</dd></div>
          </dl>
        </section>
      </div>

      {isSubmitted ? (
        <div className="review-actions-bar">
          <div>
            <strong>Keputusan akhir</strong>
            <span>Setujui untuk menerbitkan atau kembalikan ke editor dengan catatan.</span>
          </div>
          <div className="row-actions">
            <button type="button" className="btn btn-outline" onClick={() => setRejectOpen(true)} disabled={busy}>
              <XCircle size={16} /> Tolak dengan catatan
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void approve()} disabled={busy || errorCount > 0}>
              <CheckCircle2 size={16} /> Setujui & terbitkan
            </button>
          </div>
        </div>
      ) : null}

      <Modal
        open={rejectOpen}
        title="Tolak pengajuan"
        onClose={() => setRejectOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setRejectOpen(false)} disabled={busy}>
              Batal
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void reject()} disabled={busy || rejectNote.trim().length < 3}>
              {busy ? 'Mengembalikan…' : 'Tolak & kembalikan ke editor'}
            </button>
          </>
        }
      >
        <p>Layer akan kembali berstatus draf. Editor akan melihat catatan Anda pada halaman editor.</p>
        <label className="field">
          <span>Catatan untuk editor</span>
          <textarea
            rows={4}
            value={rejectNote}
            onChange={(event) => setRejectNote(event.target.value)}
            placeholder="Contoh: Perbaiki geometri yang tumpang tindih di bagian utara sebelum diajukan ulang."
            required
          />
        </label>
      </Modal>

      <div className="editor-footer">
        <Link to="/admin/review">
          <ArrowLeft size={14} /> Antrean tinjauan
        </Link>
        <Link to={`/admin/layers/${layer.id}/edit`}>
          <MapPin size={14} /> Buka editor layer
        </Link>
        <Link to="/admin/layers">
          Daftar layer <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
