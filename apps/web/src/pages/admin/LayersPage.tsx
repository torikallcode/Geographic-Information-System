import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Download,
  FileDown,
  History,
  Layers3,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { api, downloadFile, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import type { Layer, LayerVersion } from '../../lib/types';
import {
  CATEGORY_ORDER,
  categoryLabel,
  formatDateTime,
  formatNumber,
  statusLabel,
  STATUS_META,
} from '../../lib/format';
import { Badge, EmptyState, LoadingBlock, Modal } from '../../components/ui';

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function LayersPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [layers, setLayers] = useState<Layer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);

  const [versionsLayer, setVersionsLayer] = useState<Layer | null>(null);
  const [versions, setVersions] = useState<LayerVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Layer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (category) params.set('category', category);
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      const response = await api.get<{ layers: Layer[] }>(`/api/layers?${params.toString()}`);
      setLayers(response.layers);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [status, category, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const canEdit = useCallback(
    (layer: Layer) =>
      user?.role === 'admin' ||
      (layer.owner_id === user?.id && layer.status !== 'published' && layer.status !== 'archived'),
    [user],
  );

  const canDelete = useCallback(
    (layer: Layer) => user?.role === 'admin' || (layer.owner_id === user?.id && layer.status === 'draft'),
    [user],
  );

  async function openVersions(layer: Layer): Promise<void> {
    setVersionsLayer(layer);
    setVersions([]);
    setVersionsLoading(true);
    try {
      const response = await api.get<{ versions: LayerVersion[] }>(`/api/layers/${layer.id}/versions`);
      setVersions(response.versions);
    } catch (caught) {
      notify(errorMessage(caught), 'error');
    } finally {
      setVersionsLoading(false);
    }
  }

  async function restoreVersion(version: number): Promise<void> {
    if (!versionsLayer) return;
    if (!window.confirm(`Pulihkan layer "${versionsLayer.name}" ke versi ${version}? Versi saat ini tetap tersimpan di riwayat.`)) return;
    setBusy(true);
    try {
      const response = await api.post<{ message: string }>(`/api/layers/${versionsLayer.id}/restore`, { version });
      notify(response.message, 'success');
      setVersionsLayer(null);
      await load();
    } catch (caught) {
      notify(errorMessage(caught), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function deleteLayer(): Promise<void> {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.delete(`/api/layers/${deleteTarget.id}`);
      notify(`Layer "${deleteTarget.name}" dihapus.`, 'success');
      setDeleteTarget(null);
      await load();
    } catch (caught) {
      notify(errorMessage(caught), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function moveLayer(layer: Layer, direction: 'up' | 'down'): Promise<void> {
    setBusy(true);
    try {
      const response = await api.post<{ message: string }>(`/api/layers/${layer.id}/reorder`, { direction });
      notify(response.message, 'success');
      await load();
    } catch (caught) {
      notify(errorMessage(caught), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function download(layer: Layer, path: string, filename: string): Promise<void> {
    try {
      await downloadFile(path, filename);
      notify('Unduhan dimulai.', 'success');
    } catch (caught) {
      notify(errorMessage(caught), 'error');
    }
  }

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div className="page-toolbar-copy">
          <h2>Seluruh layer</h2>
          <p>Kelola data, pantau status, dan tinjau riwayat versi setiap layer.</p>
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void load()}>
            <RefreshCw size={15} /> Segarkan
          </button>
          <Link to="/admin/layers/new" className="btn btn-primary btn-sm">
            <Plus size={15} /> Unggah layer
          </Link>
        </div>
      </div>

      <div className="card filter-card">
        <div className="filter-row">
          <label className="input-with-icon grow">
            <Search size={15} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama atau deskripsi layer…"
              aria-label="Cari layer"
            />
          </label>
          <label className="select-field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Semua status</option>
              <option value="draft">Draf</option>
              <option value="submitted">Diajukan</option>
              <option value="published">Terbit</option>
              <option value="archived">Arsip</option>
            </select>
          </label>
          <label className="select-field">
            <span>Kategori</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">Semua kategori</option>
              {CATEGORY_ORDER.map((item) => (
                <option value={item} key={item}>
                  {categoryLabel(item)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? <LoadingBlock label="Memuat layer…" /> : null}

      {!loading && error ? (
        <EmptyState
          icon={<AlertCircle size={22} />}
          title="Layer gagal dimuat"
          description={error}
          action={
            <button type="button" className="btn btn-primary" onClick={() => void load()}>
              <RefreshCw size={15} /> Coba lagi
            </button>
          }
        />
      ) : null}

      {!loading && !error && layers.length === 0 ? (
        <EmptyState
          icon={<Layers3 size={24} />}
          title="Belum ada layer"
          description="Unggah GeoJSON, Shapefile (.zip), KML, atau CSV untuk mulai mengelola data."
          action={
            <Link to="/admin/layers/new" className="btn btn-primary">
              <Plus size={15} /> Unggah layer pertama
            </Link>
          }
        />
      ) : null}

      {!loading && !error && layers.length > 0 ? (
        <div className="card table-card">
          <div className="table-wrap">
            <table className="data-table layer-table">
              <thead>
                <tr>
                  <th>Layer</th>
                  <th>Kategori</th>
                  <th>Status</th>
                  <th className="align-right">Fitur</th>
                  <th className="align-right">Versi</th>
                  <th>Pemilik</th>
                  <th>Diperbarui</th>
                  <th className="align-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {layers.map((layer) => (
                  <tr key={layer.id}>
                    <td>
                      <div className="table-primary">{layer.name}</div>
                      <small className="table-sub line-clamp-1">{layer.description || layer.source || 'Tanpa deskripsi'}</small>
                    </td>
                    <td>{categoryLabel(layer.category)}</td>
                    <td>
                      <Badge tone={STATUS_META[layer.status]?.tone ?? 'neutral'}>{statusLabel(layer.status)}</Badge>
                      {layer.rejection_note ? <small className="table-sub rejection-note">Ditolak: {layer.rejection_note}</small> : null}
                    </td>
                    <td className="align-right mono">{formatNumber(layer.feature_count)}</td>
                    <td className="align-right mono">v{layer.current_version}</td>
                    <td>{layer.owner_name ?? '-'}</td>
                    <td className="nowrap">{formatDateTime(layer.updated_at)}</td>
                    <td>
                      <div className="row-actions end">
                        {user?.role === 'admin' ? (
                          <>
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() => void moveLayer(layer, 'up')}
                              disabled={busy || layer.sort_order === 0}
                              title="Naikkan urutan layer"
                              aria-label="Naikkan urutan layer"
                            >
                              <ChevronUp size={16} />
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() => void moveLayer(layer, 'down')}
                              disabled={busy}
                              title="Turunkan urutan layer"
                              aria-label="Turunkan urutan layer"
                            >
                              <ChevronDown size={16} />
                            </button>
                          </>
                        ) : null}
                        {canEdit(layer) ? (
                          <Link to={`/admin/layers/${layer.id}/edit`} className="icon-button" title="Kelola layer" aria-label="Kelola layer">
                            <Pencil size={16} />
                          </Link>
                        ) : null}
                        {user?.role === 'admin' && layer.status === 'submitted' ? (
                          <Link to={`/admin/review/${layer.id}`} className="icon-button" title="Tinjau" aria-label="Tinjau layer">
                            <ClipboardCheck size={16} />
                          </Link>
                        ) : null}
                        <button type="button" className="icon-button" onClick={() => void openVersions(layer)} title="Riwayat versi" aria-label="Riwayat versi">
                          <History size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => void download(layer, `/api/layers/${layer.id}/report.pdf`, `laporan-${layer.slug}.pdf`)}
                          title="Unduh laporan PDF"
                          aria-label="Unduh laporan PDF"
                        >
                          <FileDown size={16} />
                        </button>
                        {canDelete(layer) ? (
                          <button
                            type="button"
                            className="icon-button danger"
                            onClick={() => setDeleteTarget(layer)}
                            title="Hapus layer"
                            aria-label="Hapus layer"
                          >
                            <Trash2 size={16} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <Modal
        open={Boolean(versionsLayer)}
        title={versionsLayer ? `Riwayat versi · ${versionsLayer.name}` : 'Riwayat versi'}
        onClose={() => setVersionsLayer(null)}
        width={720}
        footer={
          versionsLayer ? (
            <div className="row-actions end grow">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => void download(versionsLayer, `/api/layers/${versionsLayer.id}/export?format=geojson`, `${versionsLayer.slug}.geojson`)}
              >
                <Download size={14} /> GeoJSON
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => void download(versionsLayer, `/api/layers/${versionsLayer.id}/export?format=csv`, `${versionsLayer.slug}.csv`)}
              >
                <Download size={14} /> CSV
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setVersionsLayer(null)}>
                Tutup
              </button>
            </div>
          ) : null
        }
      >
        {versionsLoading ? <LoadingBlock label="Memuat versi…" /> : null}
        {!versionsLoading && versions.length === 0 ? <p className="muted-text">Belum ada versi tersimpan.</p> : null}
        {!versionsLoading && versions.length > 0 ? (
          <ul className="version-list">
            {versions.map((version) => (
              <li key={version.version}>
                <span className="version-number">v{version.version}</span>
                <div>
                  <strong>{version.change_summary ?? 'Perubahan data'}</strong>
                  <small>
                    {formatNumber(version.feature_count)} fitur · {version.created_by_name ?? 'Sistem'} · {formatDateTime(version.created_at)}
                  </small>
                </div>
                <button type="button" className="btn btn-outline btn-xs" disabled={busy} onClick={() => void restoreVersion(version.version)}>
                  Pulihkan
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        title="Hapus layer"
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setDeleteTarget(null)} disabled={busy}>
              Batal
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void deleteLayer()} disabled={busy}>
              {busy ? 'Menghapus…' : 'Hapus permanen'}
            </button>
          </>
        }
      >
        <p>
          Layer <strong>{deleteTarget?.name}</strong> beserta seluruh fitur dan riwayat versinya akan dihapus permanen. Tindakan ini tidak dapat
          dibatalkan.
        </p>
      </Modal>
    </div>
  );
}
