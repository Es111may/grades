'use client';

/**
 * Таблица-сводка по периодам.
 *
 * React-порт `TimeManageDataTable.vue` из ida.team — без QA-колонок,
 * потому что у дизайнеров их нет (см. SQL — qa_* всегда 0 для design).
 *
 * Цветовой стиль — светлая карточка под общую палитру Грейдов, не тёмная
 * как в оригинале на ida.team. По остальным метрикам и формулам — 1-в-1.
 */

import {
  formatDecimal,
  formatFraction,
  formatHoursToTime,
  type PeriodSummary,
  type PeriodType,
} from '@/lib/performanceAggregation';

export default function PerformanceSummaryTable({
  periods,
  periodType,
}: {
  periods: PeriodSummary[];
  periodType: PeriodType;
}) {
  const periodColumn = periodType === 'quarter' ? 'Квартал' : 'Месяц';

  return (
    <div className="overflow-x-auto rounded-card border border-cloud">
      <table className="w-full text-xs tabular-nums">
        <thead className="bg-canvas">
          <tr>
            <Th>{periodColumn}</Th>
            <Th>Коэф. попадания в срок</Th>
            <Th>Затрекано часов</Th>
            <Th>Оверпуш часы</Th>
            <Th>КПД</Th>
            <Th>В срок</Th>
            <Th>≤10%</Th>
            <Th>≤20%</Th>
            <Th>≤30%</Th>
            <Th>≤40%</Th>
            <Th>&gt;40%</Th>
            <Th>Улучшение КПД</Th>
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr
              key={p.period}
              className="border-t border-cloud hover:bg-canvas/40 transition-colors"
            >
              <Td>{p.period}</Td>
              <Td>{p.medianPushRatio.toFixed(2)}</Td>
              <Td>{formatHoursToTime(p.totalPushedHours)}</Td>
              <Td>{formatHoursToTime(p.totalOverpushHours)}</Td>
              <Td>{formatFraction(p.efficiency)}</Td>
              <Td>{formatDecimal(p.onTimePercentage)}%</Td>
              <Td>{p.gradeDistribution.overPush10}</Td>
              <Td>{p.gradeDistribution.overPush20}</Td>
              <Td>{p.gradeDistribution.overPush30}</Td>
              <Td>{p.gradeDistribution.overPush40}</Td>
              <Td>{p.gradeDistribution.overPushAbove40}</Td>
              <Td>
                <ImprovementCell value={p.efficiencyImprovement} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="label-mono px-3 py-2 text-left text-[11px] text-stone whitespace-nowrap">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-2 text-ink whitespace-nowrap">{children}</td>
  );
}

function ImprovementCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-ash">—</span>;
  const sign = value > 0 ? '+' : '';
  const cls =
    value > 0 ? 'text-emerald font-medium' : value < 0 ? 'text-blaze font-medium' : '';
  return <span className={cls}>{`${sign}${value.toFixed(1)}%`}</span>;
}
