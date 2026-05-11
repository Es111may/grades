'use client';

import { useEffect, useState } from 'react';
import Avatar from '@/components/Avatar';
import { CloseIcon } from '@/components/icons';
import type { UserRow } from './UsersClient';

type AssessmentHistoryRow = {
  id: number;
  publishedAt: string | null;
  effectiveGrade: string | null;
  totalXp: number | null;
  leadName: string | null;
};

type LeadReviewHistoryRow = {
  id: number;
  period: string;
  importedAt: string;
  responseCount: number;
  enps: number | null;
};

type HistoryData = {
  assessments: AssessmentHistoryRow[];
  leadReviews: LeadReviewHistoryRow[];
};

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

  // Ленивая подгрузка истории оценок (Assessment'ов и LeadReview'ов).
  // Загружаем при открытии — попап показывается сразу, а блок «История»
  // подтягивается отдельным запросом.
  const [history, setHistory] = useState<HistoryData | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/${user.id}/history`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setHistory(data);
      })
      .catch(() => {
        // история необязательна — попап работает и без неё
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

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

        {/* История оценок — лениво подгружается с сервера. Показывается
            только если есть что показать (для админа без оценок — блока
            не будет, чтобы не плодить пустоту). */}
        <HistoryBlock
          user={user}
          history={history}
          isLeadOrStardiz={isLeadOrStardiz}
        />

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
              Портрет
            </a>
          )}
          {canOpenLeadReview && (
            <a
              href={`/admin/lead-reviews?userId=${user.id}`}
              className="btn-secondary flex-1"
            >
              Портрет
            </a>
          )}
          {canImportLeadReview && (
            <a
              href={`/admin/lead-reviews/new?userId=${user.id}`}
              className="btn-secondary flex-1"
            >
              Импорт опроса
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

function HistoryBlock({
  user,
  history,
  isLeadOrStardiz,
}: {
  user: UserRow;
  history: HistoryData | null;
  isLeadOrStardiz: boolean;
}) {
  // Пока загружается — ничего не рендерим (попап и так живой за счёт остального
  // контента). Если загрузилось, но пусто — для дизайнера и лидов покажем
  // плашку, чтобы было понятно «оценок ещё не было».
  if (history === null) return null;

  const showLeadReviews = isLeadOrStardiz;
  const showAssessments = user.role === 'designer' || user.role === 'stardiz';

  const hasAssessments = showAssessments && history.assessments.length > 0;
  const hasLeadReviews = showLeadReviews && history.leadReviews.length > 0;

  // Для admin (нет ассессментов и нет lead-review) — скрываем блок,
  // чтобы не плодить пустые секции.
  if (
    user.role === 'admin' ||
    (!hasAssessments && !hasLeadReviews && !showAssessments && !showLeadReviews)
  ) {
    return null;
  }

  return (
    <div className="px-7 py-5 border-t border-cloud space-y-4">
      {showAssessments && (
        <div>
          <div className="text-[10px] text-stone mb-2">
            История оценок дизайнера
          </div>
          {hasAssessments ? (
            <div className="space-y-1.5">
              {history.assessments.slice(0, 5).map((a, idx) => {
                const next = history.assessments[idx + 1];
                const delta =
                  next && a.totalXp !== null && next.totalXp !== null
                    ? a.totalXp - next.totalXp
                    : null;
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 py-1.5 px-3 bg-canvas/50 rounded-card text-sm"
                  >
                    <span className="text-stone tabular-nums shrink-0 w-24">
                      {formatDate(a.publishedAt)}
                    </span>
                    <span className="flex-1 font-medium truncate">
                      {a.effectiveGrade
                        ? GRADE_NAMES[a.effectiveGrade] ?? a.effectiveGrade
                        : '—'}
                    </span>
                    <span className="text-stone tabular-nums shrink-0 w-12 text-right">
                      {a.totalXp ?? 0} XP
                    </span>
                    {delta !== null && delta !== 0 && (
                      <span
                        className={`tabular-nums shrink-0 w-10 text-right text-xs font-medium ${
                          delta > 0 ? 'text-emerald' : 'text-blaze'
                        }`}
                      >
                        {delta > 0 ? '+' : ''}
                        {delta}
                      </span>
                    )}
                  </div>
                );
              })}
              {history.assessments.length > 5 && (
                <div className="text-[11px] text-ash italic pl-3">
                  + ещё {history.assessments.length - 5} в архиве
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-ash italic">Оценок ещё не было</div>
          )}
        </div>
      )}

      {showLeadReviews && (
        <div>
          <div className="text-[10px] text-stone mb-2">
            История 360-оценок
          </div>
          {hasLeadReviews ? (
            <div className="space-y-1.5">
              {history.leadReviews.slice(0, 5).map((r) => (
                <a
                  key={r.id}
                  href={`/admin/lead-reviews/${r.id}`}
                  className="flex items-center justify-between gap-3 py-1.5 px-3 bg-canvas/50 rounded-card text-sm hover:bg-canvas transition-colors"
                >
                  <span className="font-medium shrink-0 w-32 truncate">
                    {r.period}
                  </span>
                  <span className="flex-1 text-stone text-xs">
                    {r.responseCount} {pluralResp(r.responseCount)}
                  </span>
                  {r.enps !== null && (
                    <span className="tabular-nums shrink-0 text-xs text-stone">
                      eNPS{' '}
                      <strong className="text-ink">{r.enps.toFixed(1)}</strong>
                    </span>
                  )}
                </a>
              ))}
              {history.leadReviews.length > 5 && (
                <div className="text-[11px] text-ash italic pl-3">
                  + ещё {history.leadReviews.length - 5} в архиве
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-ash italic">
              360-оценок ещё не было
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function pluralResp(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'респондентов';
  if (mod10 === 1) return 'респондент';
  if (mod10 >= 2 && mod10 <= 4) return 'респондента';
  return 'респондентов';
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[10px]  text-stone mb-1">{label}</div>
      <div className={value ? 'text-graphite' : 'text-ash italic'}>{value ?? '—'}</div>
    </div>
  );
}
