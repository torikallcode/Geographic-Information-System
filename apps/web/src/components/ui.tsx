import type { ReactNode } from 'react';
import { Loader2, X } from 'lucide-react';

export function Spinner({ size = 18 }: { size?: number }) {
  return <Loader2 size={size} className="spin" aria-hidden="true" />;
}

export function LoadingBlock({ label = 'Memuat data…' }: { label?: string }) {
  return (
    <div className="loading-block">
      <Spinner size={22} />
      <span>{label}</span>
    </div>
  );
}

type BadgeTone = 'neutral' | 'info' | 'warn' | 'success' | 'muted' | 'danger';

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon ? <div className="empty-state-icon">{icon}</div> : null}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 560,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Tutup dialog">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  tone?: 'default' | 'accent' | 'warn' | 'danger';
}) {
  return (
    <div className={`stat-card stat-card-${tone}`}>
      <div className="stat-card-top">
        <span>{label}</span>
        {icon ? <span className="stat-card-icon">{icon}</span> : null}
      </div>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`logo ${compact ? 'logo-compact' : ''}`}>
      <span className="logo-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="30" height="30" fill="none">
          <rect width="32" height="32" rx="9" fill="#1f7a54" />
          <path d="M7 20.5 13 17l5 3 7-4v7l-7 4-5-3-6 3.5v-7Z" fill="#e9f5ee" opacity=".95" />
          <path d="M7 13.5 13 10l5 3 7-4v5l-7 4-5-3-6 3.5v-5Z" fill="#b9e3cb" opacity=".9" />
        </svg>
      </span>
      <span className="logo-text">
        <strong>Tata Ruang</strong>
        {!compact ? <small>Portal GIS Kota Bandung</small> : null}
      </span>
    </span>
  );
}
