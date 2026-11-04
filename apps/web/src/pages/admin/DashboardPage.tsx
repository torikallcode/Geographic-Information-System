import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  Eye,
  FileStack,
  Layers3,
  Plus,
  RefreshCw,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, errorMessage } from '../../lib/api';
import type { DashboardData } from '../../lib/types';
import { actionLabel, categoryLabel, formatDateTime, formatNumber, statusLabel, STATUS_META } from '../../lib/format';
import { EmptyState, LoadingBlock, StatCard, Badge } from '../../components/ui';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<DashboardData>('/api/dashboard'));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const categoryData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.categories).map(([category, value]) => ({
      category: categoryLabel(category),
      layers: value.layers,
      features: value.features,
    }));
  }, [data]);

  const visitsTotal = data?.visits.reduce((sum, item) => sum + item.visits, 0) ?? 0;

  if (loading) return <LoadingBlock label="Memuat dashboard…" />;

  if (error) {
    return (
      <EmptyState
        icon={<AlertCircle size={22} />}
        title="Dashboard gagal dimuat"
        description={error}
        action={
          <button type="button" className="btn btn-primary" onClick={() => void load()}>
            <RefreshCw size={15} /> Coba lagi
          </button>
        }
      />
    );
  }

  if (!data) return null;

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div className="page-toolbar-copy">
          <h2>Selamat datang kembali</h2>
          <p>Pantau data spasial, antrean tinjauan, dan aktivitas terbaru dalam satu tampilan.</p>
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

      <section className="stat-grid" aria-label="Ringkasan data">
        <StatCard label="Total layer" value={formatNumber(data.summary.layers)} hint={`${data.summary.published} terbit`} icon={<Layers3 size={17} />} />
        <StatCard label="Total fitur" value={formatNumber(data.summary.features)} hint="Seluruh layer" icon={<FileStack size={17} />} tone="accent" />
        <StatCard
          label="Menunggu tinjauan"
          value={formatNumber(data.summary.submitted)}
          hint={data.summary.submitted > 0 ? 'Perlu keputusan admin' : 'Tidak ada antrean'}
          icon={<AlertCircle size={17} />}
          tone={data.summary.submitted > 0 ? 'warn' : 'default'}
        />
        <StatCard label="Kunjungan 14 hari" value={formatNumber(visitsTotal)} hint="Portal publik" icon={<Eye size={17} />} />
        <StatCard label="Pengguna aktif" value={formatNumber(data.summary.users)} hint={`${data.summary.draft} layer draf`} icon={<Users size={17} />} />
      </section>

      <div className="dashboard-grid">
        <section className="card chart-card">
          <header className="card-header">
            <div>
              <h3>Layer per kategori</h3>
              <p>Jumlah layer dan fitur yang tersimpan</p>
            </div>
            <BarChart3 size={18} className="muted-icon" />
          </header>
          <div className="chart-body">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={categoryData} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3ebe6" vertical={false} />
                <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#5b6f67' }} interval={0} angle={-12} textAnchor="end" height={54} />
                <YAxis tick={{ fontSize: 11, fill: '#5b6f67' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, borderColor: '#dfe7e2', fontSize: 12 }}
                  formatter={(value: number, name: string) => [formatNumber(value), name === 'layers' ? 'Layer' : 'Fitur']}
                />
                <Bar dataKey="layers" fill="#2f7d5a" radius={[5, 5, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card chart-card">
          <header className="card-header">
            <div>
              <h3>Kunjungan portal publik</h3>
              <p>14 hari terakhir</p>
            </div>
            <Activity size={18} className="muted-icon" />
          </header>
          <div className="chart-body">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.visits} margin={{ top: 8, right: 12, left: -18, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3ebe6" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: '#5b6f67' }}
                  tickFormatter={(value: string) => value.slice(5)}
                  minTickGap={16}
                />
                <YAxis tick={{ fontSize: 11, fill: '#5b6f67' }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 10, borderColor: '#dfe7e2', fontSize: 12 }} />
                <Line type="monotone" dataKey="visits" stroke="#2f7d5a" strokeWidth={2.4} dot={{ r: 2.5, fill: '#2f7d5a' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid-bottom">
        <section className="card">
          <header className="card-header">
            <div>
              <h3>Aktivitas terbaru</h3>
              <p>Perubahan terakhir oleh pengguna</p>
            </div>
            <Link to="/admin/audit" className="text-link">
              Lihat semua <ArrowRight size={13} />
            </Link>
          </header>
          <ul className="activity-list">
            {data.recentActivity.length === 0 ? <li className="muted-text">Belum ada aktivitas.</li> : null}
            {data.recentActivity.map((item) => (
              <li key={item.id}>
                <span className="activity-dot" aria-hidden="true" />
                <div>
                  <strong>{actionLabel(item.action)}</strong>
                  <small>
                    {item.user_name ?? 'Sistem'} · {item.object_type} · {formatDateTime(item.created_at)}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <header className="card-header">
            <div>
              <h3>Layer terbesar</h3>
              <p>Berdasarkan jumlah fitur</p>
            </div>
            <Layers3 size={18} className="muted-icon" />
          </header>
          <div className="table-wrap compact">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Layer</th>
                  <th>Status</th>
                  <th className="align-right">Fitur</th>
                </tr>
              </thead>
              <tbody>
                {data.topLayers.map((layer) => (
                  <tr key={layer.id}>
                    <td>
                      <Link to={`/admin/layers/${layer.id}/edit`} className="table-link">
                        {layer.name}
                      </Link>
                      <small className="table-sub">{categoryLabel(layer.category)}</small>
                    </td>
                    <td>
                      <Badge tone={STATUS_META[layer.status]?.tone ?? 'neutral'}>{statusLabel(layer.status)}</Badge>
                    </td>
                    <td className="align-right mono">{formatNumber(layer.feature_count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {data.summary.submitted > 0 ? (
        <Link to="/admin/review" className="review-banner">
          <AlertCircle size={20} />
          <div>
            <strong>{data.summary.submitted} layer menunggu tinjauan</strong>
            <span>Bandingkan versi, periksa validasi, lalu setujui atau kembalikan ke editor.</span>
          </div>
          <ArrowRight size={18} />
        </Link>
      ) : null}
    </div>
  );
}
