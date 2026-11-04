import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, clearToken, getToken, setToken } from './api';
import type { Role, User } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<{ user: User }>('/api/auth/me')
      .then((response) => setUser(response.user))
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleExpired = () => {
      clearToken();
      setUser(null);
    };
    window.addEventListener('gis:auth-expired', handleExpired);
    return () => window.removeEventListener('gis:auth-expired', handleExpired);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.post<{ token: string; user: User }>(
      '/api/auth/login',
      { email, password },
      { auth: false },
    );
    setToken(response.token);
    setUser(response.user);
    return response.user;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const response = await api.get<{ user: User }>('/api/auth/me');
    setUser(response.user);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, refresh }), [user, loading, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return context;
}

export function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="app-loading">
        <span className="spinner" aria-hidden="true" />
        <p>Memeriksa sesi…</p>
      </div>
    );
  }

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="app-loading">
        <h1>Akses ditolak</h1>
        <p>Halaman ini hanya tersedia untuk peran {roles.map((role) => (role === 'admin' ? 'admin' : 'editor')).join(' / ')}.</p>
        <a className="btn btn-primary" href="/admin">
          Kembali ke dashboard
        </a>
      </div>
    );
  }

  return <>{children}</>;
}
