'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import Avatar from '@/components/Avatar';
import { CloseIcon, ChevronDownIcon } from '@/components/icons';
import type { UserRow } from './UsersClient';
import Tooltip from '@/components/Tooltip';

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

// Цветовые токены для чипа роли — используем поверх базового `.chip`
// (одинаковый размер и шрифт, отличается только фон/текст).
const ROLE_TONE: Record<string, string> = {
  admin: 'bg-sunset/15 text-sunset',
  lead: 'bg-lime-light text-graphite border border-lime/30',
  stardiz: 'bg-[#bf5af2]/15 text-[#bf5af2]',
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
  rank = null,
  meId,
  meRole,
  onClose,
  onEdit,
  onDeactivated,
}: {
  user: UserRow;
  /** Позиция в рейтинге по composite среди активных дизайнеров («№1»). */
  rank?: number | null;
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

  // Phase 14: сводка самооценки — количество и свежесть (для чипа).
  const [selfInfo, setSelfInfo] = useState<{ count: number; last: string | null } | null>(
    null,
  );
  useEffect(() => {
    if (user.role !== 'designer') return;
    let cancelled = false;
    fetch(`/api/users/${user.id}/self-assessment`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const last = d.selfAssessments.reduce(
          (acc: string | null, sa: { updatedAt: string }) =>
            !acc || sa.updatedAt > acc ? sa.updatedAt : acc,
          null,
        );
        setSelfInfo({ count: d.selfAssessments.length, last });
      })
      .catch(() => {
        // чип самооценки опционален
      });
    return () => {
      cancelled = true;
    };
  }, [user.id, user.role]);

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

  // Список метаданных — показываем только то, что заполнено.
  // «Отдел» удалён: после переименования билдов он дублирует Билд.
  const metaFields: Array<{ label: string; value: string | null }> = [
    { label: 'Билд', value: user.build?.name ?? null },
    { label: 'Дата найма', value: user.hiredAt ? formatDate(user.hiredAt) : null },
    { label: 'Лид', value: user.lead?.fullName ?? null },
    { label: 'Стардиз', value: user.stardiz?.fullName ?? null },
  ];
  const filledMeta = metaFields.filter((f) => f.value);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-16 pb-10">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl bg-snow rounded-modal shadow-soft-lg overflow-hidden">
        {/* Header — теперь шапка несёт и роль/билд/грейд/«последняя оценка»
            одним блоком чипов под именем. Это убирает большую Grade-карточку
            и делает попап короче на ~100px. */}
        <div className="px-7 pt-6 pb-5 border-b border-cloud">
          <div className="flex items-start gap-4">
            {/* Аватар без кольца — обводки вокруг аватарок убраны везде (Pavel) */}
            <Avatar name={user.fullName} avatarUrl={user.avatarUrl} size={56} />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-2xl font-medium tracking-tight leading-tight truncate">
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

              {/* Полоса чипов: роль · билд · грейд · floor · неактивен.
                  Все на базе `.chip` — одинаковый размер шрифта и паддинги,
                  меняется только цветовая палитра. */}
              <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                {/* Composite-скор — как на подиуме: «83 №1», число в цвете зоны */}
                {user.role === 'designer' && user.compositeScore != null && (
                  <span
                    className={`chip text-white ${
                      Math.round(user.compositeScore * 100) >= 60
                        ? 'bg-emerald'
                        : Math.round(user.compositeScore * 100) >= 50
                          ? 'bg-sunset'
                          : 'bg-blaze'
                    }`}
                  >
                    <b className="font-medium">{Math.round(user.compositeScore * 100)}</b>
                    {rank != null && <span className="text-white/75">№{rank}</span>}
                  </span>
                )}
                <span className={`chip ${ROLE_TONE[user.role] ?? ROLE_TONE.designer}`}>
                  {ROLE_LABEL[user.role] ?? user.role}
                </span>
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
            </div>
          </div>
        </div>

        {/* Секция «Профиль»: билд/лид/стардиз/дата найма. Только заполненные
            поля; если пусто — секция скрывается. Билд живёт здесь (из чипов
            шапки убран — дублировался). */}
        {filledMeta.length > 0 && (
          <div className="px-7 py-5">
            <div className="label-mono text-stone mb-3">Профиль</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {filledMeta.map((f) => (
                <Field key={f.label} label={f.label} value={f.value} />
              ))}
            </div>
          </div>
        )}

        {/* История оценок (+ строка самооценки Phase 14) */}
        <HistoryBlock
          user={user}
          history={history}
          isLeadOrStardiz={isLeadOrStardiz}
          selfInfo={selfInfo}
        />

        {/* «Срок с последнего повышения» — данные тянутся из ClickHouse-копии
            HR-портала. Видно только admin/lead, только для дизайнеров и
            стардизов. Сумма не показывается — только период. */}
        <RaiseBlock user={user} meRole={meRole} meId={meId} />

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
            {/* Имперсонация: админ входит под этим пользователем */}
            {meRole === 'admin' && !isSelf && user.active && (
              <Tooltip align="center" text={`Открыть Грейды глазами ${user.fullName}`}>
                <button
                  type="button"
                  onClick={() =>
                    signIn('impersonate', {
                      targetUserId: String(user.id),
                      callbackUrl: '/',
                    })
                  }
                  className="btn-secondary"
                >
                  Войти как
                </button>
              </Tooltip>
            )}
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

/**
 * Спарклайн динамики XP по циклам оценки (Phase 15). Лёгкий SVG, без chart.js.
 * `assessments` приходят DESC (свежие сверху) — разворачиваем в хронологию.
 * Рисуем только при ≥2 точках. preserveAspectRatio=none + non-scaling-stroke:
 * линия тянется на всю ширину карточки, но остаётся ровной 1.75px (не толстеет).
 */
function XpSparkline({ assessments }: { assessments: AssessmentHistoryRow[] }) {
  const points = [...assessments].reverse().map((a) => a.totalXp ?? 0);
  if (points.length < 2) return null;

  const W = 300;
  const H = 36;
  const pad = 4;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points.map((v, i) => ({
    x: pad + (i / (points.length - 1)) * (W - pad * 2),
    y: H - pad - ((v - min) / range) * (H - pad * 2),
  }));
  const line = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');
  const area = `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${H} L ${coords[0].x.toFixed(1)} ${H} Z`;
  const totalDelta = points[points.length - 1] - points[0];

  return (
    <div className="mb-2">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="label-mono text-stone">Динамика XP</span>
        {totalDelta !== 0 && (
          <span
            className={`label-mono ${totalDelta > 0 ? 'text-emerald' : 'text-blaze'}`}
          >
            {totalDelta > 0 ? '+' : ''}
            {totalDelta} XP
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        className="block"
        aria-hidden="true"
      >
        <path d={area} fill="rgba(213,255,12,0.12)" />
        <path
          d={line}
          fill="none"
          stroke="#d5ff0c"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function HistoryBlock({
  user,
  history,
  isLeadOrStardiz,
  selfInfo,
}: {
  user: UserRow;
  history: HistoryData | null;
  isLeadOrStardiz: boolean;
  /** Phase 14: сводка самооценки — строка над историей. */
  selfInfo: { count: number; last: string | null } | null;
}) {
  if (history === null) return null;

  // Самооценка: лаймовая, если обновлялась после последней published-оценки
  const selfFresh =
    selfInfo?.last != null &&
    (!user.lastAssessedAt || selfInfo.last > user.lastAssessedAt);
  const selfLine =
    user.role === 'designer' && selfInfo && selfInfo.count > 0 ? (
      <div
        className={`text-xs ${selfFresh ? 'text-lime-dark font-medium' : 'text-stone'}`}
      >
        Самооценка: {selfInfo.count}{' '}
        {plural(selfInfo.count, ['навык', 'навыка', 'навыков'])}
        {selfInfo.last && ` · обновлена ${formatDate(selfInfo.last)}`}
        {selfFresh && ' · после последней оценки'}
      </div>
    ) : null;

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
      <div className="px-7 py-4 border-t border-cloud space-y-2">
        <div className="text-xs text-ash italic">Оценок ещё не было</div>
        {selfLine}
      </div>
    );
  }

  return (
    <div className="px-7 py-4 border-t border-cloud space-y-3">
      {hasAssessments && (
        <div className="space-y-1">
          <div className="label-mono text-stone">История оценок</div>
          {selfLine}
          <XpSparkline assessments={history.assessments} />
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
          <div className="label-mono text-stone">360-опросы</div>
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

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
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

/**
 * Аккордеон «Срок с последнего повышения». Данные грузятся лениво
 * в момент раскрытия — пока пользователь не открыл, нет смысла
 * нагружать ClickHouse.
 *
 * Видимость:
 *  - admin — для дизайнеров и стардизов;
 *  - lead  — только для своих подопечных (designer/stardiz);
 *  - остальные роли не видят блок вовсе.
 *
 * Сумма повышения намеренно НЕ показывается — Pavel хочет, чтобы лиды
 * видели только сам факт «давно/недавно повышали», но не зарплату.
 */
function RaiseBlock({
  user,
  meRole,
  meId,
}: {
  user: UserRow;
  meRole: string;
  meId: number | null;
}) {
  // Только для дизайнеров и стардизов имеет смысл
  const isTarget = user.role === 'designer' || user.role === 'stardiz';
  // Видимость: admin — всех, lead — только своих
  const isMineForLead = meRole === 'lead' && meId !== null && user.leadId === meId;
  const canView = meRole === 'admin' || isMineForLead;

  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ lastRaiseAt: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || data !== null || loading) return;
    setLoading(true);
    setError(false);
    fetch(`/api/users/${user.id}/last-raise`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((j) => setData(j))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open, user.id, data, loading]);

  if (!isTarget || !canView) return null;

  return (
    <div className="border-t border-cloud">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-7 py-3 flex items-center justify-between text-sm text-stone hover:bg-canvas/40 transition-colors"
      >
        <span>Срок с последнего повышения</span>
        <ChevronDownIcon
          className={`w-4 h-4 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <div className="px-7 pb-4 -mt-1 text-sm">
          {loading && <span className="text-stone italic">Загрузка…</span>}
          {!loading && error && (
            <span className="text-ash italic">Данные о повышениях недоступны</span>
          )}
          {!loading && !error && data && (
            data.lastRaiseAt ? (
              <span className="text-graphite font-medium">
                {formatRaisePeriod(data.lastRaiseAt)}
              </span>
            ) : (
              <span className="text-ash italic">Повышений не зафиксировано</span>
            )
          )}
        </div>
      )}
    </div>
  );
}

/** Сколько прошло с даты повышения — в человеческих годах/месяцах. */
function formatRaisePeriod(iso: string): string {
  const start = new Date(iso);
  const now = new Date();
  let months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months--;
  if (months < 1) return 'Меньше месяца';
  const years = Math.floor(months / 12);
  const m = months % 12;
  const yearWord = (n: number) => {
    const last = n % 10;
    const lastTwo = n % 100;
    if (lastTwo >= 11 && lastTwo <= 14) return 'лет';
    if (last === 1) return 'год';
    if (last >= 2 && last <= 4) return 'года';
    return 'лет';
  };
  const monthWord = (n: number) => {
    const last = n % 10;
    const lastTwo = n % 100;
    if (lastTwo >= 11 && lastTwo <= 14) return 'мес.';
    return 'мес.';
  };
  if (years === 0) return `${m} ${monthWord(m)}`;
  if (m === 0) return `${years} ${yearWord(years)}`;
  return `${years} ${yearWord(years)} ${m} ${monthWord(m)}`;
}
