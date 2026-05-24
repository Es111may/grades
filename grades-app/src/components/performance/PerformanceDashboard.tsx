'use client';

/**
 * Дашборд «Мой перформанс» на портрете дизайнера.
 *
 * React-порт `ProfilePerformanceDashboard.vue` из ida.team. Логика и
 * фильтры — те же, только под направление `design` (другие направления
 * Грейдам не нужны).
 *
 * Что показывает:
 *   - переключатель квартал / месяц + выбор конкретного периода (опц.)
 *   - чекбоксы фильтров (по умолчанию все включены)
 *   - таблицу-сводку по периодам
 *   - таблицу задач (вкладка «Задачи»)
 *
 * Данные подтягиваются лениво (после mount) через GET /api/performance/tasks.
 * Если ClickHouse недоступен — показываем дружелюбное сообщение и не
 * валим весь портрет.
 */

import { useEffect, useMemo, useState } from 'react';
import type { TaskDetail } from '@/lib/clickhousePerf';
import {
  aggregateByPeriod,
  type PeriodType,
  type PeriodSummary,
} from '@/lib/performanceAggregation';
import PerformanceSummaryTable from './PerformanceSummaryTable';
import PerformanceCharts from './PerformanceCharts';
import PerformanceTasksTable from './PerformanceTasksTable';

interface FiltersState {
  hasEstimate: boolean;
  completedOnly: boolean;
  workedHardOnly: boolean;
  showCollab: boolean;
  showTracker: boolean;
}

const DEFAULT_FILTERS: FiltersState = {
  hasEstimate: true,
  completedOnly: true,
  workedHardOnly: true,
  showCollab: true,
  showTracker: true,
};

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

export default function PerformanceDashboard({ userId }: { userId: number }) {
  const [tasks, setTasks] = useState<TaskDetail[] | null>(null);
  const [state, setState] = useState<LoadState>('idle');
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [periodType, setPeriodType] = useState<PeriodType>('quarter');
  const [periodValue, setPeriodValue] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'summary' | 'tasks'>('summary');

  // Фильтры hasEstimate/completedOnly/workedHardOnly уходят на сервер —
  // меняем их → перезагружаем. Остальные (showCollab/showTracker)
  // фильтруем клиентом, чтобы не дёргать ClickHouse зря.
  useEffect(() => {
    let cancelled = false;
    setState('loading');
    const url = new URL('/api/performance/tasks', window.location.origin);
    url.searchParams.set('userId', String(userId));
    url.searchParams.set('hasEstimate', filters.hasEstimate ? '1' : '0');
    url.searchParams.set('completedOnly', filters.completedOnly ? '1' : '0');
    url.searchParams.set('workedHardOnly', filters.workedHardOnly ? '1' : '0');

    fetch(url.toString())
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { tasks: TaskDetail[] }) => {
        if (cancelled) return;
        const list = data.tasks ?? [];
        setTasks(list);
        setState(list.length ? 'ready' : 'empty');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[PerformanceDashboard] fetch failed:', err);
        setTasks(null);
        setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [
    userId,
    filters.hasEstimate,
    filters.completedOnly,
    filters.workedHardOnly,
  ]);

  // Клиентская фильтрация по источникам.
  const filteredTasks = useMemo<TaskDetail[]>(() => {
    if (!tasks) return [];
    return tasks.filter((t) =>
      t.source === 'collab' ? filters.showCollab : filters.showTracker,
    );
  }, [tasks, filters.showCollab, filters.showTracker]);

  // Дополнительная фильтрация по конкретному периоду (опц. «выбрать квартал»).
  const periodScopedTasks = useMemo<TaskDetail[]>(() => {
    if (!periodValue) return filteredTasks;
    const key = periodType === 'quarter' ? 'quarter' : 'lastPeriodMonth';
    return filteredTasks.filter((t) => t[key] === periodValue);
  }, [filteredTasks, periodValue, periodType]);

  const periods: PeriodSummary[] = useMemo(
    () => aggregateByPeriod(periodScopedTasks, periodType),
    [periodScopedTasks, periodType],
  );

  // Список доступных периодов — извлекаем из filteredTasks (без фильтра по
  // выбранному периоду — иначе после выбора список схлопнётся в одну точку).
  const periodOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of filteredTasks) {
      const key = periodType === 'quarter' ? t.quarter : t.lastPeriodMonth;
      if (key) set.add(key);
    }
    const list = [...set].sort().reverse();
    return [{ label: 'Все', value: '' }, ...list.map((v) => ({ label: v, value: v }))];
  }, [filteredTasks, periodType]);

  // ============================================================
  // UI
  // ============================================================

  return (
    <section className="card mb-6 overflow-hidden">
      <div className="px-6 py-4 border-b border-cloud bg-canvas/30">
        <h3 className="text-base font-semibold text-ink leading-tight">
          Перформанс
        </h3>
        <p className="text-xs text-stone mt-1.5 leading-relaxed">
          Твоя эффективность по задачам. Самое главное — % попадания в срок.
          Стремись к 85% и выше.{' '}
          <a
            href="https://buildin.ai/idaproject/28b054e2-8fd8-4ffd-b45a-8294ad44668b"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink underline underline-offset-2 hover:text-stone transition-colors"
          >
            Больше о технике тут
          </a>
        </p>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Период: тип + значение */}
        <div className="flex flex-wrap items-center gap-3">
          <Segment
            value={periodType}
            options={[
              { label: 'Квартал', value: 'quarter' },
              { label: 'Месяц', value: 'month' },
            ]}
            onChange={(v) => {
              setPeriodType(v as PeriodType);
              setPeriodValue('');
            }}
          />

          <select
            value={periodValue}
            onChange={(e) => setPeriodValue(e.target.value)}
            className="bg-snow border border-cloud rounded-pill px-3.5 py-1.5 text-xs text-ink
                       focus:outline-none focus:border-sky focus:ring-4 focus:ring-sky/15
                       disabled:opacity-50 min-w-[160px]"
            disabled={state !== 'ready'}
          >
            {periodOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Чекбоксы фильтров */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Checkbox
            label="Только с эстимейтом"
            checked={filters.hasEstimate}
            onChange={(v) => setFilters((f) => ({ ...f, hasEstimate: v }))}
          />
          <Checkbox
            label="Только завершённые задачи"
            checked={filters.completedOnly}
            onChange={(v) => setFilters((f) => ({ ...f, completedOnly: v }))}
          />
          <Checkbox
            label="Только где участвовал более 50%"
            checked={filters.workedHardOnly}
            onChange={(v) => setFilters((f) => ({ ...f, workedHardOnly: v }))}
          />
          <Checkbox
            label="Задачи из ActiveCollab"
            checked={filters.showCollab}
            onChange={(v) => setFilters((f) => ({ ...f, showCollab: v }))}
          />
          <Checkbox
            label="Задачи из ЯТ"
            checked={filters.showTracker}
            onChange={(v) => setFilters((f) => ({ ...f, showTracker: v }))}
          />
        </div>

        {/* Состояния */}
        {state === 'loading' && (
          <div className="py-12 text-center text-sm text-stone italic">
            Загрузка данных…
          </div>
        )}
        {state === 'error' && (
          <div className="py-12 text-center text-sm text-blaze">
            Не удалось загрузить данные перформанса. Возможно, ClickHouse
            недоступен — попробуй обновить страницу позже.
          </div>
        )}
        {state === 'empty' && (
          <div className="py-12 text-center text-sm text-stone italic">
            Нет задач, подходящих под выбранные фильтры.
          </div>
        )}

        {state === 'ready' && periods.length > 0 && (
          <>
            {/* Табы Сводка / Задачи */}
            <Segment
              value={activeTab}
              options={[
                { label: 'Сводка', value: 'summary' },
                { label: 'Задачи', value: 'tasks' },
              ]}
              onChange={(v) => setActiveTab(v as 'summary' | 'tasks')}
            />

            {activeTab === 'summary' && (
              <div className="space-y-6">
                <PerformanceSummaryTable periods={periods} periodType={periodType} />
                <PerformanceCharts periods={periods} />
              </div>
            )}

            {activeTab === 'tasks' && (
              <PerformanceTasksTable tasks={periodScopedTasks} />
            )}
          </>
        )}
      </div>
    </section>
  );
}

// ============================================================
// Локальные UI-кирпичики
// ============================================================

interface SegmentOption {
  label: string;
  value: string;
}

function Segment({
  value,
  options,
  onChange,
}: {
  value: string;
  options: SegmentOption[];
  onChange: (next: string) => void;
}) {
  // Используем общепроектный сегмент-контрол (.segmented в globals.css),
  // чтобы был единый стиль с переключателем «Все / Мои» и др.
  return (
    <div className="segmented">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`segmented-item ${active ? 'segmented-item-active' : ''}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  // accent-ink — родная Tailwind-утилита, красит галочку и фон чекбокса в
  // ink (тёмный), а не в синий по умолчанию (то, что просил Pavel).
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-cloud accent-ink focus:ring-ink/30"
      />
      <span className="text-ink">{label}</span>
    </label>
  );
}
