'use client';

/**
 * Графики по периодам:
 *   - КПД (Line, 0..1)
 *   - В срок (Line, %)
 *   - Оверпуш часы (Line)
 *   - Распределение по бакетам оверпуша (stacked Bar)
 *
 * React-порт `TimeManageCharts.vue` + четырёх дочерних чартов из ida.team.
 * Используем chart.js + react-chartjs-2, которые уже подключены в проекте
 * под radar-диаграмму портрета.
 *
 * QA-чарт намеренно пропущен — у дизайнеров QA-данных нет.
 */

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  type ChartOptions,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { InfoIcon } from '@/components/icons';
// Импорт переименован в InfoTooltip, чтобы не конфликтовать с
// chart.js'овским Tooltip (он регистрируется как plugin).
import InfoTooltip from '@/components/Tooltip';
import type { PeriodSummary } from '@/lib/performanceAggregation';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

export default function PerformanceCharts({ periods }: { periods: PeriodSummary[] }) {
  // На графиках хронологический порядок (старые слева) — наоборот таблице.
  const chronological = useMemo(() => [...periods].reverse(), [periods]);
  const labels = chronological.map((p) => p.period);
  // Распределение перформанса — горизонтальный бар по последним 5 периодам.
  // Старые периоды в самом верху, новые внизу — естественный «лестничный»
  // порядок чтения сверху-вниз.
  const distributionPeriods = useMemo(() => chronological.slice(-5), [chronological]);
  const distributionLabels = distributionPeriods.map((p) => p.period);

  // ---------------- КПД ----------------
  const efficiencyData = {
    labels,
    datasets: [
      {
        label: 'КПД',
        data: chronological.map((p) => p.efficiency),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.12)',
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: '#22c55e',
        tension: 0.3,
      },
    ],
  };
  const efficiencyOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        min: 0,
        max: 1,
        ticks: { stepSize: 0.2 },
      },
    },
  };

  // ---------------- В срок (%) ----------------
  const onTimeData = {
    labels,
    datasets: [
      {
        label: 'В срок, %',
        data: chronological.map((p) => p.onTimePercentage),
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14,165,233,0.12)',
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: '#0ea5e9',
        tension: 0.3,
      },
    ],
  };
  const onTimeOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        min: 0,
        max: 100,
        ticks: { callback: (v) => `${v}%` },
      },
    },
  };

  // ---------------- Оверпуш часы ----------------
  const overpushData = {
    labels,
    datasets: [
      {
        label: 'Оверпуш, ч',
        data: chronological.map((p) => p.totalOverpushHours),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.12)',
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: '#ef4444',
        tension: 0.3,
      },
    ],
  };
  const overpushOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
  };

  // ---------------- Распределение перформанса (horizontal stacked Bar) ----------------
  // По запросу Pavel'a: горизонтально, максимум 5 кварталов, новое название.
  const gradeData = {
    labels: distributionLabels,
    datasets: [
      {
        label: 'В срок',
        data: distributionPeriods.map((p) => p.gradeDistribution.onTime),
        backgroundColor: '#22c55e',
        stack: 'grade',
      },
      {
        label: '≤10%',
        data: distributionPeriods.map((p) => p.gradeDistribution.overPush10),
        backgroundColor: '#86efac',
        stack: 'grade',
      },
      {
        label: '≤20%',
        data: distributionPeriods.map((p) => p.gradeDistribution.overPush20),
        backgroundColor: '#fbbf24',
        stack: 'grade',
      },
      {
        label: '≤30%',
        data: distributionPeriods.map((p) => p.gradeDistribution.overPush30),
        backgroundColor: '#f97316',
        stack: 'grade',
      },
      {
        label: '≤40%',
        data: distributionPeriods.map((p) => p.gradeDistribution.overPush40),
        backgroundColor: '#fb7185',
        stack: 'grade',
      },
      {
        label: '>40%',
        data: distributionPeriods.map((p) => p.gradeDistribution.overPushAbove40),
        backgroundColor: '#ef4444',
        stack: 'grade',
      },
    ],
  };
  const gradeOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y' as const, // ← горизонтальный bar
    plugins: { legend: { position: 'bottom' as const, labels: { boxWidth: 12 } } },
    scales: {
      x: {
        stacked: true,
        min: 0,
        max: 100,
        ticks: { callback: (v) => `${v}%` },
      },
      y: { stacked: true },
    },
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard
          title="КПД"
          hint="Доля задач без оверпуша. Чем ближе к 1, тем точнее ты попадаешь в эстимейт."
          info="КПД = эстимейт ÷ факт, медиана по задачам периода. Показывает, насколько точно ты укладываешься в свои оценки. 1 — задача закрыта ровно по эстимейту, ниже 1 — есть оверпуш. Считается по тем же задачам, что и «% в срок»."
        >
          <Line data={efficiencyData} options={efficiencyOptions} />
        </ChartCard>

        <ChartCard
          title="В срок"
          hint="% задач, где оверпуш не больше 10%. Цель — 85% и выше."
          info="Главная метрика перформанса. Считается так: задача «в срок», если факт превысил эстимейт не больше чем на 10%. Берётся доля таких задач от всех задач периода в %."
        >
          <Line data={onTimeData} options={onTimeOptions} />
        </ChartCard>
      </div>

      <ChartCard
        title="Оверпуш в часах"
        hint="Сумма часов сверх эстимейта по всем задачам периода. Чем меньше — тем лучше."
        info="Сумма часов, потраченных сверх эстимейта, по всем учитываемым задачам периода (факт − эстимейт, только для задач с превышением). Помогает понять масштаб переработки в часах, а не в процентах."
      >
        <Line data={overpushData} options={overpushOptions} />
      </ChartCard>

      <ChartCard
        title="Распределение перформанса"
        hint="Объём попадания в эстимейт или его превышения по последним 5 периодам."
        info="Каждая полоса — один период. Зелёный сегмент — задачи в срок (оверпуш ≤ 10%). Дальше идут корзины оверпуша по 10% шагу. Красный = >40%."
      >
        <Bar data={gradeData} options={gradeOptions} />
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  hint,
  info,
  children,
}: {
  title: string;
  hint?: string;
  /** Расширенный текст для информера ⓘ — раскрывается при hover. */
  info?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-cloud bg-snow p-4">
      <div className="mb-2">
        <div className="flex items-center gap-1.5">
          <div className="text-sm font-semibold text-ink">{title}</div>
          {info && (
            <InfoTooltip text={info}>
              <span className="text-ash hover:text-stone cursor-help transition-colors">
                <InfoIcon className="w-3.5 h-3.5" />
              </span>
            </InfoTooltip>
          )}
        </div>
        {hint && <div className="text-[11px] text-stone mt-0.5">{hint}</div>}
      </div>
      <div className="relative h-[240px]">{children}</div>
    </div>
  );
}
