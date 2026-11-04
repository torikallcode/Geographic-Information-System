import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Pencil, Plus, RefreshCw, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import type { Role } from '../../lib/types';
import { formatDateTime, roleLabel } from '../../lib/format';
import { Badge, EmptyState, LoadingBlock, Modal } from '../../components/ui';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  unit: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: Role;
  unit: string;
  isActive: boolean;
}

const emptyForm: UserForm = { name: '', email: '', password: '', role: 'editor', unit: '', isActive: true };

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { notify } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ users: AdminUser[] }>('/api/users');
      setUsers(response.users);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate(): void {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(user: AdminUser): void {
    setEditing(user);
    setForm({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      unit: user.unit ?? '',
      isActive: user.is_active,
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      if (editing) {
        await api.patch(`/api/users/${editing.id}`, {
          name: form.name,
          role: form.role,
          unit: form.unit,
          isActive: form.isActive,
          ...(form.password ? { password: form.password } : {}),
        });
        notify('Pengguna diperbarui.', 'success');
      } else {
        await api.post('/api/users', {
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          unit: form.unit,
        });
        notify('Pengguna baru dibuat.', 'success');
      }
      setModalOpen(false);
      await load();
    } catch (caught) {
      setFormError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(user: AdminUser): Promise<void> {
    setBusy(true);
    try {
      await api.patch(`/api/users/${user.id}`, { isActive: !user.is_active });
      notify(user.is_active ? 'Pengguna dinonaktifkan.' : 'Pengguna diaktifkan.', 'success');
      await load();
    } catch (caught) {
      notify(errorMessage(caught), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div className="page-toolbar-copy">
          <h2>Akun pengguna</h2>
          <p>Kelola akses editor dan admin beserta unit kerjanya.</p>
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void load()}>
            <RefreshCw size={15} /> Segarkan
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
            <Plus size={15} /> Tambah pengguna
          </button>
        </div>
      </div>

      {loading ? <LoadingBlock label="Memuat pengguna…" /> : null}
      {!loading && error ? (
        <EmptyState
          icon={<AlertCircle size={22} />}
          title="Pengguna gagal dimuat"
          description={error}
          action={<button type="button" className="btn btn-primary" onClick={() => void load()}>Coba lagi</button>}
        />
      ) : null}

      {!loading && !error ? (
        <div className="card table-card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Email</th>
                  <th>Peran</th>
                  <th>Unit kerja</th>
                  <th>Status</th>
                  <th>Dibuat</th>
                  <th className="align-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-cell">
                        <span className="avatar avatar-sm">{(user.name || '?').split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
                        <span>
                          <strong>{user.name}</strong>
                          {currentUser?.id === user.id ? <small className="table-sub">Akun Anda</small> : null}
                        </span>
                      </div>
                    </td>
                    <td>{user.email}</td>
                    <td>
                      <Badge tone={user.role === 'admin' ? 'success' : 'info'}>
                        {user.role === 'admin' ? <ShieldCheck size={12} /> : null} {roleLabel(user.role)}
                      </Badge>
                    </td>
                    <td>{user.unit || '-'}</td>
                    <td>
                      <Badge tone={user.is_active ? 'success' : 'muted'}>{user.is_active ? 'Aktif' : 'Nonaktif'}</Badge>
                    </td>
                    <td className="nowrap">{formatDateTime(user.created_at)}</td>
                    <td>
                      <div className="row-actions end">
                        <button type="button" className="icon-button" onClick={() => openEdit(user)} title="Ubah pengguna" aria-label="Ubah pengguna">
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className={`icon-button ${user.is_active ? 'danger' : ''}`}
                          onClick={() => void toggleActive(user)}
                          disabled={busy || currentUser?.id === user.id}
                          title={user.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                          aria-label={user.is_active ? 'Nonaktifkan pengguna' : 'Aktifkan pengguna'}
                        >
                          {user.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
                        </button>
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
        open={modalOpen}
        title={editing ? `Ubah pengguna · ${editing.name}` : 'Tambah pengguna baru'}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setModalOpen(false)} disabled={busy}>
              Batal
            </button>
            <button type="submit" form="user-form" className="btn btn-primary" disabled={busy}>
              {busy ? 'Menyimpan…' : 'Simpan'}
            </button>
          </>
        }
      >
        <form id="user-form" className="form-grid" onSubmit={(event) => void save(event)}>
          <label className="field">
            <span>Nama lengkap</span>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required minLength={2} />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              required
              disabled={Boolean(editing)}
            />
          </label>
          <label className="field">
            <span>{editing ? 'Kata sandi baru (opsional)' : 'Kata sandi'}</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              required={!editing}
              minLength={8}
              placeholder={editing ? 'Biarkan kosong bila tidak diubah' : 'Minimal 8 karakter, huruf dan angka'}
            />
          </label>
          <label className="field">
            <span>Peran</span>
            <select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as Role }))}>
              <option value="editor">Editor — mengelola layer sendiri</option>
              <option value="admin">Admin / Approver — menerbitkan dan kelola pengguna</option>
            </select>
          </label>
          <label className="field">
            <span>Unit kerja</span>
            <input value={form.unit} onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))} placeholder="Contoh: Dinas Pekerjaan Umum" />
          </label>
          {editing ? (
            <label className="checkbox-line">
              <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />
              Akun aktif (dapat masuk)
            </label>
          ) : null}
          {formError ? <div className="form-error">{formError}</div> : null}
        </form>
      </Modal>
    </div>
  );
}
