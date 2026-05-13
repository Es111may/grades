'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
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
import Avatar from '@/components/Avatar';
import { ChevronDownIcon } from '@/components/icons';
import { MarkdownContent } from '@/components/Markdown';
import SectionNav, { type SectionNavItem } from '@/components/SectionNav';

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
    avatarUrl: string | null;
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
    type: string;
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
  /** Мнение дизайн-лида/стардиза, оставленное на форме оценки (markdown). */
  leadComment: string | null;
  /** Все опубликованные оценки этого дизайнера — для переключателя циклов. */
  siblings: {
    id: number;
    publishedAt: string | null;
    effectiveGrade: GradeCode | null;
    totalXp: number | null;
  }[];
};

export default function Portrait({
  data,
  breadcrumb,
  siblingHrefPrefix,
}: {
  data: PortraitData;
  breadcrumb?: { href: string; label: string };
  /** Префикс URL для переключателя циклов. К нему прицепляется id, чтобы
   *  получился готовый href. Сервер не умеет сериализовать функции в
   *  client-компоненты, поэтому передаём строку.
   *  Пример: `/designer?assessmentId=` → `/designer?assessmentId=42`. */
  siblingHrefPrefix: string;
}) {
  const [rowHovered, setRowHovered] = useState(false);

  // Список таксономий, по которым у дизайнера есть навыки — для меню
  // быстрой навигации внизу. Порядок фиксированный.
  const presentTaxonomies = useMemo(
    () => TAXONOMY_ORDER.filter((code) => data.skills.some((s) => s.taxonomyCode === code)),
    [data.skills],
  );

  const navSections: SectionNavItem[] = useMemo(
    () => [
      { id: 'stats', label: 'Статистика' },
      ...presentTaxonomies.map((code) => ({ id: `tax-${code}`, label: code })),
    ],
    [presentTaxonomies],
  );

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
        // Светло-серая заливка под пунктиром, чтобы силуэт «потолка»
        // читался без необходимости упирать взгляд в линию.
        backgroundColor: 'rgba(200, 197, 187, 0.2)',
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
    <main className="max-w-[1400px] mx-auto px-8 pt-8 pb-16">
      {breadcrumb && (
        <div className="text-xs text-stone mb-3">
          <Link href={breadcrumb.href} className="hover:text-ink transition-colors">
            {breadcrumb.label}
          </Link>
          <span className="text-ash mx-1.5">/</span>
          <span>{data.designer.fullName}</span>
        </div>
      )}
      {/* Hero: аватар слева от имени и мета-инфо */}
      <div className="mb-6 flex items-center gap-4">
        <Avatar
          name={data.designer.fullName}
          avatarUrl={data.designer.avatarUrl}
          size={64}
        />
        <div className="min-w-0">
          <h1 className="font-display text-4xl font-semibold tracking-tight mb-2">
            {data.designer.fullName}
          </h1>
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Дата грейдирования — первым чипом, чёрная: ключевая
                метка «когда зафиксирован этот портрет». */}
            {data.publishedAt && (
              <span className="chip bg-ink text-snow">
                {new Date(data.publishedAt).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            )}
            {data.designer.buildCode && (
              <span className="chip-neutral">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background:
                      data.designer.buildCode === 'creator'
                        ? '#00ca48'
                        : data.designer.buildCode === 'visioner'
                          ? '#7c3aed'
                          : '#0ea5e9',
                  }}
                />
                {data.designer.buildName}
              </span>
            )}
            {data.designer.department && (
              <span className="chip-neutral">{data.designer.department}</span>
            )}
            {data.designer.leadName && (
              <span className="chip-neutral">Лид: {data.designer.leadName}</span>
            )}
          </div>
        </div>
      </div>

      {/* Переключатель циклов — inline в шапке (floating-копию убрали в
          пользу SectionNav). */}
      {data.siblings.length > 1 && (
        <div className="mb-6">
          <CyclesSwitcher
            siblings={data.siblings}
            currentId={data.assessmentId}
            hrefPrefix={siblingHrefPrefix}
          />
        </div>
      )}

      {/* === Статистика: grade-card, taxonomy-cards, radar, next-gate === */}
      <section id="stats" className="scroll-mt-24">

      {/* Grade card */}
      <div className="card p-7 mb-6">
        <div className="grid grid-cols-[auto_1fr] gap-10 items-end">
          <div>
            <div className="text-[11px]  text-stone mb-2">
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
              <span className="text-[11px]  text-stone">
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
                <div className="text-[11px]  text-stone mb-1.5">
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
            <div className="text-[11px]  text-stone mb-4">
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
                    <span className="text-[11px]  text-stone">
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
            <span className="w-2.5 h-2.5 rounded-sm border border-dashed border-ash bg-ash/20" />
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
              <div className="text-[11px]  text-stone mb-2">
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

      </section>
      {/* /Статистика */}

      {/* Мнение дизайн-лида / стардиза — аналог CDO-блока у лидов.
          Pavel попросил вывести его ПЕРЕД блоком «Навыки», чтобы дизайнер
          сначала видел человеческий контекст, потом разбор по навыкам. */}
      {data.leadComment && (
        <section className="card mb-6 overflow-hidden">
          <div className="px-6 py-4 border-b border-cloud bg-canvas/30 flex items-center gap-3">
            <span className="chip-build shrink-0">Лид</span>
            <h3 className="text-base font-semibold text-ink leading-tight">
              Мнение дизайн-лида / стардиза
            </h3>
          </div>
          <div className="px-6 py-5">
            <MarkdownContent text={data.leadComment} />
          </div>
        </section>
      )}

      {/* Skills grouped — accordions, стиль как у формы оценки */}
      <div className="space-y-5">
        <h2 className="font-display text-2xl font-semibold tracking-tight">Навыки</h2>
        {TAXONOMY_ORDER.filter((code) => grouped.has(code)).map((code) => {
          const taxMap = grouped.get(code)!;
          const taxName =
            data.skills.find((s) => s.taxonomyCode === code)?.taxonomyName ?? code;
          const taxXp = data.xpByTaxonomy[code] ?? 0;
          return (
            <section
              key={code}
              id={`tax-${code}`}
              className="card overflow-hidden scroll-mt-24"
            >
              <div className="px-6 py-3.5 border-b border-cloud bg-canvas/60 flex items-baseline justify-between">
                <div className="text-base font-semibold text-ink">{taxName}</div>
                <div className="text-xs text-stone tabular-nums">{taxXp} XP</div>
              </div>
              {Array.from(taxMap.entries()).map(([groupName, skills], gIdx) => (
                <div
                  key={groupName}
                  className={gIdx > 0 ? 'border-t border-cloud' : ''}
                >
                  <div className="px-6 pt-5 pb-2 text-sm font-medium text-stone">
                    {groupName}
                  </div>
                  {skills.map((s) => (
                    <SkillAccordion key={s.id} skill={s} />
                  ))}
                </div>
              ))}
            </section>
          );
        })}
      </div>

      {/* Sticky-навигация по разделам (заменила floating-свитчер циклов) */}
      <SectionNav sections={navSections} />
    </main>
  );
}

function CyclesSwitcher({
  siblings,
  currentId,
  hrefPrefix,
}: {
  siblings: PortraitData['siblings'];
  currentId: number;
  hrefPrefix: string;
}) {
  return (
    <div className="segmented">
      {siblings.map((s) => (
        <Link
          key={s.id}
          href={`${hrefPrefix}${s.id}`}
          className={`segmented-item whitespace-nowrap ${
            s.id === currentId ? 'segmented-item-active' : ''
          }`}
        >
          {s.publishedAt
            ? new Date(s.publishedAt).toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'short',
                year: '2-digit',
              })
            : `#${s.id}`}
        </Link>
      ))}
    </div>
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
                <span className="text-stone ml-1 tabular-nums">{pct}%</span>
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
    type: string;
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
  const earnedXp = skill.masteryLevel * skill.weight;
  const maxXp = skill.maxMasteryLevel * skill.weight;

  return (
    <article className="px-6 py-4 border-b border-cloud last:border-b-0">
      {/* Header row: clickable — компактный вид по варианту B Pavel'a:
          имя · текущий уровень-чип · XP earned/max · шеврон.
          CORE/SEC и вес уехали внутрь раскрытого блока. */}
      <button
        type="button"
        onClick={() => hasContent && setOpen((v) => !v)}
        disabled={!hasContent}
        className="w-full flex items-center gap-3 text-left disabled:cursor-default"
      >
        <span className="font-medium text-sm flex-1 min-w-0 truncate">
          {skill.name}
        </span>
        {skill.masteryLevel > 0 && skill.levelTitle ? (
          <span className="chip-neutral shrink-0">{skill.levelTitle}</span>
        ) : (
          <span className="chip-neutral shrink-0 text-ash">Не оценено</span>
        )}
        <span className="text-xs text-stone tabular-nums shrink-0 w-12 text-right">
          {earnedXp} / {maxXp}
        </span>
        {hasContent && (
          <ChevronDownIcon
            className={`w-3.5 h-3.5 text-ash transition-transform duration-150 shrink-0 ${
              open ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>

      {/* Раскрытое: мета (CORE/вес) + описание + radio-список уровней */}
      {open && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-stone">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-pill tracking-wide font-medium ${
                skill.type === 'CORE' ? 'bg-ink text-snow' : 'bg-cloud/60 text-stone'
              }`}
            >
              {skill.type}
            </span>
            <span>{skill.weight} вес</span>
          </div>
          {skill.description && (
            <div className="text-sm text-stone leading-relaxed">
              {skill.description}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {skill.levels.map((lvl) => {
              const selected = lvl.level === skill.masteryLevel;
              return (
                <div
                  key={lvl.level}
                  className={`flex items-start gap-3 p-4 rounded-card border ${
                    selected
                      ? 'border-ink bg-canvas/60'
                      : 'border-cloud bg-snow'
                  }`}
                >
                  <span
                    className={`shrink-0 w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center ${
                      selected ? 'border-ink' : 'border-ash'
                    }`}
                  >
                    {selected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-ink" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink leading-snug">
                      {lvl.title}
                    </div>
                    {lvl.criteria && (
                      <div className="text-xs text-stone leading-relaxed mt-1 whitespace-pre-line">
                        {lvl.criteria}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-xs text-stone tabular-nums self-start mt-0.5">
                    {lvl.level * skill.weight}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
}
