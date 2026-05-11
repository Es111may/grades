'use client';

import { useEffect } from 'react';
import Avatar from '@/components/Avatar';
import { CloseIcon } from '@/components/icons';
import type { UserRow } from './UsersClient';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Админ',
  lead: 'Лид',
  stardiz: 'Стардиз',
  designer: 'Дизайнер',
};

const ROLE_TONE: Record<string, string> = {
  admin: 'bg-[#fff7e6] text-sunset',
  lead: 'bg-lime-light text-graphite border border-lime/30',
  stardiz: 'bg-[#ede9fe] text-[#6d28d9]',
  designer: 'bg-cloud/60 text-stone',
};

const GRADE_NAMES: Record<string, string> = {
  junior: 'Джун',
  junior_plus: 'Джун+',
  premiddle: 'Пре-мидл',
  middle: 'Мидл',
  middle_plus: 'Мидл+',
  senior: 'Синьор',
};

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
  user: UserRow;
  meId: number | null;
  meRole: string;
  onClose: () => void;
  onEdit: (user: UserRow) => void;
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

  // Лид/стардиз (Phase 22): портрет 360° доступен админу всегда и
  // самому лиду/стардизу для просмотра своих оценок.
  const isLeadOrStardiz = user.role === 'lead' || user.role === 'stardiz';
  const canOpenLeadReview =
    isLeadOrStardiz && user.active && (meRole === 'admin' || isSelf);
  // Импорт CSV из Google Form — только админ, и только для активных
  // лидов/стардизов.
  const canImportLeadReview = isLeadOrStardiz && user.active && meRole === 'admin';

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
          <div className="flex items-center gap-4">
            <Avatar name={user.fullName} avatarUrl={user.avatarUrl} size={56} />
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
                  <span className="chip-build">
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
              className="btn-ghost btn-sm shrink-0 w-8 h-8 p-0 flex items-center justify-center"
              aria-label="Закрыть"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Грейд + дата последней оценки */}
        {user.role === 'designer' && (
          <div className="px-7 py-5 bg-canvas/60 border-b border-cloud">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-[10px]  text-stone mb-1">
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
                  <div className="text-[10px]  text-stone mb-1">
                    Floor
                  </div>
                  <div className="font-display text-2xl font-semibold tracking-tight text-sunset">
                    {GRADE_NAMES[user.gradeFloor] ?? user.gradeFloor}
                  </div>
                </div>
              )}
              <div className={user.gradeFloor ? '' : 'col-span-2'}>
                <div className="text-[10px]  text-stone mb-1">
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

        {/* Кнопки — равной ширины по всей ширине поп-апа */}
        <div className="px-7 py-4 border-t border-cloud flex items-stretch gap-1.5">
          {canDeactivate && (
            <button onClick={handleDeactivate} className="btn-ghost-danger flex-1">
              Деактивировать
            </button>
          )}
          {canOpenPortrait && (
            <a
              href={`/lead/portrait?id=${user.id}`}
              className="btn-secondary flex-1"
            >
              Открыть портрет
            </a>
          )}
          {canOpenLeadReview && (
            <a
              href={`/admin/lead-reviews?userId=${user.id}`}
              className="btn-secondary flex-1"
            >
              Открыть портрет
            </a>
          )}
          {canImportLeadReview && (
            <a
              href={`/admin/lead-reviews/new?userId=${user.id}`}
              className="btn-secondary flex-1"
            >
              Импортировать опрос
            </a>
          )}
          {canAssess && (
            <a href={`/lead/assess?id=${user.id}`} className="btn-secondary flex-1">
              Оценить
            </a>
          )}
          {canEdit && (
            <button onClick={() => onEdit(user)} className="btn-accent flex-1">
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
      <div className="text-[10px]  text-stone mb-1">{label}</div>
      <div className={value ? 'text-graphite' : 'text-ash italic'}>{value ?? '—'}</div>
    </div>
  );
}
