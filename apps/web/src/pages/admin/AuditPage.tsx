import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, RefreshCw, ScrollText } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { AuditLog } from '../../lib/types';
import { ACTION_LABELS, actionLabel, formatDateTime } from '../../lib/format';
import { Badge, EmptyState, LoadingBlock } from '../../components/ui';

interface AuditResponse {
  logs: AuditLog[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export default function AuditPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (action) params.set('action', action);
      setData(await api.get<AuditResponse>(`/api/audit-logs?${params.toString()}`));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [page, action]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div className="page-toolbar-copy">
          <h2>Jejak audit</h2>
          <p>Setiap perubahan data dan tindakan pengguna tercatat di sini.</p>
        </div>
        <div className="row-actions">
          <label className="select-field">
            <span>Aksi</span>
            <select
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua aksi</option>
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void load()}>
            <RefreshCw size={15} /> Segarkan
          </button>
        </div>
      </div>

      {loading ? <LoadingBlock label="Memuat log aktivitas…" /> : null}
      {!loading && error ? (
        <EmptyState
          icon={<AlertCircle size={22} />}
          title="Log gagal dimuat"
          description={error}
          action={<button type="button" className="btn btn-primary" onClick={() => void load()}>Coba lagi</button>}
        />
      ) : null}

      {!loading && !error && data && data.logs.length === 0 ? (
        <EmptyState icon={<ScrollText size={24} />} title="Belum ada aktivitas" description="Aktivitas pengguna akan muncul di sini setelah ada perubahan data." />
      ) : null}

      {!loading && !error && data && data.logs.length > 0 ? (
        <>
          <div className="card table-card">
            <div className="table-wrap">
              <table className="data-table audit-table">
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>Pengguna</th>
                    <th>Aksi</th>
                    <th>Objek</th>
                    <th>Detail</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logs.map((log) => (
                    <tr key={log.id}>
                      <td className="nowrap">{formatDateTime(log.created_at)}</td>
                      <td>
                        <div className="table-primary">{log.user_name ?? 'Sistem'}</div>
                        {log.user_email ? <small className="table-sub">{log.user_email}</small> : null}
                      </td>
                      <td>
                        <Badge tone="info">{actionLabel(log.action)}</Badge>
                      </td>
                      <td>
                        <span className="mono small-text">{log.object_type}</span>
                        {log.object_id ? <small className="table-sub mono">{log.object_id.slice(0, 8)}…</small> : null}
                      </td>
                      <td>
                        {Object.keys(log.details ?? {}).length > 0 ? (
                          <details className="json-details">
                            <summary>Lihat detail</summary>
                            <pre>{JSON.stringify(log.details, null, 2)}</pre>
                          </details>
                        ) : (
                          <span className="muted-text">—</span>
                        )}
                      </td>
                      <td className="mono small-text">{log.ip ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pagination">
            <span>
              Menampilkan {data.logs.length} dari {data.pagination.total} catatan · halaman {data.pagination.page} / {data.pagination.pages}
            </span>
            <div className="row-actions">
              <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                <ChevronLeft size={14} /> Sebelumnya
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={page >= data.pagination.pages}
                onClick={() => setPage((current) => current + 1)}
              >
                Berikutnya <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
