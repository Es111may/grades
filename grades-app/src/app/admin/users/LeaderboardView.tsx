'use client';

import { useMemo, useState } from 'react';
import Avatar from '@/components/Avatar';
import { ChevronDownIcon } from '@/components/icons';
import { getOnTimeZone } from '@/lib/perfScore';
import type { UserRow, GradeThreshold } from './UsersClient';

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
}: {
  users: UserRow[];
  gradeThresholds: GradeThreshold[];
  onRowClick: (user: UserRow) => void;
  onToggleActive: (user: UserRow) => void;
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
          {sorted.map((u, index) => {
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
                    rank={index + 1}
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
                  ) : (
                    <span className="text-ash">—</span>
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
  const colorClass =
    pct >= 90
      ? 'text-emerald'
      : pct >= 70
        ? 'text-emerald/70'
        : pct >= 50
          ? 'text-amber-600'
          : 'text-blaze';
  return (
    <div className="flex flex-col items-center">
      <span
        className={`font-display text-base font-medium tabular-nums leading-none ${colorClass}`}
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
    zone === 'emerald' ? 'text-emerald' : zone === 'amber' ? 'text-amber-600' : 'text-blaze';
  return (
    <span className={`tabular-nums font-medium ${colorClass}`}>
      {Math.round(onTimePercent)}%
    </span>
  );
}
