import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ChartNoAxesCombined,
  ClipboardCheck,
  Layers3,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Menu,
  ScrollText,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { roleLabel } from '../../lib/format';
import { Logo } from '../../components/ui';
import type { Layer } from '../../lib/types';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  adminOnly?: boolean;
  badge?: number;
}

function pageTitle(pathname: string): { title: string; subtitle: string } {
  if (pathname === '/admin') return { title: 'Dashboard', subtitle: 'Ringkasan data dan aktivitas pengelolaan' };
  if (pathname === '/admin/layers/new') return { title: 'Unggah Layer', subtitle: 'Impor data spasial dan validasi sebelum disimpan' };
  if (/^\/admin\/layers\/[^/]+\/edit$/.test(pathname)) return { title: 'Editor Layer', subtitle: 'Gambar, ubah atribut, gaya, dan metadata' };
  if (pathname === '/admin/layers') return { title: 'Daftar Layer', subtitle: 'Kelola seluruh layer dan status penerbitannya' };
  if (/^\/admin\/review\/[^/]+$/.test(pathname)) return { title: 'Tinjauan Penerbitan', subtitle: 'Bandingkan versi dan putuskan penerbitan' };
  if (pathname === '/admin/review') return { title: 'Tinjauan Penerbitan', subtitle: 'Layer yang menunggu persetujuan admin' };
  if (pathname === '/admin/analysis') return { title: 'Analisis Spasial', subtitle: 'Buffer, overlay, radius, dan statistik wilayah' };
  if (pathname === '/admin/users') return { title: 'Pengguna', subtitle: 'Kelola akun editor dan admin' };
  if (pathname === '/admin/audit') return { title: 'Log Aktivitas', subtitle: 'Jejak audit seluruh perubahan data' };
  return { title: 'Panel Admin', subtitle: 'Pengelolaan data spasial' };
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const heading = pageTitle(location.pathname);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    api
      .get<{ layers: Layer[] }>('/api/layers?status=submitted')
      .then((response) => setPendingCount(response.layers.length))
      .catch(() => undefined);
  }, [location.pathname]);

  const items = useMemo<NavItem[]>(
    () => [
      { to: '/admin', label: 'Dashboard', icon: <LayoutDashboard size={18} />, end: true },
      { to: '/admin/layers', label: 'Layer', icon: <Layers3 size={18} /> },
      { to: '/admin/layers/new', label: 'Unggah Layer', icon: <UploadCloud size={18} /> },
      { to: '/admin/review', label: 'Tinjauan', icon: <ClipboardCheck size={18} />, badge: pendingCount },
      { to: '/admin/analysis', label: 'Analisis', icon: <ChartNoAxesCombined size={18} /> },
      { to: '/admin/users', label: 'Pengguna', icon: <Users size={18} />, adminOnly: true },
      { to: '/admin/audit', label: 'Log Aktivitas', icon: <ScrollText size={18} />, adminOnly: true },
    ],
    [pendingCount],
  );

  const initials = (user?.name ?? '?')
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar ${sidebarOpen ? 'is-open' : ''}`} aria-label="Navigasi admin">
        <div className="admin-brand-row">
          <Link to="/admin" className="admin-brand">
            <Logo compact />
          </Link>
          <button type="button" className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Tutup menu">
            <X size={18} />
          </button>
        </div>
        <div className="admin-unit">
          <span>Instansi</span>
          <strong>{user?.unit || 'Dinas Tata Ruang'}</strong>
        </div>

        <nav className="admin-nav">
          {items
            .filter((item) => !item.adminOnly || user?.role === 'admin')
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => {
                  let active = isActive;
                  if (item.to === '/admin/layers') {
                    active = location.pathname.startsWith('/admin/layers') && !location.pathname.startsWith('/admin/layers/new');
                  }
                  if (item.to === '/admin/layers/new') {
                    active = location.pathname === '/admin/layers/new';
                  }
                  return `admin-nav-link ${active ? 'active' : ''}`;
                }}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
              </NavLink>
            ))}
        </nav>

        <div className="admin-sidebar-footer">
          <Link to="/" className="admin-public-link">
            <MapIcon size={16} /> Lihat peta publik
          </Link>
          <button
            type="button"
            className="admin-logout"
            onClick={() => {
              logout();
              navigate('/login', { replace: true });
            }}
          >
            <LogOut size={16} /> Keluar
          </button>
        </div>
      </aside>

      {sidebarOpen ? <button type="button" className="admin-scrim" aria-label="Tutup menu" onClick={() => setSidebarOpen(false)} /> : null}

      <div className="admin-main">
        <header className="admin-topbar">
          <button type="button" className="icon-button topbar-menu" onClick={() => setSidebarOpen(true)} aria-label="Buka menu">
            <Menu size={20} />
          </button>
          <div className="admin-topbar-title">
            <h1>{heading.title}</h1>
            <span>{heading.subtitle}</span>
          </div>
          <div className="admin-topbar-user">
            <span className="avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="topbar-user-text">
              <strong>{user?.name}</strong>
              <small>{roleLabel(user?.role ?? 'editor')}</small>
            </span>
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
              aria-label="Keluar"
              title="Keluar"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
