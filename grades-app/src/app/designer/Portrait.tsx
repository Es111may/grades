'use client';

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

const TAXONOMY_LABELS: Record<string, string> = {
  UI: 'UI · Визуал',
  UX: 'UX · Система',
  PRD: 'PRD · Продукт',
  IND: 'IND · Самостоятельность',
  RES: 'RES · Ответственность',
};
const TAXONOMY_ORDER = ['UI', 'UX', 'PRD', 'IND', 'RES'];

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
    taxonomyCode: string;
    taxonomyName: string;
    groupName: string;
    weight: number;
    masteryLevel: number;
    maxMasteryLevel: number;
    levelTitle: string | null;
  }[];
};

export default function Portrait({ data }: { data: PortraitData }) {
  const labels = TAXONOMY_ORDER.map((c) => TAXONOMY_LABELS[c] ?? c);
  // Normalized to percentage of max XP per taxonomy for fair comparison
  const dataValues = TAXONOMY_ORDER.map((code) => {
    const got = data.xpByTaxonomy[code] ?? 0;
    const max = data.maxXpByTaxonomy[code] ?? 0;
    return max > 0 ? Math.round((got / max) * 100) : 0;
  });

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Освоено, %',
        data: dataValues,
        backgroundColor: 'rgba(173, 233, 0, 0.2)',
        borderColor: '#ade900',
        borderWidth: 2,
        pointBackgroundColor: '#ade900',
        pointBorderColor: '#ade900',
        pointRadius: 4,
      },
    ],
  };

  const chartOptions = {
    scales: {
      r: {
        suggestedMin: 0,
        suggestedMax: 100,
        ticks: { stepSize: 20, color: '#86857f', backdropColor: 'transparent' },
        grid: { color: '#e5e3dc' },
        angleLines: { color: '#e5e3dc' },
        pointLabels: { font: { size: 13, family: 'Manrope' }, color: '#1a1a1a' },
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

  const xpProgress = data.maxXp > 0 ? Math.round((data.totalXp / data.maxXp) * 100) : 0;
  const isFloorActive =
    !!data.designer.gradeFloor &&
    data.calculatedGrade !== data.effectiveGrade;

  return (
    <main className="max-w-[1300px] mx-auto px-8 pt-12 pb-16">
      {/* Hero */}
      <div className="mb-10">
        <div className="text-xs uppercase tracking-widest text-stone mb-2">
          {data.publishedAt
            ? `Опубликовано ${new Date(data.publishedAt).toLocaleDateString('ru-RU')}`
            : 'Оценка'}
        </div>
        <h1 className="font-display text-5xl font-light tracking-tight mb-3">
          {data.designer.fullName}
        </h1>
        <div className="flex items-center gap-3 text-sm">
          {data.designer.buildCode && (
            <>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
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
              <span className="text-ash">·</span>
            </>
          )}
          <span className="text-stone">{data.designer.department ?? '—'}</span>
          {data.designer.leadName && (
            <>
              <span className="text-ash">·</span>
              <span className="text-stone">Лид: {data.designer.leadName}</span>
            </>
          )}
        </div>
      </div>

      {/* Top row: grade + radar */}
      <div className="grid grid-cols-[1fr_1.2fr] gap-6 mb-10">
        {/* Grade card */}
        <div className="bg-white border border-cloud rounded-card p-8 shadow-soft">
          <div className="text-xs uppercase tracking-widest text-stone mb-3">
            {isFloorActive ? 'Эффективный грейд' : 'Грейд'}
          </div>
          <div className="font-display text-7xl font-light tracking-tight mb-2">
            {GRADE_NAMES[data.effectiveGrade]}
          </div>
          {isFloorActive && (
            <div className="text-sm text-sunset mb-4">
              Зафиксирован (расчёт дал {GRADE_NAMES[data.calculatedGrade]})
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-cloud">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs uppercase tracking-widest text-stone">XP</span>
              <span className="font-display text-3xl">
                {data.totalXp}
                <span className="text-base text-stone"> / {data.maxXp}</span>
              </span>
            </div>
            <div className="h-2 bg-canvas rounded-full overflow-hidden">
              <div
                className="h-full bg-lime"
                style={{ width: `${Math.min(xpProgress, 100)}%` }}
              />
            </div>
            <div className="text-xs text-stone mt-1">{xpProgress}% от максимума</div>
          </div>
        </div>

        {/* Radar */}
        <div className="bg-white border border-cloud rounded-card p-8 shadow-soft">
          <div className="text-xs uppercase tracking-widest text-stone mb-3">
            Профиль по таксономиям
          </div>
          <div style={{ height: 320 }}>
            <Radar data={chartData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Next grade gates */}
      {data.nextGrade && (
        <div className="bg-white border border-cloud rounded-card p-7 shadow-soft mb-10">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="font-display text-2xl tracking-tight">
              До грейда «{GRADE_NAMES[data.nextGrade.code]}»
            </h2>
            {data.nextGrade.xpNeeded > 0 && (
              <span className="text-sm text-stone">
                ещё <strong className="text-ink">{data.nextGrade.xpNeeded} XP</strong>
              </span>
            )}
          </div>

          {data.nextGrade.failedGates.length === 0 && data.nextGrade.xpNeeded === 0 ? (
            <p className="text-sm text-stone">Все условия пройдены — но грейд ещё не назначен.</p>
          ) : data.nextGrade.failedGates.length === 0 ? (
            <p className="text-sm text-stone">Гейты пройдены, нужно добрать XP.</p>
          ) : (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-widest text-stone mb-3">
                Непройденные обязательные навыки
              </div>
              {data.nextGrade.failedGates.map((g) => (
                <div
                  key={g.skillId}
                  className="flex items-center justify-between py-2.5 px-4 bg-canvas rounded-md"
                >
                  <span className="text-sm">{g.skillName}</span>
                  <span className="text-xs text-stone">
                    освоено {g.currentMastery} / нужно {g.requiredMastery}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Skills grouped */}
      <div className="space-y-8">
        <h2 className="font-display text-3xl tracking-tight">Навыки</h2>
        {TAXONOMY_ORDER.filter((code) => grouped.has(code)).map((code) => {
          const taxMap = grouped.get(code)!;
          const taxName = data.skills.find((s) => s.taxonomyCode === code)?.taxonomyName ?? code;
          return (
            <div key={code}>
              <div className="flex items-baseline gap-3 mb-4">
                <h3 className="font-display text-xl">{taxName}</h3>
                <span className="text-xs uppercase tracking-widest text-stone">
                  {data.xpByTaxonomy[code] ?? 0} XP
                </span>
              </div>
              <div className="space-y-5">
                {Array.from(taxMap.entries()).map(([groupName, skills]) => (
                  <div
                    key={groupName}
                    className="bg-white border border-cloud rounded-card p-6 shadow-soft"
                  >
                    <div className="text-xs uppercase tracking-widest text-stone mb-3">
                      {groupName}
                    </div>
                    <div className="space-y-2">
                      {skills.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between py-2 border-b border-cloud last:border-0"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm">{s.name}</div>
                            {s.levelTitle && s.masteryLevel > 0 && (
                              <div className="text-xs text-stone mt-0.5">{s.levelTitle}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 ml-4">
                            <div className="flex gap-1">
                              {Array.from({ length: s.maxMasteryLevel }).map((_, i) => (
                                <div
                                  key={i}
                                  className={`w-2 h-2 rounded-full ${
                                    i < s.masteryLevel ? 'bg-lime' : 'bg-cloud'
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="text-xs text-stone w-12 text-right">
                              {s.masteryLevel * s.weight} XP
                            </span>
                          </div>
                        </div>
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
