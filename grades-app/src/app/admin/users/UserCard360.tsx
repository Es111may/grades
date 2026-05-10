'use client';

import { useEffect } from 'react';

type Build = { id: number; code: string; name: string };
type Lead = { id: number; fullName: string };

export type UserCardData = {
  id: number;
  email: string;
  fullName: string;
  role: string;
  build: Build | null;
  department: string | null;
  leadId: number | null;
  lead: Lead | null;
  stardizId: number | null;
  stardiz: Lead | null;
  hiredAt: string | null;
  active: boolean;
  gradeFloor: string | null;
  effectiveGrade?: string | null;
  lastAssessedAt?: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'Админ',
  lead: 'Лид',
  stardiz: 'Стардиз',
  designer: 'Дизайнер',
};

const ROLE_TONE: Record<string, string> = {
  admin: 'bg-[#fff7e6] text-sunset border border-sunset/25',
  lead: 'bg-lime-light text-graphite border border-lime/30',
  stardiz: 'bg-[#ede9fe] text-[#6d28d9] border border-[#a78bfa]/30',
  designer: 'bg-canvas text-stone border border-cloud',
};

const GRADE_NAMES: Record<string, string> = {
  junior: 'Джун',
  junior_plus: 'Джун+',
  premiddle: 'Пре-мидл',
  middle: 'Мидл',
  middle_plus: 'Мидл+',
  senior: 'Синьор',
};

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const buildColor = (code: string) =>
  code === 'creator' ? '#00ca48' : code === 'visioner' ? '#7c3aed' : '#0ea5e9';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function UserCard360({
  user,
  meId,
  meRole,
  onClose,
  onEdit,
  onDeactivated,
}: {
  user: UserCardData;
  meId: number | null;
  meRole: string;
  onClose: () => void;
  onEdit: (user: UserCardData) => void;
  onDeactivated: (id: number) => void;
}) {
  // Закрытие по Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isSelf = meId !== null && meId === user.id;

  // Это «свой» подопечный для лида/стардиза?
  const isMine =
    meId !== null &&
    ((meRole === 'lead' && user.leadId === meId) ||
      (meRole === 'stardiz' && (user.stardizId === meId || user.leadId === meId)));

  const canEdit = meRole === 'admin' || (isMine && (meRole === 'lead' || meRole === 'stardiz'));

  const canAssess =
    user.role === 'designer' &&
    user.active &&
    !isSelf &&
    (meRole === 'admin' || isMine);

  const canDeactivate = meRole === 'admin' && !isSelf && user.active;

  const canOpenPortrait = user.role === 'designer' && user.active;

  async function handleDeactivate() {
    if (!confirm(`Деактивировать ${user.fullName}? Пользователь не сможет войти.`)) return;
    const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
    if (res.ok) {
      onDeactivated(user.id);
    } else {
      const j = await res.json().catch(() => ({}));
      alert(`Не удалось деактивировать: ${j.error ?? res.statusText}`);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-16 pb-10">
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl bg-snow rounded-modal shadow-soft-lg overflow-hidden">
        {/* Header */}
        <div className="px-7 pt-6 pb-5 border-b border-cloud">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-pill bg-cloud flex items-center justify-center text-base font-semibold tracking-tight shrink-0">
              {initials(user.fullName)}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-2xl font-semibold tracking-tight leading-tight truncate">
                {user.fullName}
              </h2>
              <div className="text-sm text-stone mt-0.5 truncate">{user.email}</div>
              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-pill text-[11px] font-medium ${
                    ROLE_TONE[user.role] ?? ROLE_TONE.designer
                  }`}
                >
                  {ROLE_LABEL[user.role] ?? user.role}
                </span>
                {user.build && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill border border-cloud bg-canvas text-[11px] font-medium text-stone">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: buildColor(user.build.code) }}
                    />
                    {user.build.name}
                  </span>
                )}
                {!user.active && (
                  <span className="inline-flex px-2 py-0.5 rounded-pill bg-blaze/10 text-blaze text-[11px] font-medium">
                    Неактивен
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="btn-ghost btn-sm shrink-0"
              aria-label="Закрыть"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Грейд + дата последней оценки */}
        {user.role === 'designer' && (
          <div className="px-7 py-5 bg-canvas/60 border-b border-cloud">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-stone mb-1">
                  {user.gradeFloor ? 'Эфф. грейд' : 'Грейд'}
                </div>
                <div className="font-display text-2xl font-semibold tracking-tight">
                  {user.effectiveGrade
                    ? GRADE_NAMES[user.effectiveGrade] ?? user.effectiveGrade
                    : '—'}
                </div>
              </div>
              {user.gradeFloor && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-stone mb-1">
                    Floor
                  </div>
                  <div className="font-display text-2xl font-semibold tracking-tight text-sunset">
                    {GRADE_NAMES[user.gradeFloor] ?? user.gradeFloor}
                  </div>
                </div>
              )}
              <div className={user.gradeFloor ? '' : 'col-span-2'}>
                <div className="text-[10px] uppercase tracking-widest text-stone mb-1">
                  Последняя оценка
                </div>
                <div className="text-sm text-graphite font-medium">
                  {formatDate(user.lastAssessedAt ?? null)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Инфо-grid */}
        <div className="px-7 py-5 grid grid-cols-2 gap-x-6 gap-y-3.5 text-sm">
          <Field label="Отдел" value={user.department} />
          <Field label="Дата найма" value={formatDate(user.hiredAt)} />
          <Field label="Лид" value={user.lead?.fullName ?? null} />
          <Field label="Стардиз" value={user.stardiz?.fullName ?? null} />
        </div>

        {/* Кнопки */}
        <div className="px-7 py-4 border-t border-cloud flex items-center justify-end gap-2 flex-wrap">
          {canDeactivate && (
            <button onClick={handleDeactivate} className="btn-ghost text-blaze">
              Деактивировать
            </button>
          )}
          {canOpenPortrait && (
            <a href={`/lead/portrait?id=${user.id}`} className="btn-secondary">
              Открыть портрет
            </a>
          )}
          {canAssess && (
            <a href={`/lead/assess?id=${user.id}`} className="btn-secondary">
              Оценить
            </a>
          )}
          {canEdit && (
            <button onClick={() => onEdit(user)} className="btn-accent">
              Изменить
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-stone mb-1">{label}</div>
      <div className={value ? 'text-graphite' : 'text-ash italic'}>{value ?? '—'}</div>
    </div>
  );
}
