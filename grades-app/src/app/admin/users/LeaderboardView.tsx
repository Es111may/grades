'use client';

import { useMemo, useState } from 'react';
import Avatar from '@/components/Avatar';
import { ChevronDownIcon } from '@/components/icons';
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

type SortKey = 'name' | 'grade' | 'totalXp' | 'tenure' | TaxKey;

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

  const [sortKey, setSortKey] = useState<SortKey>('totalXp');
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
      if (sortKey === 'name') {
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
  }: {
    keyId: SortKey;
    children: React.ReactNode;
    align?: 'left' | 'center' | 'right';
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
        className={`py-2.5 px-4 font-medium text-[11px] text-stone cursor-pointer select-none hover:text-ink transition-colors ${alignClass}`}
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
            <Th keyId="name">Имя</Th>
            <th className="text-left py-2.5 px-4 font-medium text-[11px] text-stone">
              Билд
            </th>
            <Th keyId="grade">Грейд</Th>
            <Th keyId="totalXp" align="center">
              XP
            </Th>
            {TAXONOMIES.map((t) => (
              <Th key={t} keyId={t} align="center">
                {t}
              </Th>
            ))}
            <Th keyId="tenure" align="center">
              Стаж
            </Th>
            <th className="text-center py-2.5 px-4 font-medium text-[11px] text-stone">
              Активен
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cloud">
          {sorted.map((u) => {
            return (
              <tr
                key={u.id}
                onClick={() => onRowClick(u)}
                className={`hover:bg-canvas/60 transition-colors cursor-pointer ${
                  !u.active ? 'opacity-50' : ''
                }`}
              >
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
                    <span className="font-display text-sm font-semibold tracking-tight">
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
