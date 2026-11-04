import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, KeyRound, LogIn, Mail, ShieldCheck } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Logo } from '../components/ui';

const DEMO_ACCOUNTS = [
  { label: 'Admin / Approver', email: 'admin@tataruang.go.id', password: 'Admin123!' },
  { label: 'Editor', email: 'editor@tataruang.go.id', password: 'Editor123!' },
];

function AuthAside() {
  return (
    <aside className="auth-aside">
      <Link to="/" className="auth-logo">
        <Logo />
      </Link>
      <div className="auth-aside-copy">
        <span className="eyebrow">Panel Pengelolaan Data</span>
        <h1>Satu sumber data spasial untuk tata ruang yang lebih terbuka.</h1>
        <p>
          Unggah, validasi, tinjau, dan terbitkan layer tata ruang. Semua perubahan tercatat dalam riwayat versi dan log
          aktivitas.
        </p>
        <ul className="auth-features">
          <li>
            <ShieldCheck size={17} /> Kontrol akses berbasis peran editor dan admin.
          </li>
          <li>
            <ShieldCheck size={17} /> Validasi geometri dan sistem koordinat sebelum terbit.
          </li>
          <li>
            <ShieldCheck size={17} /> Layer draf tidak pernah dapat diakses publik.
          </li>
        </ul>
      </div>
      <div className="auth-art" aria-hidden="true">
        <svg viewBox="0 0 520 300" fill="none" preserveAspectRatio="none">
          <path d="M-20 210C60 150 110 250 180 200s90-110 160-60 100 130 200 80" stroke="#6fb794" strokeOpacity=".45" strokeWidth="1.5" />
          <path d="M-20 250C60 190 120 280 190 235s100-100 170-50 90 120 190 70" stroke="#6fb794" strokeOpacity=".3" strokeWidth="1.5" />
          <path d="M-20 170C60 110 110 210 180 160s90-110 160-60 100 130 200 80" stroke="#6fb794" strokeOpacity=".25" strokeWidth="1.5" />
          <circle cx="120" cy="180" r="4" fill="#b9e3cb" />
          <circle cx="330" cy="120" r="5" fill="#b9e3cb" />
          <circle cx="430" cy="200" r="3.5" fill="#b9e3cb" />
        </svg>
      </div>
      <footer className="auth-aside-footer">
        <span>GIS Tata Ruang · MVP</span>
        <span>Data contoh untuk pembelajaran</span>
      </footer>
    </aside>
  );
}

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const next = searchParams.get('next') || '/admin';

  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, navigate, next]);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(next, { replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <AuthAside />
      <main className="auth-main">
        <div className="auth-card">
          <Link to="/" className="back-link">
            <ArrowLeft size={15} /> Kembali ke peta publik
          </Link>
          <header>
            <span className="auth-icon">
              <LogIn size={20} />
            </span>
            <h2>Masuk ke panel admin</h2>
            <p>Kelola data spasial, tinjau pengajuan, dan terbitkan layer.</p>
          </header>

          <form onSubmit={(event) => void handleSubmit(event)} className="auth-form">
            <label className="field">
              <span>Email</span>
              <span className="field-input">
                <Mail size={16} />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nama@instansi.go.id"
                  required
                />
              </span>
            </label>

            <label className="field">
              <span>Kata sandi</span>
              <span className="field-input">
                <KeyRound size={16} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button type="button" className="field-action" onClick={() => setShowPassword((value) => !value)} aria-label="Tampilkan kata sandi">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>

            {error ? <div className="form-error">{error}</div> : null}

            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? 'Memproses…' : 'Masuk'}
            </button>
          </form>

          <div className="auth-links">
            <Link to="/forgot-password">Lupa kata sandi?</Link>
            <Link to="/">Jelajahi peta tanpa masuk</Link>
          </div>

          <div className="demo-accounts">
            <span>Akun demo</span>
            {DEMO_ACCOUNTS.map((account) => (
              <button
                type="button"
                key={account.email}
                onClick={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                }}
              >
                <b>{account.label}</b>
                <small>{account.email}</small>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      const response = await api.post<{ message: string; resetToken?: string }>(
        '/api/auth/forgot-password',
        { email: email.trim() },
        { auth: false },
      );
      setMessage(response.message);
      setResetToken(response.resetToken ?? null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-simple">
      <div className="auth-card">
        <Link to="/login" className="back-link">
          <ArrowLeft size={15} /> Kembali ke halaman masuk
        </Link>
        <header>
          <span className="auth-icon">
            <KeyRound size={20} />
          </span>
          <h2>Reset kata sandi</h2>
          <p>Masukkan email akun. Di lingkungan pengembangan, token reset akan ditampilkan langsung.</p>
        </header>
        <form onSubmit={(event) => void handleSubmit(event)} className="auth-form">
          <label className="field">
            <span>Email</span>
            <span className="field-input">
              <Mail size={16} />
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="nama@instansi.go.id" />
            </span>
          </label>
          {error ? <div className="form-error">{error}</div> : null}
          {message ? <div className="form-success">{message}</div> : null}
          {resetToken ? (
            <div className="reset-token-box">
              <p>Token reset (mode pengembangan):</p>
              <code>{resetToken}</code>
              <Link className="btn btn-primary btn-sm" to={`/reset-password?token=${resetToken}`}>
                Buka halaman reset
              </Link>
            </div>
          ) : null}
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Mengirim…' : 'Buat token reset'}
          </button>
        </form>
      </div>
    </div>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Konfirmasi kata sandi tidak cocok.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await api.post<{ message: string }>(
        '/api/auth/reset-password',
        { token, password },
        { auth: false },
      );
      setMessage(response.message);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-simple">
      <div className="auth-card">
        <Link to="/login" className="back-link">
          <ArrowLeft size={15} /> Kembali ke halaman masuk
        </Link>
        <header>
          <span className="auth-icon">
            <KeyRound size={20} />
          </span>
          <h2>Buat kata sandi baru</h2>
          <p>Kata sandi minimal 8 karakter dan memuat huruf serta angka.</p>
        </header>
        {message ? (
          <div className="form-success">
            {message}
            <Link to="/login" className="btn btn-primary btn-sm">
              Masuk sekarang
            </Link>
          </div>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="auth-form">
            <label className="field">
              <span>Kata sandi baru</span>
              <span className="field-input">
                <KeyRound size={16} />
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} />
              </span>
            </label>
            <label className="field">
              <span>Ulangi kata sandi</span>
              <span className="field-input">
                <KeyRound size={16} />
                <input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required minLength={8} />
              </span>
            </label>
            {!token ? <div className="form-error">Token reset tidak ditemukan pada tautan.</div> : null}
            {error ? <div className="form-error">{error}</div> : null}
            <button type="submit" className="btn btn-primary btn-block" disabled={submitting || !token}>
              {submitting ? 'Menyimpan…' : 'Simpan kata sandi'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="auth-simple">
      <div className="auth-card not-found">
        <span className="eyebrow">404</span>
        <h2>Halaman tidak ditemukan</h2>
        <p>Tautan yang Anda buka tidak tersedia atau sudah dipindahkan.</p>
        <div className="row-actions">
          <Link to="/" className="btn btn-primary">
            Buka peta publik
          </Link>
          <Link to="/admin" className="btn btn-outline">
            Panel admin
          </Link>
        </div>
      </div>
    </div>
  );
}
