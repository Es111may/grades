'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Avatar from '@/components/Avatar';
import { EditIcon, CloseIcon } from '@/components/icons';

type Build = { id: number; code: string; name: string };
type Lead = { id: number; fullName: string };
type Note = {
  id: number;
  text: string;
  createdAt: string;
  author: { fullName: string };
};

type UserData = {
  id: number;
  email: string;
  fullName: string;
  role: string;
  buildId: number | null;
  build: Build | null;
  department: string | null;
  leadId: number | null;
  lead: Lead | null;
  stardizId: number | null;
  stardiz: Lead | null;
  hiredAt: string | null;
  active: boolean;
  gradeFloor: string | null;
  gradeFloorReason: string | null;
  avatarUrl?: string | null;
};

/**
 * Читает файл, обрезает до квадрата (центр), масштабирует до 256×256
 * и возвращает data URL JPEG. Это держит размер в БД ~10–25 KB.
 */
async function fileToResizedDataUrl(file: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = max;
        canvas.height = max;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas не поддерживается'));
          return;
        }
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, max, max);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

const GRADE_OPTIONS = [
  { value: '', label: 'Не задан' },
  { value: 'junior', label: 'Джун' },
  { value: 'junior_plus', label: 'Джун+' },
  { value: 'premiddle', label: 'Пре-мидл' },
  { value: 'middle', label: 'Мидл' },
  { value: 'middle_plus', label: 'Мидл+' },
  { value: 'senior', label: 'Синьор' },
];

const GRADE_ORDER = ['junior', 'junior_plus', 'premiddle', 'middle', 'middle_plus', 'senior'];

const DEPARTMENTS = ['Инхаус', 'Криэйт', 'Импрув'];

export default function UserModal({
  user,
  isNew,
  builds,
  leads,
  stardizes,
  meRole,
  meId,
  onClose,
  onSaved,
  onDeleted,
}: {
  user: UserData | null;
  isNew: boolean;
  builds: Build[];
  leads: Lead[];
  stardizes: Lead[];
  meRole: string;
  /** id текущего пользователя — нужен для проверки прав «свой подопечный»
   *  у lead/stardiz (выдача паролей). */
  meId: number | null;
  onClose: () => void;
  onSaved: (u: UserData) => void;
  onDeleted: (id: number) => void;
}) {
  const isAdmin = meRole === 'admin';
  // Кто может выдать пароль этому пользователю — синхронизировано с
  // серверной логикой /api/users/[id]/password:
  //   - admin: всем
  //   - lead: designer+stardiz из своего scope (leadId/stardizId === meId)
  //   - stardiz: designer из своего scope
  // Себе пароль не выдашь — это закрыто намеренно (см. сервер).
  let isManagingTarget = false;
  if (meId !== null && user) {
    if (meRole === 'lead') {
      isManagingTarget =
        (user.role === 'designer' || user.role === 'stardiz') &&
        (user.leadId === meId || user.stardizId === meId);
    } else if (meRole === 'stardiz') {
      isManagingTarget =
        user.role === 'designer' &&
        (user.stardizId === meId || user.leadId === meId);
    }
  }
  const canManagePassword = !isNew && (isAdmin || isManagingTarget);
  const [form, setForm] = useState({
    fullName: user?.fullName ?? '',
    email: user?.email ?? '',
    role: user?.role ?? 'designer',
    buildId: user?.buildId ?? null as number | null,
    department: user?.department ?? '',
    leadId: user?.leadId ?? null as number | null,
    stardizId: user?.stardizId ?? null as number | null,
    hiredAt: user?.hiredAt ? user.hiredAt.split('T')[0] : '',
    active: user?.active ?? true,
    gradeFloor: user?.gradeFloor ?? '',
    gradeFloorReason: user?.gradeFloorReason ?? '',
  });

  const [floorEnabled, setFloorEnabled] = useState(!!user?.gradeFloor);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Можно загружать только изображения');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Слишком большой файл (>10 MB)');
      return;
    }
    setAvatarBusy(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      setAvatarUrl(dataUrl);
    } catch (err) {
      alert(`Не удалось обработать: ${(err as Error).message}`);
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleAvatarRemove() {
    setAvatarUrl(null);
  }
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [confirmLower, setConfirmLower] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pwdMode, setPwdMode] = useState<'idle' | 'manual' | 'shown'>('idle');
  const [pwdManual, setPwdManual] = useState('');
  const [pwdResult, setPwdResult] = useState<string | null>(null);
  const [pwdSaving, setPwdSaving] = useState(false);

  async function handleSetPassword(useManual: boolean) {
    if (!user?.id) return;
    if (useManual && pwdManual.length < 8) {
      alert('Минимум 8 символов');
      return;
    }
    setPwdSaving(true);
    try {
      const res = await fetch(`/api/users/${user.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(useManual ? { password: pwdManual } : {}),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(`Ошибка: ${j.error ?? 'не получилось'}`);
        return;
      }
      setPwdResult(j.password);
      setPwdMode('shown');
      setPwdManual('');
    } finally {
      setPwdSaving(false);
    }
  }

  async function copyPwd() {
    if (!pwdResult) return;
    try {
      await navigator.clipboard.writeText(pwdResult);
    } catch {
      // ignore
    }
  }

  const loadNotes = useCallback(async () => {
    if (!user?.id) return;
    const res = await fetch(`/api/users/${user.id}/notes`);
    if (res.ok) setNotes(await res.json());
  }, [user?.id]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  }

  function isLoweringFloor(): boolean {
    if (!user?.gradeFloor || !form.gradeFloor) return false;
    const beforeIdx = GRADE_ORDER.indexOf(user.gradeFloor);
    const afterIdx = GRADE_ORDER.indexOf(form.gradeFloor);
    return afterIdx < beforeIdx;
  }

  async function handleSave() {
    if (!form.fullName.trim() || !form.email.trim()) {
      setError('Заполни имя и email');
      return;
    }

    if (isLoweringFloor() && !confirmLower) {
      setConfirmLower(true);
      return;
    }

    setSaving(true);
    setError('');

    const payload = {
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      role: form.role,
      buildId: form.role === 'designer' ? form.buildId : null,
      department: form.department || null,
      // Лид может быть и у дизайнера, и у стардиза (стардизы тоже грейдируются).
      leadId:
        form.role === 'designer' || form.role === 'stardiz' ? form.leadId : null,
      stardizId: form.role === 'designer' ? form.stardizId : null,
      hiredAt: form.hiredAt || null,
      active: form.active,
      gradeFloor: floorEnabled && form.gradeFloor ? form.gradeFloor : null,
      gradeFloorReason:
        floorEnabled && form.gradeFloor ? form.gradeFloorReason || null : null,
      avatarUrl,
    };

    const url = isNew ? '/api/users' : `/api/users/${user!.id}`;
    const method = isNew ? 'POST' : 'PATCH';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? `Ошибка ${res.status}`);
      setSaving(false);
      return;
    }

    const saved = await res.json();
    onSaved(saved);
    setSaving(false);
    setConfirmLower(false);
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const res = await fetch(`/api/users/${user!.id}`, { method: 'DELETE' });
    if (res.ok) {
      onDeleted(user!.id);
    }
  }

  const [confirmHard, setConfirmHard] = useState(false);
  const [hardBusy, setHardBusy] = useState(false);
  const [reassignTo, setReassignTo] = useState<number | ''>('');

  const isLeadOrStardiz = user?.role === 'lead' || user?.role === 'stardiz';
  // Список других активных лидов/стардизов для переноса.
  const reassignTargets = leads.filter((l) => l.id !== user?.id);

  async function handleHardDelete() {
    if (!confirmHard) {
      setConfirmHard(true);
      return;
    }
    if (isLeadOrStardiz && !reassignTo) {
      alert('Выбери, на кого перенести подопечных, заметки и оценки');
      return;
    }
    setHardBusy(true);
    const qs = isLeadOrStardiz ? `&reassignTo=${reassignTo}` : '';
    const res = await fetch(`/api/users/${user!.id}?hard=true${qs}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      onDeleted(user!.id);
    } else {
      const j = await res.json().catch(() => ({}));
      alert(j.message ?? j.error ?? 'Не получилось удалить навсегда');
      setHardBusy(false);
    }
  }

  async function handleAddNote() {
    if (!newNote.trim() || !user?.id) return;
    const res = await fetch(`/api/users/${user.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newNote.trim() }),
    });
    if (res.ok) {
      const note = await res.json();
      setNotes((prev) => [note, ...prev]);
      setNewNote('');
    }
  }

  const roleLabel =
    form.role === 'designer'
      ? 'Дизайнер'
      : form.role === 'stardiz'
        ? 'Стардиз'
        : form.role === 'lead'
          ? 'Лид'
          : 'Админ';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-10 pb-10">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl overflow-y-auto max-h-[calc(100vh-80px)] bg-snow rounded-modal shadow-soft-lg">
        {/* Header */}
        <div className="sticky top-0 px-7 py-4 flex items-center gap-4 rounded-t-modal border-b border-cloud z-10 bg-snow/95 backdrop-blur-md">
          {/* Аватар: hover → overlay «Загрузить/Заменить», в углу — X для удаления */}
          <div className="relative group shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarBusy}
              aria-label={avatarUrl ? 'Заменить аватар' : 'Загрузить аватар'}
              className="block rounded-pill"
            >
              <Avatar name={form.fullName || '?'} avatarUrl={avatarUrl} size={48} />
              <span
                className="absolute inset-0 rounded-pill bg-ink/60 text-snow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-hidden
              >
                {avatarBusy ? (
                  <span className="text-xs">…</span>
                ) : (
                  <EditIcon className="w-4 h-4" />
                )}
              </span>
            </button>
            {avatarUrl && (
              <button
                type="button"
                onClick={handleAvatarRemove}
                aria-label="Удалить аватар"
                className="absolute -top-1 -right-1 w-5 h-5 rounded-pill bg-snow border border-cloud text-stone hover:text-blaze hover:border-blaze/40 shadow-soft flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <CloseIcon className="w-3 h-3" />
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarPick}
              className="hidden"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-[11px]  text-stone mb-0.5">
              {isNew ? 'Новый пользователь' : roleLabel}
            </div>
            <h2 className="font-display text-xl font-medium tracking-tight truncate">
              {isNew ? 'Новый пользователь' : form.fullName || '—'}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onClose} className="btn-ghost btn-sm">
              Отмена
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-accent btn-sm">
              {saving ? 'Сохраняю…' : 'Сохранить'}
            </button>
          </div>
        </div>

        <div className="p-7 space-y-7">
          {error && (
            <div className="bg-blaze/8 border border-blaze/25 rounded-card px-4 py-3 text-sm text-blaze">
              {typeof error === 'string' ? error : JSON.stringify(error)}
            </div>
          )}

          {/* Basic fields */}
          <section>
            <div className="text-xs  text-stone mb-3">
              Основное
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-stone mb-1.5">ФИО</label>
                <input
                  className="input"
                  value={form.fullName}
                  onChange={(e) => set('fullName', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-stone mb-1.5">Email</label>
                <input
                  className="input"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-stone mb-1.5">Роль</label>
                <select
                  className="input"
                  value={form.role}
                  onChange={(e) => set('role', e.target.value)}
                >
                  <option value="designer">Дизайнер</option>
                  <option value="stardiz">Стардиз</option>
                  <option value="lead">Лид</option>
                  {/* Только админ может назначать админов */}
                  {(isAdmin || form.role === 'admin') && (
                    <option value="admin" disabled={!isAdmin}>
                      Админ {!isAdmin && '(только админ может назначить)'}
                    </option>
                  )}
                </select>
              </div>
              {form.role === 'designer' && (
                <div>
                  <label className="block text-xs text-stone mb-1.5">Билд</label>
                  <select
                    className="input"
                    value={form.buildId ?? ''}
                    onChange={(e) =>
                      set('buildId', e.target.value ? Number(e.target.value) : null)
                    }
                  >
                    <option value="">Не назначен</option>
                    {builds.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs text-stone mb-1.5">Отдел</label>
                <select
                  className="input"
                  value={form.department ?? ''}
                  onChange={(e) => set('department', e.target.value)}
                >
                  <option value="">Не указан</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              {(form.role === 'designer' || form.role === 'stardiz') && (
                <div>
                  <label className="block text-xs text-stone mb-1.5">Лид</label>
                  <select
                    className="input"
                    value={form.leadId ?? ''}
                    onChange={(e) =>
                      set('leadId', e.target.value ? Number(e.target.value) : null)
                    }
                  >
                    <option value="">Не назначен</option>
                    {leads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.fullName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {form.role === 'designer' && (
                <div>
                  <label className="block text-xs text-stone mb-1.5">
                    Стардиз{' '}
                    <span className="text-ash">(дополнительный наставник)</span>
                  </label>
                  <select
                    className="input"
                    value={form.stardizId ?? ''}
                    onChange={(e) =>
                      set('stardizId', e.target.value ? Number(e.target.value) : null)
                    }
                  >
                    <option value="">Не назначен</option>
                    {stardizes
                      .filter((s) => s.id !== user?.id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.fullName}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs text-stone mb-1.5">Дата найма</label>
                <input
                  type="date"
                  className="input"
                  value={form.hiredAt}
                  onChange={(e) => set('hiredAt', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-stone mb-1.5">Активен</label>
                <div className="flex items-center gap-3 pt-2.5">
                  <button
                    type="button"
                    onClick={() => set('active', !form.active)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${
                      form.active ? 'bg-emerald' : 'bg-cloud'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        form.active ? 'left-[18px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                  <span className="text-sm">
                    {form.active ? 'Учётка активна' : 'Деактивирован'}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Grade floor */}
          <section className="bg-canvas border border-cloud rounded-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-medium text-sm">
                  Зафиксированный грейд (grade floor)
                </div>
                <div className="text-xs text-graphite mt-0.5">
                  Используется при переходе со старой системы — чтобы не откатывать
                  уровень
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFloorEnabled(!floorEnabled);
                  if (floorEnabled) {
                    set('gradeFloor', '');
                    set('gradeFloorReason', '');
                  }
                }}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  floorEnabled ? 'bg-emerald' : 'bg-cloud'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    floorEnabled ? 'left-[18px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <label className="block text-xs text-graphite mb-1.5">
                  Минимальный грейд
                </label>
                <select
                  className="input disabled:opacity-50"
                  disabled={!floorEnabled}
                  value={form.gradeFloor}
                  onChange={(e) => set('gradeFloor', e.target.value)}
                >
                  {GRADE_OPTIONS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-graphite mb-1.5">
                  Обоснование
                </label>
                <input
                  className="input disabled:opacity-50"
                  disabled={!floorEnabled}
                  placeholder="Например: переход со старой системы"
                  value={form.gradeFloorReason}
                  onChange={(e) => set('gradeFloorReason', e.target.value)}
                />
              </div>
            </div>

            {confirmLower && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-card p-4">
                <div className="text-sm font-medium text-red-800 mb-2">
                  Подтверди понижение grade floor
                </div>
                <div className="text-xs text-red-700 mb-3">
                  Ты понижаешь grade floor с{' '}
                  <strong>
                    {GRADE_OPTIONS.find((g) => g.value === user?.gradeFloor)?.label}
                  </strong>{' '}
                  до{' '}
                  <strong>
                    {GRADE_OPTIONS.find((g) => g.value === form.gradeFloor)?.label}
                  </strong>
                  . Это действие будет записано в аудит-лог.
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmLower(false)}
                    className="px-3 py-1.5 text-xs rounded-pill border border-cloud hover:border-ash"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-3 py-1.5 text-xs rounded-pill bg-red-600 text-white hover:bg-red-700"
                  >
                    Да, понизить
                  </button>
                </div>
              </div>
            )}

            <div className="text-xs text-stone mt-3">
              <strong className="text-graphite">Правило:</strong> Понижение grade_floor —
              только Admin, с подтверждением. Все изменения фиксируются в аудит-логе.
            </div>
          </section>

          {/* Notes */}
          {!isNew && (
            <section>
              <div className="text-xs  text-stone mb-3">
                Заметка по дизайнеру
              </div>
              <textarea
                rows={3}
                className="input"
                placeholder="Контекст, договорённости, особенности — приватно для лидов и админов"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <div className="flex items-center justify-between mt-2">
                <div className="text-xs text-stone">
                  Не показывается дизайнеру. Привязана к человеку, переживает циклы.
                </div>
                {newNote.trim() && (
                  <button
                    onClick={handleAddNote}
                    className="px-3 py-1.5 text-xs rounded-pill bg-ink text-snow hover:bg-graphite transition"
                  >
                    Добавить заметку
                  </button>
                )}
              </div>
              {notes.length > 0 && (
                <div className="mt-4 space-y-3">
                  {notes.map((n) => (
                    <div
                      key={n.id}
                      className="bg-canvas border border-cloud rounded-card p-4"
                    >
                      <div className="text-sm whitespace-pre-wrap">{n.text}</div>
                      <div className="text-xs text-stone mt-2">
                        {n.author.fullName} ·{' '}
                        {new Date(n.createdAt).toLocaleDateString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Пароль — admin всем, lead/stardiz только своему дизайнеру */}
          {canManagePassword && (
            <section>
              <div className="text-xs  text-stone mb-3">
                Пароль для входа
              </div>
              <div className="card p-5">
                {pwdMode === 'shown' && pwdResult ? (
                  <div className="space-y-3">
                    <div className="text-sm">
                      Новый пароль для <strong>{user?.email}</strong>
                    </div>
                    <div className="bg-canvas border border-lime/40 rounded-card p-3 flex items-center justify-between gap-3">
                      <code className="font-mono text-base select-all">{pwdResult}</code>
                      <button onClick={copyPwd} className="btn-ghost btn-sm">
                        Скопировать
                      </button>
                    </div>
                    <p className="text-xs text-sunset">
                      Пароль показан один раз — скопируй и отправь пользователю.
                    </p>
                    <button
                      onClick={() => {
                        setPwdMode('idle');
                        setPwdResult(null);
                      }}
                      className="btn-ghost btn-sm"
                    >
                      Скрыть
                    </button>
                  </div>
                ) : pwdMode === 'manual' ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={pwdManual}
                      onChange={(e) => setPwdManual(e.target.value)}
                      placeholder="Минимум 8 символов"
                      className="input font-mono"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSetPassword(true)}
                        disabled={pwdSaving || pwdManual.length < 8}
                        className="btn-accent btn-sm"
                      >
                        {pwdSaving ? 'Сохраняю…' : 'Сохранить'}
                      </button>
                      <button
                        onClick={() => {
                          setPwdMode('idle');
                          setPwdManual('');
                        }}
                        disabled={pwdSaving}
                        className="btn-ghost btn-sm"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium text-sm">
                        Сгенерировать пароль или задать вручную
                      </div>
                      <div className="text-xs text-stone mt-1 leading-relaxed">
                        Покажем один раз — отправь пользователю любым удобным каналом.
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => setPwdMode('manual')}
                        className="btn-secondary btn-sm"
                      >
                        Задать вручную
                      </button>
                      <button
                        onClick={() => handleSetPassword(false)}
                        disabled={pwdSaving}
                        className="btn-accent btn-sm"
                      >
                        {pwdSaving ? 'Генерирую…' : 'Сгенерировать'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Danger zone */}
          {!isNew && (
            <section>
              <div className="text-xs  text-stone mb-3">
                Опасная зона
              </div>
              <div className="card p-5 flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-sm">Деактивировать пользователя</div>
                  <div className="text-xs text-stone mt-1 leading-relaxed">
                    История оценок сохранится в архиве.
                  </div>
                </div>
                {confirmDelete ? (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="btn-ghost btn-sm"
                    >
                      Отмена
                    </button>
                    <button onClick={handleDelete} className="btn-danger btn-sm">
                      Да, деактивировать
                    </button>
                  </div>
                ) : (
                  <button onClick={handleDelete} className="btn-ghost-danger btn-sm">
                    Деактивировать
                  </button>
                )}
              </div>

              {/* Hard-delete — только admin */}
              {isAdmin && (
                <div className="card p-5 mt-3 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium text-sm">Удалить навсегда</div>
                      <div className="text-xs text-stone mt-1 leading-relaxed">
                        {isLeadOrStardiz
                          ? 'Для лида/стардиза нужно выбрать, на кого перенести подопечных, заметки и оценки.'
                          : 'Дизайнер удалится со всеми оценками и заметками без переноса.'}
                      </div>
                    </div>
                    {!confirmHard && (
                      <button
                        onClick={handleHardDelete}
                        className="btn-ghost-danger btn-sm shrink-0"
                      >
                        Удалить навсегда
                      </button>
                    )}
                  </div>

                  {confirmHard && (
                    <div className="space-y-3 pt-1">
                      {isLeadOrStardiz && (
                        <div>
                          <label className="block text-xs text-stone mb-1.5">
                            Переназначить на
                          </label>
                          <select
                            className="input"
                            value={reassignTo}
                            onChange={(e) =>
                              setReassignTo(e.target.value ? Number(e.target.value) : '')
                            }
                          >
                            <option value="">Выбрать…</option>
                            {reassignTargets.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.fullName}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="flex gap-1.5 justify-end">
                        <button
                          onClick={() => {
                            setConfirmHard(false);
                            setReassignTo('');
                          }}
                          disabled={hardBusy}
                          className="btn-ghost btn-sm"
                        >
                          Отмена
                        </button>
                        <button
                          onClick={handleHardDelete}
                          disabled={hardBusy || (isLeadOrStardiz && !reassignTo)}
                          className="btn-danger btn-sm"
                        >
                          {hardBusy ? 'Удаляю…' : 'Да, удалить навсегда'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
