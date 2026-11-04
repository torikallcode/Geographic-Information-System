import type { Category, LayerStatus } from './types';

export type Lang = 'id' | 'en';

export const CATEGORY_ORDER: Category[] = ['pola_ruang', 'administrasi', 'infrastruktur', 'aset', 'risiko'];

export const CATEGORY_LABELS: Record<Category, { id: string; en: string; icon: string }> = {
  pola_ruang: { id: 'Pola Ruang', en: 'Spatial Plan', icon: 'layout' },
  administrasi: { id: 'Administrasi', en: 'Administrative', icon: 'map' },
  infrastruktur: { id: 'Infrastruktur', en: 'Infrastructure', icon: 'route' },
  aset: { id: 'Aset & Fasilitas', en: 'Assets & Facilities', icon: 'building' },
  risiko: { id: 'Risiko', en: 'Risk', icon: 'alert' },
};

export const STATUS_META: Record<LayerStatus, { id: string; en: string; tone: 'neutral' | 'info' | 'warn' | 'success' | 'muted' }> = {
  draft: { id: 'Draf', en: 'Draft', tone: 'neutral' },
  submitted: { id: 'Diajukan', en: 'Submitted', tone: 'warn' },
  published: { id: 'Terbit', en: 'Published', tone: 'success' },
  archived: { id: 'Arsip', en: 'Archived', tone: 'muted' },
};

export function categoryLabel(category: string, lang: Lang = 'id'): string {
  return CATEGORY_LABELS[category as Category]?.[lang] ?? category;
}

export function statusLabel(status: string, lang: Lang = 'id'): string {
  return STATUS_META[status as LayerStatus]?.[lang] ?? status;
}

export function roleLabel(role: string): string {
  return role === 'admin' ? 'Admin / Approver' : 'Editor';
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(value);
}

export function formatArea(areaM2: number): string {
  if (!Number.isFinite(areaM2)) return '-';
  if (areaM2 >= 1_000_000) return `${formatNumber(areaM2 / 1_000_000, 2)} km²`;
  if (areaM2 >= 10_000) return `${formatNumber(areaM2 / 10_000, 2)} ha`;
  return `${formatNumber(areaM2, 0)} m²`;
}

export function formatLength(lengthKm: number): string {
  if (!Number.isFinite(lengthKm)) return '-';
  if (lengthKm < 1) return `${formatNumber(lengthKm * 1000, 0)} m`;
  return `${formatNumber(lengthKm, 2)} km`;
}

export function formatDate(value: string | null | undefined, lang: Lang = 'id'): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined, lang: Lang = 'id'): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString(lang === 'id' ? 'id-ID' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function labelForAttribute(key: string, labels: Record<string, string> = {}): string {
  return labels[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function attributeValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export const ACTION_LABELS: Record<string, string> = {
  login: 'Masuk',
  change_password: 'Ubah kata sandi',
  reset_password: 'Reset kata sandi',
  create_user: 'Buat pengguna',
  update_user: 'Ubah pengguna',
  import_layer: 'Impor layer',
  update_layer: 'Ubah metadata layer',
  update_style: 'Ubah gaya layer',
  save_features: 'Simpan fitur',
  submit_layer: 'Ajukan layer',
  publish_layer: 'Terbitkan layer',
  reject_layer: 'Tolak layer',
  archive_layer: 'Arsipkan layer',
  delete_layer: 'Hapus layer',
  restore_version: 'Pulihkan versi',
  save_analysis_layer: 'Simpan analisis sebagai layer',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
