'use client';

import { useMemo, useState } from 'react';
import Avatar from '@/components/Avatar';
import { ChevronDownIcon, SearchIcon } from '@/components/icons';
import EmptyState from '@/components/EmptyState';
import { getOnTimeZone } from '@/lib/perfScore';
import type { UserRow, GradeThreshold, TeamStats, AttentionItem } from './UsersClient';
import Tooltip from '@/components/Tooltip';

const GRADE_LABELS: Record<string, string> = {
  junior: 'Джун',
  junior_plus: 'Джун+',
  premiddle: 'Пре-мидл',
  middle: 'Мидл',
  middle_plus: 'Мидл+',
  senior: 'Синьор',
};

const TAXONOMIES = ['UI', 'UX', 'PRD', 'IND', 'RES'] as const;
type TaxKey = (typeof TAXONOMIES)[number];

const buildColor = (code: string) =>
  code === 'creator' ? '#00ca48' : code === 'visioner' ? '#7c3aed' : '#0ea5e9';

type SortKey = 'composite' | 'name' | 'grade' | 'totalXp' | 'onTime' | 'tenure' | TaxKey;

function tenureMonths(hiredAt: string | null): number {
  if (!hiredAt) return -1;
  const s = new Date(hiredAt);
  const n = new Date();
  let m = (n.getFullYear() - s.getFullYear()) * 12 + (n.getMonth() - s.getMonth());
  if (n.getDate() < s.getDate()) m--;
  return m;
}

function formatTenure(months: number): string {
  if (months < 0) return '—';
  if (months < 1) return '<1 мес.';
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
  if (years === 0) return `${m} мес.`;
  if (m === 0) return `${years} ${yearWord(years)}`;
  return `${years} ${yearWord(years)} ${m} мес.`;
}


export default function LeaderboardView({
  users,
  gradeThresholds,
  onRowClick,
  teamStats,
  nineBox,
  attention,
  searching = false,
}: {
  users: UserRow[];
  gradeThresholds: GradeThreshold[];
  onRowClick: (user: UserRow) => void;
  teamStats: TeamStats;
  nineBox: Record<string, number>;
  attention: AttentionItem[];
  /** Активен поисковый запрос — результаты показываем строками таблицы
   *  (подиум скрыт, топ-3 не выпадают из выдачи). */
  searching?: boolean;
}) {
  // На лидерборде сравниваем только дизайнеров — стардизы не грейдируются.
  const designers = useMemo(() => users.filter((u) => u.role === 'designer'), [users]);

  // Дефолтная сортировка — composite score (XP·0.6 + perf·0.4). Это и есть
  // «истинный» рейтинг лидерборда. По клику на любую другую колонку
  // переключается на простую сортировку по ней.
  const [sortKey, setSortKey] = useState<SortKey>('composite');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // По умолчанию сортируем чтобы «лучшее сверху»: имя/стаж — asc, остальное — desc.
      setSortDir(key === 'name' || key === 'tenure' ? 'asc' : 'desc');
    }
  }

  const sorted = useMemo(() => {
    const arr = [...designers];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      // Деактивированные всегда в конец — независимо от выбранной сортировки
      // и направления. Внутри обеих групп сохраняется обычная сортировка.
      if (a.active !== b.active) return a.active ? -1 : 1;
      let av: number | string = 0;
      let bv: number | string = 0;
      if (sortKey === 'composite') {
        av = a.compositeScore ?? -1;
        bv = b.compositeScore ?? -1;
      } else if (sortKey === 'name') {
        av = a.fullName.toLowerCase();
        bv = b.fullName.toLowerCase();
      } else if (sortKey === 'grade') {
        const idx = (code: string | null | undefined) =>
          code ? gradeThresholds.findIndex((g) => g.code === code) : -1;
        av = idx(a.effectiveGrade);
        bv = idx(b.effectiveGrade);
      } else if (sortKey === 'totalXp') {
        av = a.totalXp ?? -1;
        bv = b.totalXp ?? -1;
      } else if (sortKey === 'onTime') {
        // Инхаус и те, у кого нет данных — в конец независимо от sortDir.
        av = a.onTimePercent ?? -1;
        bv = b.onTimePercent ?? -1;
      } else if (sortKey === 'tenure') {
        av = tenureMonths(a.hiredAt);
        bv = tenureMonths(b.hiredAt);
      } else {
        // taxonomy
        av = a.xpByTaxonomy?.[sortKey] ?? -1;
        bv = b.xpByTaxonomy?.[sortKey] ?? -1;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [designers, sortKey, sortDir, gradeThresholds]);

  // Подиум — топ-3 по composite, независимо от сортировки таблицы (витрина).
  const podium = useMemo(
    () =>
      designers
        .filter((u) => u.active && u.compositeScore != null)
        .sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0))
        .slice(0, 3),
    [designers],
  );
  const rest = useMemo(() => {
    // При поиске все результаты — в таблице (подиум скрыт)
    if (searching) return sorted;
    const ids = new Set(podium.map((u) => u.id));
    return sorted.filter((u) => !ids.has(u.id));
  }, [sorted, podium, searching]);
  // Нормировка мини-баров навыков на подиуме: максимум по каждой таксономии
  // среди видимых дизайнеров.
  const skillMax = useMemo(() => {
    const m: Record<TaxKey, number> = { UI: 1, UX: 1, PRD: 1, IND: 1, RES: 1 };
    for (const u of designers)
      for (const t of TAXONOMIES) m[t] = Math.max(m[t], u.xpByTaxonomy?.[t] ?? 0);
    return m;
  }, [designers]);

  if (designers.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={<SearchIcon className="w-5 h-5" />}
          title="Никого не нашлось"
          hint="Поменяй фильтр роли, скоуп «Все/Мои» или поисковый запрос"
        />
      </div>
    );
  }

  function Th({
    keyId,
    children,
    align = 'left',
    tooltip,
  }: {
    keyId: SortKey;
    children: React.ReactNode;
    align?: 'left' | 'center' | 'right';
    /** Нативный browser tooltip — показывается при наведении на заголовок. */
    tooltip?: string;
  }) {
    const active = sortKey === keyId;
    const alignClass =
      align === 'center'
        ? 'text-center'
        : align === 'right'
          ? 'text-right'
          : 'text-left';
    return (
      <th
        onClick={() => toggleSort(keyId)}
        className={`label-mono py-2.5 px-4 text-stone cursor-pointer select-none hover:text-ink transition-colors ${alignClass}`}
      >
        <Tooltip text={tooltip ?? null} maxWidth={340}>
          <span className="inline-flex items-center gap-1">
            {children}
            {active && (
              <ChevronDownIcon
                className={`w-3 h-3 text-ink ${sortDir === 'asc' ? 'rotate-180' : ''}`}
              />
            )}
          </span>
        </Tooltip>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      {/* Агрегаты команды (концепт v4) */}
      <TeamBento stats={teamStats} />

      {/* Подиум топ-3 по composite (при поиске скрыт — результаты таблицей) */}
      {!searching && podium.length > 0 && (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${podium.length}, minmax(0, 1fr))` }}
        >
          {podium.map((u, i) => (
            <PodiumCard
              key={u.id}
              user={u}
              place={i + 1}
              skillMax={skillMax}
              onClick={() => onRowClick(u)}
            />
          ))}
        </div>
      )}

      <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-ink/[0.03] border-b border-cloud">
            {/* «Топ» — место для номера ранга. Кликом возвращает к
                composite-сортировке (дефолтному рейтингу XP+В срок).
                Это и есть «кнопка сброса» — не нужна отдельная.
                Tooltip объясняет формулу — раньше это была отдельная
                подпись над таблицей, спрятали по просьбе Pavel'a. */}
            <Th
              keyId="composite"
              align="center"
              tooltip="Сортировка по рейтингу: XP (40%) + В срок (40%) + 9-Box (20%). 9-Box считается так: ((perf-1)·3 + (pot-1))/8 — performance важнее. Инхаус ранжируется без перформанса (данных в трекерах нет), без 9-Box ячейки — без неё. Кликни на любой столбец, чтобы сортировать по нему."
            >
              Топ
            </Th>
            <Th keyId="name">Имя</Th>
            <th className="label-mono text-left py-2.5 px-4 text-stone">
              Билд
            </th>
            <Th keyId="grade">Грейд</Th>
            <Th keyId="totalXp" align="center">
              XP
            </Th>
            <Th keyId="onTime" align="center">
              В срок
            </Th>
            {TAXONOMIES.map((t) => (
              <Th key={t} keyId={t} align="center">
                {t}
              </Th>
            ))}
            <Th keyId="tenure" align="center">
              Стаж
            </Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cloud">
          {rest.map((u, index) => {
            return (
              <tr
                key={u.id}
                onClick={() => onRowClick(u)}
                className={`hover:bg-canvas/60 transition-colors cursor-pointer ${
                  !u.active ? 'opacity-50' : ''
                }`}
              >
                <td className="py-3 px-4 text-center">
                  <TopCell
                    score={u.compositeScore ?? null}
                    rank={index + (searching ? 1 : podium.length + 1)}
                  />
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.fullName} avatarUrl={u.avatarUrl} size={32} />
                    <div className="min-w-0">
                      <div className="font-medium leading-tight truncate">
                        {u.fullName}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4">
                  {u.build ? (
                    <span className="chip-build">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: buildColor(u.build.code) }}
                      />
                      {u.build.name}
                    </span>
                  ) : (
                    <span className="text-ash">—</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  {u.effectiveGrade ? (
                    <span className="font-display text-sm font-medium tracking-tight">
                      {GRADE_LABELS[u.effectiveGrade] ?? u.effectiveGrade}
                    </span>
                  ) : u.hasDraft ? (
                    <span className="chip-warn whitespace-nowrap">черновик</span>
                  ) : (
                    // Текстом в стиле грейда, серым — не чипом (Pavel)
                    <span className="font-display text-sm font-medium tracking-tight text-ash whitespace-nowrap">
                      Без оценки
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-center">
                  {u.totalXp !== null && u.totalXp !== undefined ? (
                    <span className="tabular-nums font-medium">{u.totalXp}</span>
                  ) : (
                    <span className="text-ash">—</span>
                  )}
                </td>
                <td className="py-3 px-4 text-center">
                  <OnTimeCell
                    onTimePercent={u.onTimePercent ?? null}
                    totalTasks={u.onTimeTotalTasks ?? 0}
                    buildCode={u.build?.code ?? null}
                  />
                </td>
                {TAXONOMIES.map((t) => (
                  <td key={t} className="py-3 px-4 text-center tabular-nums text-stone">
                    {u.xpByTaxonomy?.[t] ?? '—'}
                  </td>
                ))}
                <td className="py-3 px-4 text-center text-stone whitespace-nowrap">
                  {formatTenure(tenureMonths(u.hiredAt))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {/* Нижний ряд: карта потенциала + сигналы */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <PotentialMap nineBox={nineBox} />
        <AttentionFeed items={attention} />
      </div>
    </div>
  );
}

/* ================= Компоненты редизайна (концепт v4) ================= */

/** Спарклайн «в срок» команды по месяцам (стиль концепта: зелёная линия
 *  с заливкой, прижат к низу карточки). */
function OnTimeSparkline({ points }: { points: number[] }) {
  const W = 200;
  const H = 34;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const X = (i: number) => (i / (points.length - 1)) * W;
  const Y = (v: number) => H - 4 - ((v - min) / range) * (H - 8);
  const line = points
    .map((v, i) => `${i ? 'L' : 'M'} ${X(i).toFixed(1)} ${Y(v).toFixed(1)}`)
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-[34px] mt-auto pt-1 block"
      aria-hidden="true"
    >
      <path
        d={`${line} L ${W} ${H} L 0 ${H} Z`}
        fill="rgba(48,209,88,.12)"
      />
      <path
        d={line}
        fill="none"
        stroke="#30d158"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Строка агрегатов команды над лидербордом. */
function TeamBento({ stats }: { stats: TeamStats }) {
  const growth =
    stats.growthMedian == null
      ? '—'
      : `${stats.growthMedian >= 0 ? '+' : ''}${stats.growthMedian}`;
  const seasonPct = stats.totalDesigners
    ? Math.round((stats.gradedCount / stats.totalDesigners) * 100)
    : 0;
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {/* NIPC — та же анатомия, что у соседей: число · описание · бар */}
      <div className="card p-5 flex flex-col min-h-[188px]">
        <div className="label-mono text-stone">Dream Team Index · NIPC</div>
        <div className="font-display text-[44px] leading-none font-medium tracking-tight mt-3">
          {stats.nipcPercent == null ? '—' : `${stats.nipcPercent}%`}
          {/* Phase 25: динамика с начала оценочного цикла */}
          {stats.nipcDelta != null && stats.nipcDelta !== 0 && (
            <span
              className={`text-sm font-normal tracking-normal ml-2 ${
                stats.nipcDelta > 0 ? 'text-emerald' : 'text-blaze'
              }`}
            >
              {stats.nipcDelta > 0 ? '+' : ''}
              {stats.nipcDelta} п.п. за цикл
            </span>
          )}
        </div>
        <div className="text-xs text-stone mt-2 leading-relaxed">
          ({stats.nipcStars + stats.nipcHpot + stats.nipcHperf} сверху триады −{' '}
          {stats.nipcRisk} {stats.nipcRisk === 1 ? 'зона' : 'зоны'} риска) /{' '}
          {stats.nipcTotal}
        </div>
        <div className="text-xs text-stone mt-1">
          Цель &gt;{' '}
          {[20, 35, 50].map((g, i) => (
            <span key={g}>
              {i > 0 && ' / '}
              <span
                className={
                  (stats.nipcPercent ?? 0) > g ? 'text-emerald font-medium' : ''
                }
              >
                {g}
              </span>
            </span>
          ))}
        </div>
        {/* Бар с рисками целей 20/35/50 */}
        <div className="relative h-1 bg-cloud rounded-full mt-auto">
          <div
            className="absolute inset-y-0 left-0 bg-emerald rounded-full"
            style={{
              width: `${Math.max(0, Math.min(100, stats.nipcPercent ?? 0))}%`,
            }}
          />
          {[20, 35, 50].map((g) => (
            <Tooltip
              key={g}
              align="center"
              className="absolute -top-[3px] px-1 -ml-1"
              style={{ left: `${g}%` }}
              text={`Цель >${g}%`}
            >
              <span className="block h-2.5 w-px bg-ash/80" aria-hidden />
            </Tooltip>
          ))}
        </div>
      </div>
      <div className="card p-5 flex flex-col min-h-[188px]">
        <div className="label-mono text-stone">В срок · команда</div>
        {/* Цифра белая, как в концепте (семантика цвета — в колонке таблицы) */}
        <div className="font-display text-[44px] leading-none font-medium tracking-tight mt-3">
          {stats.onTimeMedian == null ? '—' : `${stats.onTimeMedian}%`}
        </div>
        <div className="text-xs text-stone mt-2">медиана за 6 месяцев</div>
        {/* Живой спарклайн — месячная динамика из ClickHouse */}
        {stats.onTimeSpark.length >= 2 && (
          <OnTimeSparkline points={stats.onTimeSpark} />
        )}
      </div>
      <div className="card p-5 flex flex-col min-h-[188px]">
        <div className="label-mono text-stone">Скорость роста · медиана</div>
        <div className="font-display text-[44px] leading-none font-medium tracking-tight mt-3">
          {growth}
          {stats.growthMedian != null && (
            <span className="text-sm text-ash font-normal ml-1.5">XP/цикл</span>
          )}
        </div>
        <div className="text-xs text-stone mt-2">
          <span className="text-emerald font-medium">
            {stats.readyCount}{' '}
            {plural(stats.readyCount, ['дизайнер', 'дизайнера', 'дизайнеров'])}
          </span>{' '}
          в ≤20 XP от повышения
        </div>
        <div className="h-1 bg-cloud rounded-full overflow-hidden mt-auto">
          <div
            className="h-full bg-emerald rounded-full"
            style={{
              width: `${stats.totalDesigners ? Math.round((stats.readyCount / stats.totalDesigners) * 100) : 0}%`,
            }}
          />
        </div>
      </div>
      <div className="card p-5 flex flex-col min-h-[188px]">
        <div className="label-mono text-stone">Сезон оценок</div>
        <div className="font-display text-[44px] leading-none font-medium tracking-tight mt-3">
          {stats.gradedCount}
          <span className="text-lg text-ash font-normal"> / {stats.totalDesigners}</span>
        </div>
        <div className="text-xs text-stone mt-2">
          {stats.draftCount}{' '}
          {plural(stats.draftCount, ['черновик ждёт', 'черновика ждут', 'черновиков ждут'])}{' '}
          публикации
          {stats.totalDesigners - stats.gradedCount - stats.draftCount > 0 &&
            ` · ${stats.totalDesigners - stats.gradedCount - stats.draftCount} без оценки`}
        </div>
        <div className="h-1 bg-cloud rounded-full overflow-hidden mt-auto">
          <div
            className="h-full bg-emerald rounded-full"
            style={{ width: `${seasonPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/** Карточка подиума (топ-3 по composite). */
function PodiumCard({
  user,
  place,
  skillMax,
  onClick,
}: {
  user: UserRow;
  place: number;
  skillMax: Record<TaxKey, number>;
  onClick: () => void;
}) {
  const score = Math.round((user.compositeScore ?? 0) * 100);
  // Спека Pavel: высота тега ровно 24px, шрифт 10px.
  const chipSm =
    'inline-flex items-center gap-1.5 px-2.5 h-6 rounded-pill text-[10px] font-medium leading-none shrink-0';
  return (
    // Компактная карточка: тонкий паддинг, теги размером как в списке,
    // всё в одну строку, аватар в правом углу.
    <button
      type="button"
      onClick={onClick}
      className="card p-4 text-left w-full transition-all duration-200 ease-apple-out
                 hover:shadow-soft-md hover:-translate-y-1 hover:border-ash"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="font-medium text-[15px] leading-tight truncate mt-0.5 min-w-0 flex-1">
          {user.fullName}
        </div>
        <Avatar name={user.fullName} avatarUrl={user.avatarUrl} size={40} />
      </div>
      {/* Чипы одной строкой на всю ширину карточки (nowrap) */}
      <div className="flex items-center gap-1 mt-2 whitespace-nowrap overflow-hidden">
        {/* Скор с № — насыщенный зелёный (Pavel) */}
        <span className={`${chipSm} bg-emerald text-white`}>
          <b className="font-medium">{score}</b>
          <span className="text-white/75">№{place}</span>
        </span>
        {user.effectiveGrade && (
          <span className={`${chipSm} bg-ink text-snow`}>
            {GRADE_LABELS[user.effectiveGrade] ?? user.effectiveGrade}
          </span>
        )}
        {user.build && (
          <span className={`${chipSm} bg-cloud/60 text-stone`}>
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: buildColor(user.build.code) }}
            />
            {user.build.name}
          </span>
        )}
        {user.onTimePercent != null && (
          <span className={`${chipSm} bg-ink/[0.07] text-stone`}>
            {Math.round(user.onTimePercent)}% в срок
          </span>
        )}
      </div>
      <div className="flex gap-1.5 mt-3.5">
        {TAXONOMIES.map((t) => {
          const v = user.xpByTaxonomy?.[t] ?? 0;
          const h = Math.round((v / skillMax[t]) * 100);
          return (
            <div key={t} className="flex-1">
              <div className="label-mono text-ash text-center mb-1">{t}</div>
              <div className="h-4 rounded-[5px] bg-cloud/60 relative overflow-hidden">
                <div
                  className="absolute bottom-0 left-0 right-0 bg-ink/20 rounded-b-[5px]"
                  style={{ height: `${h}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </button>
  );
}

/** 3×3 карта потенциала: счётчики по ячейкам 9-Box. */
const NINE_CELLS: Array<{ key: string; title: string; tone: 'hot' | 'warn' | 'plain' }> = [
  { key: 'high_low', title: 'Проблемные гении', tone: 'warn' },
  { key: 'high_mid', title: 'Высокий потенциал', tone: 'hot' },
  { key: 'high_high', title: 'Звёзды', tone: 'hot' },
  { key: 'mid_low', title: 'Зона особого внимания', tone: 'warn' },
  { key: 'mid_mid', title: 'Основа команды', tone: 'plain' },
  { key: 'mid_high', title: 'Высокая производительность', tone: 'hot' },
  { key: 'low_low', title: 'Ошибка подбора', tone: 'warn' },
  { key: 'low_mid', title: 'Зона особого внимания', tone: 'warn' },
  { key: 'low_high', title: 'Рабочие лошадки', tone: 'plain' },
];

function PotentialMap({ nineBox }: { nineBox: Record<string, number> }) {
  return (
    <div className="card p-5 h-full flex flex-col">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-base font-medium">Карта потенциала</h3>
        <span className="text-[11px] text-ash">производительность → · потенциал ↑</span>
      </div>
      {/* auto-rows-fr + flex-1 — ячейки равномерно делят высоту карточки */}
      <div className="grid grid-cols-3 auto-rows-fr gap-2 flex-1">
        {NINE_CELLS.map((c) => {
          const n = nineBox[c.key] ?? 0;
          // Тонируем только непустые ячейки — пустые не кричат.
          // «Верхняя триада» — зелёная (emerald), зоны риска — красные.
          const tone =
            n === 0
              ? 'border-cloud bg-canvas/40'
              : c.tone === 'hot'
                ? 'border-emerald/30 bg-emerald/10'
                : c.tone === 'warn'
                  ? 'border-blaze/25 bg-blaze/10'
                  : 'border-cloud bg-canvas/40';
          return (
            <div
              key={c.key}
              className={`rounded-card border px-3 py-2.5 flex flex-col ${tone}`}
            >
              <span className="text-[10.5px] text-stone leading-tight">{c.title}</span>
              {/* Число — по центру оставшегося пространства ячейки */}
              <span
                className={`flex-1 flex items-center justify-center font-display text-2xl font-medium ${
                  n === 0 ? 'text-ash' : ''
                }`}
              >
                {n}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Лента сигналов «Требует внимания». */
function AttentionFeed({ items }: { items: AttentionItem[] }) {
  const DOT: Record<AttentionItem['tone'], string> = {
    danger: 'bg-blaze',
    warn: 'bg-sunset',
    info: 'bg-sky',
  };
  return (
    <div className="card p-5">
      <h3 className="text-base font-medium mb-4">Требует внимания</h3>
      {items.length === 0 ? (
        <div className="text-sm text-ash italic">Сигналов нет — команда в порядке</div>
      ) : (
        <div className="space-y-2">
          {items.map((it, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-card border border-cloud bg-canvas/40"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[it.tone]}`} />
              <span className="text-sm font-medium flex-1 min-w-0 truncate">{it.title}</span>
              <span className="text-xs text-stone whitespace-nowrap">{it.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Ячейка «Топ» — composite score 0..100 крупно и в цвете, под ним мелкая
 * серая позиция в текущей сортировке.
 *
 * Цветовые зоны для score (Pavel):
 *   90–100  → emerald (зелёный)
 *   70–89   → light emerald (светло-зелёный)
 *   50–69   → amber (жёлтый)
 *    0–49   → blaze (красный)
 *
 * Если у дизайнера ещё нет ни одной опубликованной оценки (score=null) —
 * вместо числа показываем «—» серым, чтобы не путать с реальным 0.
 */
/** Зоны скор-цифр — как в концептах: 80+ лайм, 60+ зелёный, 50+ оранжевый. */
function scoreZoneClass(pct: number): string {
  return pct >= 80
    ? 'text-score-hi'
    : pct >= 60
      ? 'text-emerald'
      : pct >= 50
        ? 'text-sunset'
        : 'text-blaze';
}

/** Склонение существительных: plural(3, ['день','дня','дней']). */
function plural(n: number, forms: [string, string, string]): string {
  const last = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

function TopCell({ score, rank }: { score: number | null; rank: number }) {
  if (score == null) {
    return (
      <div className="flex flex-col items-center">
        <span className="text-ash text-base tabular-nums">—</span>
        <span className="text-ash text-[10px] tabular-nums mt-0.5">№{rank}</span>
      </div>
    );
  }
  const pct = Math.round(score * 100);
  return (
    <div className="flex flex-col items-center">
      <span
        className={`font-display text-xl font-medium tabular-nums leading-none ${scoreZoneClass(pct)}`}
      >
        {pct}
      </span>
      <span className="text-ash text-[10px] tabular-nums mt-0.5">№{rank}</span>
    </div>
  );
}

/**
 * Ячейка «В срок» в лидерборде.
 * - Инхаус (creator) и пустая выборка → «—».
 * - Иначе процент в цвете под зону (emerald ≥ 85, amber 70–84, blaze < 70).
 */
function OnTimeCell({
  onTimePercent,
  totalTasks,
  buildCode,
}: {
  onTimePercent: number | null;
  totalTasks: number;
  buildCode: string | null;
}) {
  if (buildCode === 'creator' || onTimePercent == null || totalTasks === 0) {
    return <span className="text-ash">—</span>;
  }
  const zone = getOnTimeZone(onTimePercent);
  const colorClass =
    zone === 'emerald' ? 'text-emerald' : zone === 'amber' ? 'text-sunset' : 'text-blaze';
  return (
    <span className={`tabular-nums font-medium ${colorClass}`}>
      {Math.round(onTimePercent)}%
    </span>
  );
}
