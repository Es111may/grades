'use client';

import { useState } from 'react';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';
import { GRADE_NAMES } from '@/lib/types';
import type { BuildCode, GradeCode } from '@/lib/types';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const TAXONOMY_ORDER = ['UI', 'UX', 'PRD', 'IND', 'RES'];
const TAXONOMY_COLOR: Record<string, string> = {
  UI: '#34c759',   // green
  UX: '#0ea5e9',   // sky blue
  PRD: '#ef4444',  // red
  IND: '#7c3aed',  // violet
  RES: '#f59e0b',  // amber
};

export type PortraitData = {
  assessmentId: number;
  designer: {
    fullName: string;
    buildCode: BuildCode | null;
    buildName: string;
    department: string | null;
    leadName: string | null;
    gradeFloor: GradeCode | null;
  };
  cycle: string;
  publishedAt: string | null;
  effectiveGrade: GradeCode;
  calculatedGrade: GradeCode;
  totalXp: number;
  maxXp: number;
  xpByTaxonomy: Record<string, number>;
  maxXpByTaxonomy: Record<string, number>;
  xpByGroup: Record<string, Record<string, { current: number; max: number }>>;
  nextGrade: {
    code: GradeCode;
    xpNeeded: number;
    failedGates: {
      skillId: number;
      skillName: string;
      requiredMastery: number;
      currentMastery: number;
    }[];
  } | null;
  skills: {
    id: number;
    name: string;
    description: string;
    taxonomyCode: string;
    taxonomyName: string;
    groupName: string;
    weight: number;
    masteryLevel: number;
    maxMasteryLevel: number;
    levelTitle: string | null;
    levels: { level: number; title: string; criteria: string }[];
  }[];
};

export default function Portrait({ data }: { data: PortraitData }) {
  const [rowHovered, setRowHovered] = useState(false);

  const xpProgress = data.maxXp > 0 ? Math.round((data.totalXp / data.maxXp) * 100) : 0;
  const isFloorActive =
    !!data.designer.gradeFloor && data.calculatedGrade !== data.effectiveGrade;

  // Main radar — absolute XP per taxonomy, current + max overlay
  const labels = TAXONOMY_ORDER;
  const currentValues = TAXONOMY_ORDER.map((c) => data.xpByTaxonomy[c] ?? 0);
  const maxValues = TAXONOMY_ORDER.map((c) => data.maxXpByTaxonomy[c] ?? 0);

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Максимум',
        data: maxValues,
        backgroundColor: 'transparent',
        borderColor: '#c8c5bb',
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointBackgroundColor: '#c8c5bb',
        pointBorderColor: '#c8c5bb',
        pointRadius: 2,
      },
      {
        label: `Текущий (${data.designer.fullName.split(' ')[0]})`,
        data: currentValues,
        backgroundColor: 'rgba(52, 199, 89, 0.18)',
        borderColor: '#34c759',
        borderWidth: 2,
        pointBackgroundColor: '#34c759',
        pointBorderColor: '#34c759',
        pointRadius: 4,
      },
    ],
  };

  const chartOptions = {
    scales: {
      r: {
        suggestedMin: 0,
        ticks: { color: '#86857f', backdropColor: 'transparent', font: { size: 10 } },
        grid: { color: '#e5e3dc' },
        angleLines: { color: '#e5e3dc' },
        pointLabels: {
          font: { size: 14, family: 'Manrope', weight: 600 as const },
          color: '#1a1a1a',
        },
      },
    },
    plugins: { legend: { display: false } },
    maintainAspectRatio: false,
  };

  // Group skills by taxonomy → group
  const grouped = new Map<string, Map<string, typeof data.skills>>();
  for (const s of data.skills) {
    if (!grouped.has(s.taxonomyCode)) grouped.set(s.taxonomyCode, new Map());
    const taxMap = grouped.get(s.taxonomyCode)!;
    if (!taxMap.has(s.groupName)) taxMap.set(s.groupName, []);
    taxMap.get(s.groupName)!.push(s);
  }

  return (
    <main className="max-w-[1300px] mx-auto px-8 pt-8 pb-16">
      {/* Hero */}
      <div className="mb-6">
        <h1 className="font-display text-4xl font-semibold tracking-tight mb-2">
          {data.designer.fullName}
        </h1>
        <div className="flex items-center gap-2 text-sm text-stone flex-wrap">
          {data.designer.buildCode && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-pill border border-cloud bg-snow text-xs">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background:
                    data.designer.buildCode === 'creator'
                      ? '#ade900'
                      : data.designer.buildCode === 'visioner'
                        ? '#7c3aed'
                        : '#0ea5e9',
                }}
              />
              {data.designer.buildName}
            </span>
          )}
          <span>{data.designer.department ?? '—'}</span>
          {data.designer.leadName && (
            <>
              <span className="text-ash">·</span>
              <span>Лид: {data.designer.leadName}</span>
            </>
          )}
          {data.publishedAt && (
            <>
              <span className="text-ash">·</span>
              <span className="text-ash">
                {new Date(data.publishedAt).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Grade card */}
      <div className="card p-7 mb-6">
        <div className="grid grid-cols-[auto_1fr] gap-10 items-end">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-stone mb-2">
              {isFloorActive ? 'Эффективный грейд' : 'Грейд'}
            </div>
            <div className="font-display text-6xl font-semibold tracking-tight leading-none">
              {GRADE_NAMES[data.effectiveGrade]}
            </div>
            {isFloorActive && (
              <div className="text-xs text-sunset mt-2">
                Зафиксирован — расчёт дал {GRADE_NAMES[data.calculatedGrade]}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[11px] uppercase tracking-widest text-stone">
                Общий XP
              </span>
              <span className="font-display text-3xl font-semibold tabular-nums">
                {data.totalXp}
                <span className="text-base text-stone font-normal ml-1.5">
                  из {data.maxXp}
                </span>
              </span>
            </div>
            <div className="h-1.5 bg-cloud rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald rounded-full transition-all"
                style={{ width: `${Math.min(xpProgress, 100)}%` }}
              />
            </div>
            <div className="text-xs text-stone mt-1.5">{xpProgress}% от максимума</div>
          </div>
        </div>
      </div>

      {/* Taxonomy progress cards (hovering anywhere reveals the full group breakdown row) */}
      <div
        onMouseEnter={() => setRowHovered(true)}
        onMouseLeave={() => setRowHovered(false)}
        className="mb-3"
      >
        <div className="grid grid-cols-5 gap-3">
          {TAXONOMY_ORDER.map((code) => {
            const got = data.xpByTaxonomy[code] ?? 0;
            const max = data.maxXpByTaxonomy[code] ?? 0;
            const pct = max > 0 ? Math.round((got / max) * 100) : 0;
            const color = TAXONOMY_COLOR[code];
            return (
              <div
                key={code}
                className={`bg-snow border rounded-card px-5 py-4 transition-all duration-200 ${
                  rowHovered
                    ? 'border-ash shadow-soft-md'
                    : 'border-cloud shadow-soft'
                }`}
              >
                <div className="text-[11px] uppercase tracking-widest text-stone mb-1.5">
                  {code}
                </div>
                <div className="font-display text-2xl font-semibold tabular-nums mb-2">
                  {got}
                  <span className="text-sm text-stone font-normal ml-1">из {max}</span>
                </div>
                <div className="h-1 bg-cloud rounded-full overflow-hidden mb-1">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      background: color,
                    }}
                  />
                </div>
                <div className="text-xs text-stone tabular-nums">{pct}%</div>
              </div>
            );
          })}
        </div>

        {/* Hover strip — group breakdown for ALL taxonomies */}
        <div
          className={`overflow-hidden transition-all duration-200 ease-apple-out ${
            rowHovered ? 'max-h-[400px] mt-3' : 'max-h-0 mt-0'
          }`}
        >
          <div className="card p-5">
            <div className="text-[11px] uppercase tracking-widest text-stone mb-4">
              Группы внутри — % от максимума
            </div>
            <div className="grid grid-cols-5 gap-4">
              {TAXONOMY_ORDER.map((code) => (
                <div key={code}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: TAXONOMY_COLOR[code] }}
                    />
                    <span className="text-[11px] uppercase tracking-widest text-stone">
                      {code}
                    </span>
                  </div>
                  {data.xpByGroup[code] ? (
                    <GroupBreakdown
                      groups={data.xpByGroup[code]}
                      color={TAXONOMY_COLOR[code]}
                      compact
                    />
                  ) : (
                    <div className="text-xs text-ash italic">нет данных</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main radar */}
      <div className="card p-7 mb-8">
        <div className="flex items-center gap-5 mb-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald" />
            <span className="text-ink font-medium">
              {data.designer.fullName.split(' ')[0]}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm border border-dashed border-ash" />
            <span className="text-stone">Максимум ({data.designer.buildName})</span>
          </span>
        </div>
        <div style={{ height: 360 }}>
          <Radar data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* Next grade gates */}
      {data.nextGrade && (
        <div className="card p-7 mb-8">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="font-display text-xl font-semibold tracking-tight">
              До грейда «{GRADE_NAMES[data.nextGrade.code]}»
            </h2>
            {data.nextGrade.xpNeeded > 0 && (
              <span className="text-sm text-stone">
                ещё{' '}
                <strong className="text-ink tabular-nums">
                  {data.nextGrade.xpNeeded} XP
                </strong>
              </span>
            )}
          </div>

          {data.nextGrade.failedGates.length === 0 && data.nextGrade.xpNeeded === 0 ? (
            <p className="text-sm text-stone">
              Все условия пройдены — но грейд ещё не назначен.
            </p>
          ) : data.nextGrade.failedGates.length === 0 ? (
            <p className="text-sm text-stone">Гейты пройдены, нужно добрать XP.</p>
          ) : (
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-widest text-stone mb-2">
                Непройденные обязательные навыки
              </div>
              {data.nextGrade.failedGates.map((g) => (
                <div
                  key={g.skillId}
                  className="flex items-center justify-between py-2.5 px-4 bg-canvas rounded-card"
                >
                  <span className="text-sm">{g.skillName}</span>
                  <span className="text-xs text-stone tabular-nums">
                    {g.currentMastery} → {g.requiredMastery}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Skills grouped — accordions */}
      <div className="space-y-7">
        <h2 className="font-display text-2xl font-semibold tracking-tight">Навыки</h2>
        {TAXONOMY_ORDER.filter((code) => grouped.has(code)).map((code) => {
          const taxMap = grouped.get(code)!;
          const taxName =
            data.skills.find((s) => s.taxonomyCode === code)?.taxonomyName ?? code;
          return (
            <div key={code}>
              <div className="flex items-baseline gap-3 mb-3">
                <h3 className="font-display text-lg font-semibold tracking-tight">
                  {taxName}
                </h3>
                <span className="text-[11px] uppercase tracking-widest text-stone">
                  {data.xpByTaxonomy[code] ?? 0} XP
                </span>
              </div>
              <div className="space-y-3">
                {Array.from(taxMap.entries()).map(([groupName, skills]) => (
                  <div key={groupName} className="card p-5">
                    <div className="text-[11px] uppercase tracking-widest text-stone mb-2">
                      {groupName}
                    </div>
                    <div className="space-y-0.5">
                      {skills.map((s) => (
                        <SkillAccordion key={s.id} skill={s} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

function GroupBreakdown({
  groups,
  color,
  compact = false,
}: {
  groups: Record<string, { current: number; max: number }>;
  color: string;
  compact?: boolean;
}) {
  const entries = Object.entries(groups);
  if (entries.length < 3) {
    // Не радар — горизонтальные бары
    return (
      <div className="space-y-1.5">
        {entries.map(([name, { current, max }]) => {
          const pct = max > 0 ? Math.round((current / max) * 100) : 0;
          return (
            <div key={name} className="text-xs">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-stone truncate">{name}</span>
                <span className="text-ash ml-1">{pct}%</span>
              </div>
              <div className="h-1.5 bg-canvas rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(pct, 100)}%`, background: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Радар по группам в этой таксономии
  const labels = entries.map(([name]) => name);
  const values = entries.map(([, { current, max }]) =>
    max > 0 ? Math.round((current / max) * 100) : 0,
  );

  // RGBA from hex for fill
  const hexToRgba = (hex: string, a: number) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  const chartData = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: hexToRgba(color, 0.2),
        borderColor: color,
        borderWidth: 2,
        pointBackgroundColor: color,
        pointBorderColor: color,
        pointRadius: 3,
      },
    ],
  };

  const opts = {
    scales: {
      r: {
        suggestedMin: 0,
        suggestedMax: 100,
        ticks: { display: false },
        grid: { color: '#e5e3dc' },
        angleLines: { color: '#e5e3dc' },
        pointLabels: {
          font: { size: compact ? 9 : 11, family: 'Manrope' },
          color: '#1a1a1a',
        },
      },
    },
    plugins: { legend: { display: false } },
    maintainAspectRatio: false,
  };

  return (
    <div className="flex justify-center">
      <div
        style={{
          width: compact ? '100%' : 360,
          height: compact ? 180 : 240,
        }}
      >
        <Radar data={chartData} options={opts} />
      </div>
    </div>
  );
}

function SkillAccordion({
  skill,
}: {
  skill: {
    id: number;
    name: string;
    description: string;
    weight: number;
    masteryLevel: number;
    maxMasteryLevel: number;
    levelTitle: string | null;
    levels: { level: number; title: string; criteria: string }[];
  };
}) {
  const [open, setOpen] = useState(false);
  const hasContent = skill.description || skill.levels.length > 0;

  return (
    <div className="border-b border-cloud last:border-0">
      <button
        onClick={() => hasContent && setOpen((v) => !v)}
        disabled={!hasContent}
        className="w-full flex items-center justify-between py-2.5 text-left hover:bg-canvas/60 rounded-card -mx-2 px-2 transition-colors disabled:cursor-default disabled:hover:bg-transparent"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {hasContent && (
            <span
              className={`text-ash text-[10px] transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
            >
              ▶
            </span>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm">{skill.name}</div>
            {skill.levelTitle && skill.masteryLevel > 0 && (
              <div className="text-xs text-stone mt-0.5">{skill.levelTitle}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 ml-4">
          <div className="flex gap-1">
            {Array.from({ length: skill.maxMasteryLevel }).map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${
                  i < skill.masteryLevel ? 'bg-emerald' : 'bg-cloud'
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-stone w-14 text-right tabular-nums font-medium">
            {skill.masteryLevel * skill.weight} XP
          </span>
        </div>
      </button>

      {open && (
        <div className="pb-4 pt-2 px-6 space-y-3">
          {skill.description && (
            <p className="text-sm text-stone italic leading-relaxed">
              {skill.description}
            </p>
          )}
          {skill.levels.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-widest text-stone mb-1">
                Уровни мастерства
              </div>
              {skill.levels.map((lvl) => (
                <div
                  key={lvl.level}
                  className={`pl-3 border-l-2 ${
                    lvl.level === skill.masteryLevel ? 'border-emerald' : 'border-cloud'
                  }`}
                >
                  <div className="text-sm">
                    <span className="text-ash mr-2 font-medium tabular-nums">
                      {lvl.level}
                    </span>
                    <span
                      className={
                        lvl.level === skill.masteryLevel ? 'font-medium' : ''
                      }
                    >
                      {lvl.title}
                    </span>
                  </div>
                  {lvl.criteria && (
                    <p className="text-xs text-stone mt-1 whitespace-pre-line leading-relaxed">
                      {lvl.criteria}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
