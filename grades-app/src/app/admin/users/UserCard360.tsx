'use client';

import { useEffect, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import Avatar from '@/components/Avatar';
import { CloseIcon } from '@/components/icons';
import type { UserRow } from './UsersClient';
import TitleAurora from '@/components/TitleAurora';

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

import { formatDateShort as formatDate } from '@/lib/dates';

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

  // Меню «⋯»: открывается по ховеру (грейс 160мс на уход) и по клику;
  // клик-вне закрывает
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function menuEnter() {
    if (menuTimer.current) clearTimeout(menuTimer.current);
    setMenuOpen(true);
  }
  function menuLeave() {
    if (menuTimer.current) clearTimeout(menuTimer.current);
    menuTimer.current = setTimeout(() => setMenuOpen(false), 160);
  }
  useEffect(() => {
    return () => {
      if (menuTimer.current) clearTimeout(menuTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  // Двухступенчатое жёсткое удаление (только admin)
  const [deleteArmed, setDeleteArmed] = useState(false);

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

  // Стаж — «1 г 10 мес» к дате найма
  function tenureStr(hiredAt: string | null): string | null {
    if (!hiredAt) return null;
    const st = new Date(hiredAt);
    const now = new Date();
    let m = (now.getFullYear() - st.getFullYear()) * 12 + (now.getMonth() - st.getMonth());
    if (now.getDate() < st.getDate()) m--;
    if (m < 1) return '<1 мес';
    const y = Math.floor(m / 12);
    const mm = m % 12;
    if (y === 0) return `${mm} мес`;
    return mm === 0 ? `${y} г` : `${y} г ${mm} мес`;
  }

  const lastA = history?.assessments?.[0] ?? null;
  const prevA = history?.assessments?.[1] ?? null;
  const lastDelta =
    lastA && prevA && lastA.totalXp !== null && prevA.totalXp !== null
      ? lastA.totalXp - prevA.totalXp
      : null;

  const canImpersonate = meRole === 'admin' && !isSelf && user.active;
  const canHardDelete = meRole === 'admin' && !isSelf;
  const hasMenu = canImpersonate || canImportLeadReview || canDeactivate || canHardDelete;

  async function handleHardDelete() {
    const res = await fetch(`/api/users/${user.id}?hard=true`, { method: 'DELETE' });
    if (res.ok) {
      onDeactivated(user.id);
      onClose();
    } else {
      const j = await res.json().catch(() => ({}));
      alert(
        `Не удалилось: ${j.error ?? res.statusText}.\nЕсли у человека есть подопечные — открой «Изменить», там перенос и удаление.`,
      );
      setDeleteArmed(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-16 pb-10">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />
      {/* Каркас Pavel (12.07.2026): hero по центру с авророй → мета
          «лейбл—значение» → график роста → действия текстом + меню «⋯». */}
      <div className="relative w-full max-w-[420px] bg-snow rounded-modal shadow-soft-lg">
        <div className="overflow-hidden rounded-modal">
          {/* ---------- Hero ---------- */}
          <div className="relative text-center px-6 pt-10 pb-1 overflow-hidden isolation-isolate title-halo">
            <TitleAurora className="!w-[560px] !h-[420px] opacity-40" />
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-pill bg-ink/5 text-stone
                         hover:text-ink flex items-center justify-center transition-colors z-10"
              aria-label="Закрыть"
              type="button"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
            {/* Fade к низу — аврора растворяется, а не обрезается кромкой
                hero. -z-[5]: между канвасом (-z-10) и контентом — иначе
                градиент накрывал нижний ряд чипов «опасити». */}
            <div className="absolute inset-x-0 bottom-0 h-16 -z-[5] bg-gradient-to-b from-transparent to-snow pointer-events-none" />
            <div className="flex justify-center">
              <Avatar name={user.fullName} avatarUrl={user.avatarUrl} size={80} />
            </div>
            <h2 className="font-display text-2xl font-medium tracking-tight mt-4">
              {user.fullName}
            </h2>
            <div className="text-[13px] text-stone mt-0.5 truncate">{user.email}</div>
            {/* Ряд 1: номер · уровень · отдел (Pavel) */}
            <div className="flex items-center justify-center gap-1 mt-4 flex-wrap">
              {user.role === 'designer' && user.compositeScore != null && (
                <span
                  className={`chip h-6 text-white ${
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
              {user.role === 'designer' && user.effectiveGrade && (
                <span className="chip h-6 bg-ink text-snow">
                  {GRADE_NAMES[user.effectiveGrade] ?? user.effectiveGrade}
                </span>
              )}
              {user.build && (
                <span className="chip-neutral h-6">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: buildColor(user.build.code) }}
                  />
                  {user.build.name}
                </span>
              )}
            </div>
            {/* Ряд 2: роль · в срок · floor · неактивен */}
            <div className="flex items-center justify-center gap-1 mt-1.5 flex-wrap">
              <span className={`chip h-6 ${ROLE_TONE[user.role] ?? ROLE_TONE.designer}`}>
                {ROLE_LABEL[user.role] ?? user.role}
              </span>
              {user.role === 'designer' && user.onTimePercent != null && (
                <span className="chip-neutral h-6">
                  {Math.round(user.onTimePercent)}% в срок
                </span>
              )}
              {user.role === 'designer' &&
                user.gradeFloor &&
                user.gradeFloor !== user.effectiveGrade && (
                  <span className="chip-warn h-6">
                    Floor: {GRADE_NAMES[user.gradeFloor] ?? user.gradeFloor}
                  </span>
                )}
              {!user.active && <span className="chip-danger h-6">Неактивен</span>}
            </div>
          </div>

          {/* ---------- Мета: лейбл слева, значение справа ---------- */}
          <div className="px-6 pt-[60px] pb-5 flex flex-col gap-3 text-sm">
            {user.lead && (
              <div className="flex items-center gap-3">
                <span className="text-stone">Лид</span>
                <span className="ml-auto text-ink text-right">{user.lead.fullName}</span>
              </div>
            )}
            {user.stardiz && (
              <div className="flex items-center gap-3">
                <span className="text-stone">Стардиз</span>
                <span className="ml-auto text-ink text-right">{user.stardiz.fullName}</span>
              </div>
            )}
            {user.hiredAt && (
              <div className="flex items-center gap-3">
                <span className="text-stone">Дата найма</span>
                <span className="ml-auto text-ink text-right">
                  {formatDate(user.hiredAt)}
                  {tenureStr(user.hiredAt) && (
                    <span className="text-stone"> · {tenureStr(user.hiredAt)}</span>
                  )}
                </span>
              </div>
            )}
            {user.role === 'designer' && selfInfo && selfInfo.count > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-stone">Самооценка</span>
                <span className="ml-auto text-ink text-right">
                  {selfInfo.count}{' '}
                  {plural(selfInfo.count, ['навык', 'навыка', 'навыков'])}
                  {selfInfo.last && (
                    <span className="text-stone"> · {formatDate(selfInfo.last)}</span>
                  )}
                </span>
              </div>
            )}
            <RaiseRow user={user} meRole={meRole} meId={meId} />
          </div>

          {/* ---------- График роста + последняя оценка ---------- */}
          {history && history.assessments.length > 0 && user.role !== 'admin' && (
            <>
            {/* Разделитель — по ширине текстовых блоков, не в края */}
            <div className="mx-6 h-px bg-cloud" />
            <div className="px-6 pt-8 pb-7">
              <TrendSparkline
                points={[...history.assessments].reverse().map((a) => a.totalXp ?? 0)}
                label="Динамика XP"
                unit=" XP"
                height={110}
              />
              <div className="flex items-baseline gap-2.5 mt-4 text-sm">
                <span className="font-medium">
                  {lastA?.effectiveGrade
                    ? GRADE_NAMES[lastA.effectiveGrade] ?? lastA.effectiveGrade
                    : '—'}
                </span>
                <span className="text-stone tabular-nums">
                  {lastA?.totalXp ?? 0} XP
                </span>
                {lastDelta !== null && lastDelta !== 0 && (
                  <span
                    className={`font-medium tabular-nums ${
                      lastDelta > 0 ? 'text-emerald' : 'text-blaze'
                    }`}
                  >
                    {lastDelta > 0 ? '+' : ''}
                    {lastDelta}
                  </span>
                )}
                <span className="ml-auto text-stone text-sm tabular-nums">
                  {formatDate(lastA?.publishedAt ?? null)}
                </span>
              </div>
            </div>
            </>
          )}

          {/* 360-опросы (лид/стардиз): график eNPS + список циклов.
              Хронология — по дате из строки периода (importedAt врёт для
              исторических импортов). */}
          {isLeadOrStardiz && history && history.leadReviews.length > 0 && (() => {
            const sorted = [...history.leadReviews].sort((a, b) => {
              const da =
                parsePeriodDate(a.period)?.getTime() ??
                new Date(a.importedAt).getTime();
              const db =
                parsePeriodDate(b.period)?.getTime() ??
                new Date(b.importedAt).getTime();
              return db - da; // свежие сверху
            });
            const points = [...sorted]
              .reverse()
              .map((r) => r.enps)
              .filter((v): v is number => v !== null);
            return (
              <>
                <div className="mx-6 h-px bg-cloud" />
                <div className="px-6 pt-8 pb-7">
                  <div className="mb-5">
                    <TrendSparkline points={points} height={110} deltaDigits={1} />
                  </div>
                  <div className="space-y-1">
                    {sorted.slice(0, 3).map((r) => {
                      const d = parsePeriodDate(r.period);
                      return (
                        <a
                          key={r.id}
                          href={`/admin/lead-reviews/${r.id}`}
                          className="flex items-baseline gap-2.5 py-1.5 px-2 -mx-2 rounded-card text-sm hover:bg-canvas/60 transition-colors"
                        >
                          {r.enps !== null && (
                            <span className="font-medium tabular-nums shrink-0">
                              {r.enps.toFixed(1)}{' '}
                              <span className="text-stone font-normal">eNPS</span>
                            </span>
                          )}
                          <span className="text-stone shrink-0">
                            {r.responseCount} {pluralResp(r.responseCount)}
                          </span>
                          <span className="ml-auto text-stone tabular-nums shrink-0">
                            {d ? formatDate(d.toISOString()) : r.period}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              </>
            );
          })()}

          {/* ---------- Действия: текстом + меню «⋯» ---------- */}
          <div className="px-4 py-3.5 border-t border-cloud flex items-center gap-0.5">
            {canOpenPortrait && (
              <a
                href={`/lead/portrait?id=${user.id}`}
                className="text-sm font-medium px-3.5 py-2 rounded-pill hover:bg-ink/5 transition-colors"
              >
                Портрет
              </a>
            )}
            {canOpenLeadReview && (
              <a
                href={`/admin/lead-reviews?userId=${user.id}`}
                className="text-sm font-medium px-3.5 py-2 rounded-pill hover:bg-ink/5 transition-colors"
              >
                Портрет
              </a>
            )}
            {canAssess && (
              <a
                href={`/lead/assess?id=${user.id}`}
                className="text-sm font-medium px-3.5 py-2 rounded-pill hover:bg-ink/5 transition-colors"
              >
                Оценить
              </a>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => onEdit(user)}
                className="text-sm font-medium px-3.5 py-2 rounded-pill hover:bg-ink/5 transition-colors"
              >
                Изменить
              </button>
            )}
            {hasMenu && (
              /* Меню — по ховеру (грейс на уход), клик тоже работает */
              <span
                className="ml-auto"
                onMouseEnter={menuEnter}
                onMouseLeave={menuLeave}
              >
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="w-9 h-9 rounded-pill flex items-center justify-center
                             text-stone hover:text-ink hover:bg-ink/5 transition-colors text-lg tracking-widest"
                  aria-label="Ещё действия"
                  aria-expanded={menuOpen}
                >
                  ⋯
                </button>
              </span>
            )}
          </div>
        </div>

        {/* Меню «⋯» — редкие/опасные действия не на виду (стрим-safe) */}
        {menuOpen && (
          <div
            ref={menuRef}
            onMouseEnter={menuEnter}
            onMouseLeave={menuLeave}
            className="absolute right-3 bottom-[58px] w-max z-20 card p-1.5 shadow-soft-lg animate-scale-in"
          >
            {canImpersonate && (
              <button
                type="button"
                onClick={() =>
                  signIn('impersonate', {
                    targetUserId: String(user.id),
                    callbackUrl: '/',
                  })
                }
                className="block w-full whitespace-nowrap text-left px-3 py-2 rounded-[10px] text-sm text-ink hover:bg-canvas transition-colors"
              >
                Войти как {user.fullName.split(' ')[0]}
              </button>
            )}
            {canImportLeadReview && (
              <a
                href={`/admin/lead-reviews/new?userId=${user.id}`}
                className="block px-3 py-2 rounded-[10px] text-sm text-ink hover:bg-canvas transition-colors"
              >
                Импорт опроса
              </a>
            )}
            {canDeactivate &&
              (!deactivateArmed ? (
                <button
                  type="button"
                  onClick={armDeactivate}
                  className="block w-full whitespace-nowrap text-left px-3 py-2 rounded-[10px] text-sm text-blaze hover:bg-canvas transition-colors"
                >
                  Деактивировать
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDeactivate}
                  className="block w-full whitespace-nowrap text-left px-3 py-2 rounded-[10px] text-sm font-medium text-white bg-blaze hover:brightness-95 transition-all"
                >
                  Точно деактивировать?
                </button>
              ))}
            {canHardDelete &&
              (!deleteArmed ? (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteArmed(true);
                    setTimeout(() => setDeleteArmed(false), 5000);
                  }}
                  className="block w-full whitespace-nowrap text-left px-3 py-2 rounded-[10px] text-sm text-blaze hover:bg-canvas transition-colors"
                >
                  Удалить
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleHardDelete}
                  className="block w-full whitespace-nowrap text-left px-3 py-2 rounded-[10px] text-sm font-medium text-white bg-blaze hover:brightness-95 transition-all"
                >
                  Точно удалить навсегда?
                </button>
              ))}
          </div>
        )}
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
function TrendSparkline({
  points,
  label,
  unit = '',
  height = 36,
  deltaDigits = 0,
}: {
  /** Хронологический ряд значений (старые → новые). */
  points: number[];
  label?: string;
  unit?: string;
  height?: number;
  deltaDigits?: number;
}) {
  if (points.length < 2) return null;

  const W = 300;
  const H = height;
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
      {label && (
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="label-mono text-stone">{label}</span>
        {totalDelta !== 0 && (
          <span
            className={`label-mono ${totalDelta > 0 ? 'text-emerald' : 'text-blaze'}`}
          >
            {totalDelta > 0 ? '+' : ''}
            {totalDelta.toFixed(deltaDigits)}
            {unit}
          </span>
        )}
      </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        className="block"
        aria-hidden="true"
      >
        <path d={area} fill="rgba(213,255,12,0.12)" />
        {/* последняя точка + пульс — «ты здесь» */}
        <circle
          cx={coords[coords.length - 1].x}
          cy={coords[coords.length - 1].y}
          r={3.5}
          fill="rgb(var(--c-lime))"
        />
        <circle
          cx={coords[coords.length - 1].x}
          cy={coords[coords.length - 1].y}
          fill="none"
          stroke="rgb(var(--c-lime) / 0.35)"
        >
          <animate attributeName="r" values="5;12;5" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.7;0;0.7" dur="2.4s" repeatCount="indefinite" />
        </circle>
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

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

// «13 мая 2026» из строки периода → Date (хронология графика/списка).
const RU_MONTHS: Record<string, number> = {
  'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3, 'мая': 4, 'июня': 5,
  'июля': 6, 'августа': 7, 'сентября': 8, 'октября': 9, 'ноября': 10,
  'декабря': 11,
};
function parsePeriodDate(period: string): Date | null {
  const m = period.trim().match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
  if (!m) return null;
  const mon = RU_MONTHS[m[2].toLowerCase()];
  if (mon === undefined) return null;
  return new Date(Date.UTC(parseInt(m[3], 10), mon, parseInt(m[1], 10)));
}

function pluralResp(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'респондентов';
  if (mod10 === 1) return 'респондент';
  if (mod10 >= 2 && mod10 <= 4) return 'респондента';
  return 'респондентов';
}

/**
 * «Пересмотр з/п» — мета-строка с глазом (каркас Pavel 12.07.2026):
 * значение скрыто до клика (лид может стримить экран), данные тянутся
 * лениво из ClickHouse-копии HR-портала. Видимость: admin — все
 * дизайнеры/стардизы, lead — только свои.
 */
function RaiseRow({
  user,
  meRole,
  meId,
}: {
  user: UserRow;
  meRole: string;
  meId: number | null;
}) {
  const isTarget = user.role === 'designer' || user.role === 'stardiz';
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
    <div className="flex items-center gap-3">
      <span className="text-stone">Пересмотр з/п</span>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 text-stone hover:text-ink transition-colors"
        >
          <EyeIcon className="w-4 h-4" />
          Раскрыть
        </button>
      ) : (
        /* Повторный клик — скрыть обратно (Pavel) */
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto text-ink text-right hover:text-stone transition-colors"
        >
          {loading && <span className="text-stone italic">Загрузка…</span>}
          {!loading && error && (
            <span className="text-ash italic">Данные недоступны</span>
          )}
          {!loading && !error && data && (
            data.lastRaiseAt ? (
              formatRaisePeriod(data.lastRaiseAt)
            ) : (
              <span className="text-ash italic">Не зафиксировано</span>
            )
          )}
        </button>
      )}
    </div>
  );
}

function EyeIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 3C17.392 3 21.878 6.88 22.819 12C21.879 17.12 17.392 21 12 21C6.60803 21 2.12215 17.12 1.18164 12C2.12119 6.88 6.60803 3 12 3ZM12 19C16.2359 19 19.8603 16.052 20.7777 12C19.8603 7.948 16.2359 5 12 5C7.76412 5 4.13965 7.948 3.22227 12C4.13965 16.052 7.76412 19 12 19ZM12 16.5C9.51472 16.5 7.5 14.4853 7.5 12C7.5 9.51472 9.51472 7.5 12 7.5C14.4853 7.5 16.5 9.51472 16.5 12C16.5 14.4853 14.4853 16.5 12 16.5ZM12 14.5C13.3807 14.5 14.5 13.3807 14.5 12C14.5 10.6193 13.3807 9.5 12 9.5C10.6193 9.5 9.5 10.6193 9.5 12C9.5 13.3807 10.6193 14.5 12 14.5Z" />
    </svg>
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
