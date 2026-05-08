'use client';

import { useState, useEffect, useCallback } from 'react';

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
};

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

const DEPARTMENTS = ['Inhouse', 'Create', 'Improve'];

export default function UserModal({
  user,
  isNew,
  builds,
  leads,
  stardizes,
  meRole,
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
  onClose: () => void;
  onSaved: (u: UserData) => void;
  onDeleted: (id: number) => void;
}) {
  const isAdmin = meRole === 'admin';
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
      leadId: form.role === 'designer' ? form.leadId : null,
      stardizId: form.role === 'designer' ? form.stardizId : null,
      hiredAt: form.hiredAt || null,
      active: form.active,
      gradeFloor: floorEnabled && form.gradeFloor ? form.gradeFloor : null,
      gradeFloorReason:
        floorEnabled && form.gradeFloor ? form.gradeFloorReason || null : null,
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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl mt-10 mb-10 overflow-y-auto max-h-[calc(100vh-80px)] bg-canvas rounded-modal shadow-[0_24px_60px_rgba(35,37,41,0.18)]">
        {/* Header */}
        <div className="sticky top-0 px-7 py-4 flex items-center justify-between rounded-t-modal border-b border-cloud z-10 bg-canvas">
          <div>
            <div className="text-xs uppercase tracking-widest text-stone">
              {isNew ? 'Новый пользователь' : `Команда / ${form.role === 'designer' ? 'Дизайнер' : form.role === 'lead' ? 'Лид' : 'Админ'}`}
            </div>
            <h2 className="font-display text-2xl tracking-tight mt-0.5">
              {isNew ? 'Новый пользователь' : form.fullName || '—'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-stone hover:text-ink transition">
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-lime border border-lime rounded-pill px-5 py-2 text-sm font-medium hover:brightness-95 transition disabled:opacity-50"
            >
              {saving ? 'Сохраняю…' : 'Сохранить'}
            </button>
          </div>
        </div>

        <div className="p-7 space-y-7 bg-white">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-card px-4 py-3 text-sm text-red-700">
              {typeof error === 'string' ? error : JSON.stringify(error)}
            </div>
          )}

          {/* Basic fields */}
          <section>
            <div className="text-xs uppercase tracking-widest text-stone mb-3">
              Основное
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-stone mb-1.5">ФИО</label>
                <input
                  className="w-full px-3 py-2 text-sm border border-cloud rounded-card bg-white focus:outline-none focus:border-ash"
                  value={form.fullName}
                  onChange={(e) => set('fullName', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-stone mb-1.5">Email</label>
                <input
                  className="w-full px-3 py-2 text-sm border border-cloud rounded-card bg-white focus:outline-none focus:border-ash"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-stone mb-1.5">Роль</label>
                <select
                  className="w-full px-3 py-2 text-sm border border-cloud rounded-card bg-white focus:outline-none focus:border-ash"
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
                    className="w-full px-3 py-2 text-sm border border-cloud rounded-card bg-white focus:outline-none focus:border-ash"
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
                  className="w-full px-3 py-2 text-sm border border-cloud rounded-card bg-white focus:outline-none focus:border-ash"
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
              {form.role === 'designer' && (
                <div>
                  <label className="block text-xs text-stone mb-1.5">Лид</label>
                  <select
                    className="w-full px-3 py-2 text-sm border border-cloud rounded-card bg-white focus:outline-none focus:border-ash"
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
                    className="w-full px-3 py-2 text-sm border border-cloud rounded-card bg-white focus:outline-none focus:border-ash"
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
                  className="w-full px-3 py-2 text-sm border border-cloud rounded-card bg-white focus:outline-none focus:border-ash"
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
                      form.active ? 'bg-lime' : 'bg-cloud'
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
                  floorEnabled ? 'bg-lime' : 'bg-cloud'
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
                  className="w-full px-3 py-2 text-sm border border-cloud rounded-card bg-white focus:outline-none focus:border-ash disabled:opacity-50"
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
                  className="w-full px-3 py-2 text-sm border border-cloud rounded-card bg-white focus:outline-none focus:border-ash disabled:opacity-50"
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
              <div className="text-xs uppercase tracking-widest text-stone mb-3">
                Заметка по дизайнеру
              </div>
              <textarea
                rows={3}
                className="w-full px-3 py-2 text-sm border border-cloud rounded-card bg-white focus:outline-none focus:border-ash"
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
                    className="px-3 py-1.5 text-xs rounded-pill bg-ink text-white hover:bg-graphite transition"
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

          {/* Password — admin only */}
          {!isNew && isAdmin && (
            <section>
              <div className="text-xs uppercase tracking-widest text-stone mb-3">
                Пароль для входа
              </div>
              <div className="bg-white border border-cloud rounded-card p-5">
                {pwdMode === 'shown' && pwdResult ? (
                  <div className="space-y-3">
                    <div className="text-sm">
                      Новый пароль для <strong>{user?.email}</strong>:
                    </div>
                    <div className="bg-canvas border border-lime rounded p-3 flex items-center justify-between gap-3">
                      <code className="font-mono text-base select-all">{pwdResult}</code>
                      <button
                        onClick={copyPwd}
                        className="text-xs text-stone hover:text-ink whitespace-nowrap"
                      >
                        Скопировать
                      </button>
                    </div>
                    <p className="text-xs text-sunset leading-relaxed">
                      Пароль показан один раз. Скопируй и отправь пользователю —
                      после закрытия окна снова посмотреть его не сможешь.
                    </p>
                    <button
                      onClick={() => {
                        setPwdMode('idle');
                        setPwdResult(null);
                      }}
                      className="text-xs text-stone hover:text-ink"
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
                      className="w-full bg-canvas border border-cloud rounded px-3 py-2 text-sm font-mono"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSetPassword(true)}
                        disabled={pwdSaving || pwdManual.length < 8}
                        className="px-4 py-2 text-xs rounded-pill bg-lime border border-lime disabled:opacity-50"
                      >
                        {pwdSaving ? 'Сохраняю…' : 'Сохранить'}
                      </button>
                      <button
                        onClick={() => {
                          setPwdMode('idle');
                          setPwdManual('');
                        }}
                        disabled={pwdSaving}
                        className="px-3 py-1.5 text-xs text-stone hover:text-ink"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">
                        {user?.email
                          ? 'Сгенерировать пароль или задать вручную'
                          : '—'}
                      </div>
                      <div className="text-xs text-stone mt-1">
                        Пароль покажется один раз — отправишь пользователю любым удобным каналом.
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPwdMode('manual')}
                        className="px-3 py-1.5 text-xs rounded-pill border border-cloud hover:bg-canvas"
                      >
                        Задать вручную
                      </button>
                      <button
                        onClick={() => handleSetPassword(false)}
                        disabled={pwdSaving}
                        className="px-4 py-2 text-xs rounded-pill bg-lime border border-lime hover:brightness-95 disabled:opacity-50"
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
              <div className="text-xs uppercase tracking-widest text-stone mb-3">
                Опасная зона
              </div>
              <div className="bg-white border border-cloud rounded-card p-5 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">Деактивировать пользователя</div>
                  <div className="text-xs text-stone mt-1">
                    История оценок сохранится в архиве.
                  </div>
                </div>
                {confirmDelete ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="px-3 py-1.5 text-xs rounded-pill border border-cloud"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={handleDelete}
                      className="px-3 py-1.5 text-xs rounded-pill bg-blaze text-white"
                    >
                      Да, деактивировать
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 text-xs rounded-pill bg-blaze/10 text-blaze border border-blaze/30 hover:bg-blaze/20 transition"
                  >
                    Деактивировать
                  </button>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
