'use client';

import { useMemo, useState } from 'react';
import Avatar from '@/components/Avatar';
import { ChevronDownIcon } from '@/components/icons';
import { getOnTimeZone } from '@/lib/perfScore';
import type { UserRow, GradeThreshold, TeamStats, AttentionItem } from './UsersClient';

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
  onToggleActive,
  teamStats,
  nineBox,
  attention,
}: {
  users: UserRow[];
  gradeThresholds: GradeThreshold[];
  onRowClick: (user: UserRow) => void;
  onToggleActive: (user: UserRow) => void;
  teamStats: TeamStats;
  nineBox: Record<string, number>;
  attention: AttentionItem[];
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
    const ids = new Set(podium.map((u) => u.id));
    return sorted.filter((u) => !ids.has(u.id));
  }, [sorted, podium]);
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
      <div className="card p-10 text-center text-stone">Нет дизайнеров в выборке.</div>
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
        title={tooltip}
        className={`label-mono py-2.5 px-4 text-stone cursor-pointer select-none hover:text-ink transition-colors ${alignClass}`}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          {active && (
            <ChevronDownIcon
              className={`w-3 h-3 text-ink ${sortDir === 'asc' ? 'rotate-180' : ''}`}
            />
          )}
        </span>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      {/* Агрегаты команды (концепт v4) */}
      <TeamBento stats={teamStats} />

      {/* Подиум топ-3 по composite */}
      {podium.length > 0 && (
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
          <tr className="bg-canvas border-b border-cloud">
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
            <th className="label-mono text-center py-2.5 px-4 text-stone">
              Активен
            </th>
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
                    rank={index + podium.length + 1}
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
                    // Оценка начата, но не опубликована — оранжевый статус
                    <span className="chip-warn whitespace-nowrap">черновик</span>
                  ) : (
                    <span className="chip-neutral whitespace-nowrap">не оценена</span>
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
                <td className="py-3 px-4 text-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleActive(u);
                    }}
                    className={`relative w-9 h-5 rounded-full transition-colors ${
                      u.active ? 'bg-emerald' : 'bg-cloud'
                    }`}
                    aria-label={u.active ? 'Деактивировать' : 'Активировать'}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        u.active ? 'left-[18px]' : 'left-0.5'
                      }`}
                    />
                  </button>
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

/** Conic-кольцо с числом в центре (NIPC, скор подиума). */
function Ring({ percent }: { percent: number | null }) {
  const p = Math.max(0, Math.min(100, percent ?? 0));
  return (
    <div
      className="relative w-[76px] h-[76px] rounded-full shrink-0"
      style={{
        background: `conic-gradient(rgb(var(--c-lime)) ${p}%, rgb(var(--c-cloud)) 0)`,
      }}
    >
      <div className="absolute inset-[6px] rounded-full bg-snow flex items-center justify-center">
        <span className="font-display text-lg font-medium tracking-tight">
          {percent === null ? '—' : `${percent}%`}
        </span>
      </div>
    </div>
  );
}

/** Строка агрегатов команды над лидербордом. */
function TeamBento({ stats }: { stats: TeamStats }) {
  const otZone =
    stats.onTimeMedian == null
      ? 'text-ash'
      : stats.onTimeMedian >= 85
        ? 'text-emerald'
        : stats.onTimeMedian >= 70
          ? 'text-sunset'
          : 'text-blaze';
  const growth =
    stats.growthMedian == null
      ? '—'
      : `${stats.growthMedian >= 0 ? '+' : ''}${stats.growthMedian}`;
  const seasonPct = stats.totalDesigners
    ? Math.round((stats.gradedCount / stats.totalDesigners) * 100)
    : 0;
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <div className="card p-5 flex items-center gap-4">
        <Ring percent={stats.nipcPercent} />
        <div className="min-w-0">
          <div className="label-mono text-stone mb-1.5">Dream Team · NIPC</div>
          <div className="text-xs text-stone leading-relaxed">
            звёзды + потенциал + производительность − зоны риска
          </div>
          <div className="text-[11px] text-ash mt-1">{stats.nineBoxPlaced} в 9-Box</div>
        </div>
      </div>
      <div className="card p-5 flex flex-col">
        <div className="label-mono text-stone">В срок · команда</div>
        <div className={`font-display text-[42px] leading-none font-medium tracking-tight mt-3 ${otZone}`}>
          {stats.onTimeMedian == null ? '—' : `${stats.onTimeMedian}%`}
        </div>
        <div className="text-xs text-stone mt-auto pt-2">
          медиана 6 мес · {stats.onTimeSample} с данными
        </div>
      </div>
      <div className="card p-5 flex flex-col">
        <div className="label-mono text-stone">Скорость роста · медиана</div>
        <div className="font-display text-[42px] leading-none font-medium tracking-tight mt-3">
          {growth}
          {stats.growthMedian != null && (
            <span className="text-sm text-ash font-normal ml-1.5">XP/цикл</span>
          )}
        </div>
        <div className="text-xs text-stone mt-auto pt-2">
          <span className="text-emerald font-medium">{stats.readyCount}</span> в ≤20 XP от
          повышения
        </div>
      </div>
      <div className="card p-5 flex flex-col">
        <div className="label-mono text-stone">Сезон оценок</div>
        <div className="font-display text-[42px] leading-none font-medium tracking-tight mt-3">
          {stats.gradedCount}
          <span className="text-lg text-ash font-normal"> / {stats.totalDesigners}</span>
        </div>
        <div className="h-1 bg-cloud rounded-full overflow-hidden mt-3">
          <div className="h-full bg-lime rounded-full" style={{ width: `${seasonPct}%` }} />
        </div>
        <div className="text-xs text-stone mt-auto pt-2">
          {stats.draftCount} черновиков ждут публикации
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={`card card-hover p-6 text-left w-full relative overflow-hidden ${
        place === 1 ? 'border-lime/40' : ''
      }`}
    >
      {/* Лаймовый глоу у №1 — как в концепте */}
      {place === 1 && (
        <div
          className="absolute -bottom-16 -left-8 -right-8 h-32 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at 50% 100%, rgba(213,255,12,.16), transparent 65%)',
          }}
        />
      )}
      <span className="label-mono text-ash absolute top-6 right-6">№{place}</span>
      <div className="flex items-center gap-4">
        <div
          className="relative w-[64px] h-[64px] rounded-full shrink-0"
          style={{
            background: `conic-gradient(rgb(var(--c-lime)) ${score}%, rgb(var(--c-cloud)) 0)`,
            boxShadow: '0 0 22px rgba(213,255,12,.22)',
          }}
        >
          <div className="absolute inset-[4px] rounded-full bg-snow flex items-center justify-center overflow-hidden">
            <Avatar name={user.fullName} avatarUrl={user.avatarUrl} size={56} />
          </div>
        </div>
        <div
          className={`font-display text-[52px] font-medium tracking-tight leading-none ${scoreZoneClass(score)}`}
        >
          {score}
          <span className="text-sm text-ash font-normal tracking-normal">/100</span>
        </div>
      </div>
      <div className="font-medium mt-3.5 truncate">{user.fullName}</div>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {user.effectiveGrade && (
          <span className="chip bg-ink text-snow">
            {GRADE_LABELS[user.effectiveGrade] ?? user.effectiveGrade}
          </span>
        )}
        {user.build && (
          <span className="chip-build">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: buildColor(user.build.code) }}
            />
            {user.build.name}
          </span>
        )}
        {user.onTimePercent != null && (
          <span className="chip-neutral">в срок {Math.round(user.onTimePercent)}%</span>
        )}
      </div>
      <div className="flex gap-1.5 mt-4">
        {TAXONOMIES.map((t) => {
          const v = user.xpByTaxonomy?.[t] ?? 0;
          const h = Math.round((v / skillMax[t]) * 100);
          return (
            <div key={t} className="flex-1">
              <div className="label-mono text-ash text-center mb-1">{t}</div>
              <div className="h-6 rounded-[5px] bg-cloud/60 relative overflow-hidden">
                <div
                  className="absolute bottom-0 left-0 right-0 bg-lime/80 rounded-b-[5px]"
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
  { key: 'high_mid', title: 'Высокий потенциал', tone: 'plain' },
  { key: 'high_high', title: 'Звёзды', tone: 'hot' },
  { key: 'mid_low', title: 'Зона особого внимания', tone: 'warn' },
  { key: 'mid_mid', title: 'Основа команды', tone: 'plain' },
  { key: 'mid_high', title: 'Высокая производительность', tone: 'hot' },
  { key: 'low_low', title: 'Ошибка подбора', tone: 'warn' },
  { key: 'low_mid', title: 'Зона особого внимания', tone: 'warn' },
  { key: 'low_high', title: 'Рабочие лошадки', tone: 'hot' },
];

function PotentialMap({ nineBox }: { nineBox: Record<string, number> }) {
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-base font-medium">Карта потенциала</h3>
        <span className="text-[11px] text-ash">производительность → · потенциал ↑</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {NINE_CELLS.map((c) => {
          const n = nineBox[c.key] ?? 0;
          // Тонируем только непустые ячейки — пустые не кричат.
          const tone =
            n === 0
              ? 'border-cloud bg-canvas/40'
              : c.tone === 'hot'
                ? 'border-lime/30 bg-lime/10'
                : c.tone === 'warn'
                  ? 'border-blaze/25 bg-blaze/10'
                  : 'border-cloud bg-canvas/40';
          return (
            <div
              key={c.key}
              className={`rounded-card border px-3 py-2.5 min-h-[64px] flex flex-col justify-between ${tone}`}
            >
              <span className="text-[10.5px] text-stone leading-tight">{c.title}</span>
              <span className={`font-display text-xl font-medium ${n === 0 ? 'text-ash' : ''}`}>
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
/** Зоны скор-цифр — как в концептах: 70+ лайм, 60+ зелёный, 50+ оранжевый. */
function scoreZoneClass(pct: number): string {
  return pct >= 70
    ? 'text-score-hi'
    : pct >= 60
      ? 'text-emerald'
      : pct >= 50
        ? 'text-sunset'
        : 'text-blaze';
}

function TopCell({ score, rank }: { score: number | null; rank: number }) {
  if (score == null) {
    return (
      <div className="flex flex-col items-center">
        <span className="text-ash text-base tabular-nums">—</span>
        <span className="text-ash text-[10px] tabular-nums mt-0.5">#{rank}</span>
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
      <span className="text-ash text-[10px] tabular-nums mt-0.5">#{rank}</span>
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
