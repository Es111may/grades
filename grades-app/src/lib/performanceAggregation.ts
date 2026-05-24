/**
 * Агрегация задач в сводки по периодам (квартал / месяц).
 *
 * TS-порт `frontend/composables/useTimeManageAggregation.ts` из ida.team.
 * Чистая логика — никаких React-зависимостей, можно использовать и в API,
 * и в компоненте, и в тестах.
 */

import type { TaskDetail } from './clickhousePerf';

export type PeriodType = 'quarter' | 'month';

export interface GradeDistribution {
  /** ≤ 10% — «в срок» */
  onTime: number;
  /** > 10% и ≤ 20% */
  overPush10: number;
  /** > 20% и ≤ 30% */
  overPush20: number;
  /** > 30% и ≤ 40% */
  overPush30: number;
  /** > 40% и ≤ 50% */
  overPush40: number;
  /** > 50% */
  overPushAbove40: number;
}

export interface PeriodSummary {
  period: string;
  /** 0..1 — доля задач, не превысивших эстимейт. */
  efficiency: number;
  /** Медиана отношения факт/эстимейт. 1.0 ≈ ровно по эстимейту. */
  medianPushRatio: number;
  totalPushedHours: number;
  totalOverpushHours: number;
  qaIterationsTotal: number;
  qaTimeTotal: number;
  /** Доля задач с pushRatio ≤ 10% (0..100). */
  onTimePercentage: number;
  gradeDistribution: GradeDistribution;
  /** Прирост efficiency относительно предыдущего периода в процентах. null для первого/нет данных. */
  efficiencyImprovement: number | null;
}

// ============================================================
// Внутренние утилиты
// ============================================================

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function gradeDistribution(pushRatios: number[], total: number): GradeDistribution {
  if (total === 0) {
    return {
      onTime: 0,
      overPush10: 0,
      overPush20: 0,
      overPush30: 0,
      overPush40: 0,
      overPushAbove40: 0,
    };
  }
  const pct = (count: number) => Math.round((count / total) * 10000) / 100;
  return {
    onTime: pct(pushRatios.filter((r) => r <= 10).length),
    overPush10: pct(pushRatios.filter((r) => r > 10 && r <= 20).length),
    overPush20: pct(pushRatios.filter((r) => r > 20 && r <= 30).length),
    overPush30: pct(pushRatios.filter((r) => r > 30 && r <= 40).length),
    overPush40: pct(pushRatios.filter((r) => r > 40 && r <= 50).length),
    overPushAbove40: pct(pushRatios.filter((r) => r > 50).length),
  };
}

function aggregatePeriod(period: string, tasks: TaskDetail[]): PeriodSummary {
  const totalPushedHours = tasks.reduce((s, t) => s + t.pushedByDev, 0);
  const totalOverpushHours = tasks.reduce((s, t) => s + t.overpushHours, 0);
  const pushRatios = tasks.map((t) => t.pushRatio);

  // Медиана коэффициента факт/эстимейт — только по задачам с эстимейтом > 0.
  const actualToEstimate = tasks
    .filter((t) => t.estimate > 0)
    .map((t) => t.pushedByDev / t.estimate);
  const medianPushRatio = median(actualToEstimate);
  const efficiency =
    totalPushedHours > 0 ? 1 - totalOverpushHours / totalPushedHours : 0;
  const total = tasks.length;
  const onTimePercentage =
    total > 0
      ? Math.round((pushRatios.filter((r) => r <= 10).length / total) * 10000) / 100
      : 0;

  return {
    period,
    efficiency: round2(efficiency),
    medianPushRatio: round2(medianPushRatio),
    totalPushedHours: round2(totalPushedHours),
    totalOverpushHours: round2(totalOverpushHours),
    qaIterationsTotal: Math.round(tasks.reduce((s, t) => s + t.qaIterations, 0)),
    qaTimeTotal: round2(tasks.reduce((s, t) => s + t.qaTime, 0)),
    onTimePercentage,
    gradeDistribution: gradeDistribution(pushRatios, total),
    efficiencyImprovement: null,
  };
}

// ============================================================
// Публичная функция
// ============================================================

/**
 * Группирует задачи по периоду (квартал или месяц), агрегирует метрики
 * и считает прирост КПД относительно предыдущего периода.
 *
 * Периоды отсортированы по убыванию (новые сверху) — то же поведение,
 * что у ida.team.
 */
export function aggregateByPeriod(
  tasks: TaskDetail[],
  periodType: PeriodType,
): PeriodSummary[] {
  if (tasks.length === 0) return [];

  const map = new Map<string, TaskDetail[]>();
  for (const t of tasks) {
    const key = periodType === 'month' ? t.lastPeriodMonth : t.quarter;
    if (!key) continue;
    const arr = map.get(key) ?? [];
    arr.push(t);
    map.set(key, arr);
  }

  const summaries: PeriodSummary[] = [];
  for (const [period, items] of map) {
    summaries.push(aggregatePeriod(period, items));
  }
  summaries.sort((a, b) => b.period.localeCompare(a.period));

  // Прирост КПД относительно предыдущего периода (для каждого, кроме самого
  // старого). Периоды отсортированы по убыванию, поэтому предыдущий = i + 1.
  for (let i = 0; i < summaries.length; i++) {
    const prev = summaries[i + 1];
    if (prev && prev.efficiency > 0) {
      summaries[i].efficiencyImprovement =
        Math.round(
          ((summaries[i].efficiency - prev.efficiency) / prev.efficiency) * 10000,
        ) / 100;
    }
  }

  return summaries;
}

// ============================================================
// Форматирование (общие хелперы для UI-компонентов)
// ============================================================

/** `11.083` → `11:05:00` */
export function formatHoursToTime(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 60) return `${h + 1}:00:00`;
  return `${h}:${String(m).padStart(2, '0')}:00`;
}

/** 0.4567 → `45.7%` */
export function formatFraction(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** 3.14159 → `3.1` */
export function formatDecimal(value: number): string {
  return value.toFixed(1);
}

/** Цветовой бэйдж под `pushRatio` (по уровням оверпуша). */
export function getPushRatioStyle(pushRatio: number): {
  background: string;
  color: string;
} {
  // Совпадает с PUSH_RATIO_LEVELS из time-manage-tasks-table.ts ida.team.
  if (pushRatio <= 10) return { background: '#22c55e', color: '#0a3a1a' };
  if (pushRatio <= 20) return { background: '#86efac', color: '#0a3a1a' };
  if (pushRatio <= 30) return { background: '#fbbf24', color: '#3a2a00' };
  if (pushRatio <= 40) return { background: '#f97316', color: '#fff' };
  return { background: '#ef4444', color: '#fff' };
}
