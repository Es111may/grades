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
  const canImportLeadReview = isLeadOrStardiz && user.active && meRole === 'admin';

  // Двухступенчатое удаление-«деактивация» — без нативного confirm,
  // который мог не отрабатывать в некоторых браузерах.
  const [deactivateArmed, setDeactivateArmed] = useState(false);
  function armDeactivate() {
    setDeactivateArmed(true);
    setTimeout(() => setDeactivateArmed(false), 5000);
  }
  async function handleDeactivate() {
    const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
    if (res.ok) {
      onDeactivated(user.id);
      setDeactivateArmed(false);
    } else {
      const j = await res.json().catch(() => ({}));
      alert(`Не удалось деактивировать: ${j.error ?? res.statusText}`);
      setDeactivateArmed(false);
    }
  }

  // Список метаданных — показываем только то, что заполнено
  const metaFields: Array<{ label: string; value: string | null }> = [
    { label: 'Отдел', value: user.department },
    { label: 'Билд', value: user.build?.name ?? null },
    { label: 'Дата найма', value: user.hiredAt ? formatDate(user.hiredAt) : null },
    { label: 'Лид', value: user.lead?.fullName ?? null },
    { label: 'Стардиз', value: user.stardiz?.fullName ?? null },
  ];
  const filledMeta = metaFields.filter((f) => f.value);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-16 pb-10">
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl bg-snow rounded-modal shadow-soft-lg overflow-hidden">
        {/* Header — теперь шапка несёт и роль/билд/грейд/«последняя оценка»
            одним блоком чипов под именем. Это убирает большую Grade-карточку
            и делает попап короче на ~100px. */}
        <div className="px-7 pt-6 pb-5 border-b border-cloud">
          <div className="flex items-start gap-4">
            <Avatar name={user.fullName} avatarUrl={user.avatarUrl} size={56} />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-2xl font-semibold tracking-tight leading-tight truncate">
                    {user.fullName}
                  </h2>
                  <div className="text-sm text-stone mt-0.5 truncate">{user.email}</div>
                </div>
                <button
                  onClick={onClose}
                  className="btn-ghost btn-sm shrink-0 w-8 h-8 p-0 flex items-center justify-center -mr-2 -mt-1"
                  aria-label="Закрыть"
                  type="button"
                >
                  <CloseIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Полоса чипов: роль · билд · грейд · floor · неактивен */}
              <div className="flex items-center gap-1.5 mt-3 flex-wrap">
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
                {user.role === 'designer' && user.effectiveGrade && (
                  <span className="chip bg-ink text-snow">
                    {GRADE_NAMES[user.effectiveGrade] ?? user.effectiveGrade}
                  </span>
                )}
                {user.role === 'designer' &&
                  user.gradeFloor &&
                  user.gradeFloor !== user.effectiveGrade && (
                    <span className="chip-warn">
                      Floor: {GRADE_NAMES[user.gradeFloor] ?? user.gradeFloor}
                    </span>
                  )}
                {!user.active && <span className="chip-danger">Неактивен</span>}
              </div>

              {/* Подпись о дате последней оценки — только для дизайнеров,
                  и только если она была. Inline, без отдельной секции. */}
              {user.role === 'designer' && user.lastAssessedAt && (
                <div className="text-xs text-stone mt-2">
                  Последняя оценка:{' '}
                  <span className="text-graphite font-medium">
                    {formatDate(user.lastAssessedAt)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Инфо-grid — только заполненные поля. Пустое «Стардиз —» больше не
            маячит. Если ничего не заполнено — секция вообще скрывается. */}
        {filledMeta.length > 0 && (
          <div className="px-7 py-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {filledMeta.map((f) => (
              <Field key={f.label} label={f.label} value={f.value} />
            ))}
          </div>
        )}

        {/* История оценок */}
        <HistoryBlock
          user={user}
          history={history}
          isLeadOrStardiz={isLeadOrStardiz}
        />

        {/* Footer: опасное действие слева, навигация и edit — справа.
            Деактивация — двухступенчатая (без confirm). */}
        <div className="px-7 py-4 border-t border-cloud flex items-center gap-2">
          {canDeactivate &&
            (!deactivateArmed ? (
              <button
                onClick={armDeactivate}
                className="btn-ghost-danger"
                type="button"
              >
                Деактивировать
              </button>
            ) : (
              <button
                onClick={handleDeactivate}
                className="btn-danger"
                type="button"
              >
                Точно деактивировать?
              </button>
            ))}

          <div className="ml-auto flex items-center gap-1.5">
            {canOpenPortrait && (
              <a href={`/lead/portrait?id=${user.id}`} className="btn-secondary">
                Портрет
              </a>
            )}
            {canOpenLeadReview && (
              <a
                href={`/admin/lead-reviews?userId=${user.id}`}
                className="btn-secondary"
              >
                Портрет
              </a>
            )}
            {canImportLeadReview && (
              <a
                href={`/admin/lead-reviews/new?userId=${user.id}`}
                className="btn-secondary"
              >
                Импорт опроса
              </a>
            )}
            {canAssess && (
              <a href={`/lead/assess?id=${user.id}`} className="btn-secondary">
                Оценить
              </a>
            )}
            {canEdit && (
              <button
                onClick={() => onEdit(user)}
                className="btn-accent"
                type="button"
              >
                Изменить
              </button>
            )}
          </div>
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
  if (history === null) return null;

  const showLeadReviews = isLeadOrStardiz;
  const showAssessments = user.role === 'designer' || user.role === 'stardiz';

  const hasAssessments = showAssessments && history.assessments.length > 0;
  const hasLeadReviews = showLeadReviews && history.leadReviews.length > 0;

  if (user.role === 'admin' || (!showAssessments && !showLeadReviews)) {
    return null;
  }

  // Если совсем нет данных ни одной из применимых категорий — показываем
  // одну компактную строку-подсказку, а не два пустых блока.
  if (!hasAssessments && !hasLeadReviews) {
    return (
      <div className="px-7 py-4 border-t border-cloud text-xs text-ash italic">
        Оценок ещё не было
      </div>
    );
  }

  return (
    <div className="px-7 py-4 border-t border-cloud space-y-3">
      {hasAssessments && (
        <div className="space-y-1">
          {history.assessments.slice(0, 5).map((a, idx) => {
            const next = history.assessments[idx + 1];
            const delta =
              next && a.totalXp !== null && next.totalXp !== null
                ? a.totalXp - next.totalXp
                : null;
            return (
              <a
                key={a.id}
                href={`/lead/portrait?id=${user.id}`}
                className="flex items-center gap-3 py-1.5 px-2 -mx-2 rounded-card text-sm hover:bg-canvas/60 transition-colors"
              >
                <span className="text-stone tabular-nums shrink-0 whitespace-nowrap text-xs w-24">
                  {formatDate(a.publishedAt)}
                </span>
                <span className="flex-1 font-medium truncate">
                  {a.effectiveGrade
                    ? GRADE_NAMES[a.effectiveGrade] ?? a.effectiveGrade
                    : '—'}
                </span>
                <span className="text-stone tabular-nums shrink-0 whitespace-nowrap text-xs">
                  {a.totalXp ?? 0} XP
                </span>
                {delta !== null && delta !== 0 && (
                  <span
                    className={`tabular-nums shrink-0 text-xs font-medium whitespace-nowrap w-10 text-right ${
                      delta > 0 ? 'text-emerald' : 'text-blaze'
                    }`}
                  >
                    {delta > 0 ? '+' : ''}
                    {delta}
                  </span>
                )}
              </a>
            );
          })}
          {history.assessments.length > 5 && (
            <div className="text-[11px] text-ash italic px-2">
              + ещё {history.assessments.length - 5} в архиве
            </div>
          )}
        </div>
      )}

      {hasLeadReviews && (
        <div className="space-y-1">
          {history.leadReviews.slice(0, 5).map((r) => (
            <a
              key={r.id}
              href={`/admin/lead-reviews/${r.id}`}
              className="flex items-center gap-3 py-1.5 px-2 -mx-2 rounded-card text-sm hover:bg-canvas/60 transition-colors"
            >
              <span className="font-medium truncate flex-1">{r.period}</span>
              <span className="text-stone text-xs shrink-0 whitespace-nowrap">
                {r.responseCount} {pluralResp(r.responseCount)}
              </span>
              {r.enps !== null && (
                <span className="tabular-nums shrink-0 text-xs text-stone whitespace-nowrap">
                  eNPS{' '}
                  <strong className="text-ink">{r.enps.toFixed(1)}</strong>
                </span>
              )}
            </a>
          ))}
          {history.leadReviews.length > 5 && (
            <div className="text-[11px] text-ash italic px-2">
              + ещё {history.leadReviews.length - 5} в архиве
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
      <div className="text-[10px] text-stone mb-1">{label}</div>
      <div className="text-graphite">{value}</div>
    </div>
  );
}
