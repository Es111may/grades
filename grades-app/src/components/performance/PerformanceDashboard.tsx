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

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon } from '@/components/icons';
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
  // Первая опция называется «Дата» по запросу Pavel'a — это и приглашение
  // «выбери», и «все периоды» одновременно. value='' сбрасывает фильтр.
  const periodOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of filteredTasks) {
      const key = periodType === 'quarter' ? t.quarter : t.lastPeriodMonth;
      if (key) set.add(key);
    }
    const list = [...set].sort().reverse();
    return [{ label: 'Дата', value: '' }, ...list.map((v) => ({ label: v, value: v }))];
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
        {/* Период (тип + значение) + фильтры слева, табы Сводка/Задачи —
            справа той же строкой (по запросу Pavel'a). Все контролы
            одной высоты h-9. */}
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

          {/* Дропдаун периода. appearance-none убирает родную стрелку
              браузера (её отступы были кривые), своя ChevronDownIcon
              справа абсолютным позиционированием. */}
          <div className="relative">
            <select
              value={periodValue}
              onChange={(e) => setPeriodValue(e.target.value)}
              className="appearance-none bg-snow border border-cloud rounded-card
                         h-9 pl-3 pr-8 text-xs text-ink
                         focus:outline-none focus:border-sky focus:ring-4 focus:ring-sky/15
                         disabled:opacity-50 max-w-[180px]"
              disabled={state !== 'ready'}
            >
              {periodOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone pointer-events-none"
            />
          </div>

          <FiltersPopover
            filters={filters}
            defaults={DEFAULT_FILTERS}
            onChange={setFilters}
          />

          {/* Табы — в правую часть той же строки */}
          {state === 'ready' && periods.length > 0 && (
            <div className="ml-auto">
              <Segment
                value={activeTab}
                options={[
                  { label: 'Сводка', value: 'summary' },
                  { label: 'Задачи', value: 'tasks' },
                ]}
                onChange={(v) => setActiveTab(v as 'summary' | 'tasks')}
              />
            </div>
          )}
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
    <label className="flex items-center gap-2.5 cursor-pointer select-none py-1.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-cloud accent-ink focus:ring-ink/30 shrink-0"
      />
      <span className="text-ink">{label}</span>
    </label>
  );
}

/**
 * Кнопка «Фильтры» с поповером — заменила распахнутый ряд чекбоксов.
 * Pavel: «спрячь все чекбоксы в дропдаун». Кнопка показывает счётчик
 * активных фильтров (N/Всего). Содержимое — те же чекбоксы, теперь
 * вертикально, с разделением «Что считаем» / «Источники».
 *
 * Закрытие — по клику вне поповера. Esc намеренно не вешаю — фильтры
 * правятся редко, лишняя клавиатурная логика тут не нужна.
 */
function FiltersPopover({
  filters,
  defaults,
  onChange,
}: {
  filters: FiltersState;
  defaults: FiltersState;
  onChange: (next: FiltersState) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Счётчик включённых фильтров. По умолчанию 5/5; если что-то снято —
  // показываем «(3/5)» — сразу видно, что выборка нестандартная.
  const total = Object.keys(filters).length;
  const active = Object.values(filters).filter(Boolean).length;
  const isDefault =
    filters.hasEstimate === defaults.hasEstimate &&
    filters.completedOnly === defaults.completedOnly &&
    filters.workedHardOnly === defaults.workedHardOnly &&
    filters.showCollab === defaults.showCollab &&
    filters.showTracker === defaults.showTracker;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 bg-snow border rounded-card
                    h-9 px-3 text-xs text-ink transition-colors
                    hover:border-ash focus:outline-none focus:border-sky
                    focus:ring-4 focus:ring-sky/15
                    ${open ? 'border-ash' : 'border-cloud'}`}
      >
        <span>Фильтры</span>
        <span className={`tabular-nums ${isDefault ? 'text-stone' : 'text-ink font-semibold'}`}>
          {active}/{total}
        </span>
        <ChevronDownIcon
          className={`w-3 h-3 text-stone transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-2 z-20 w-[280px]
                     bg-snow border border-cloud rounded-card shadow-soft
                     p-3 space-y-3"
        >
          <div>
            <div className="text-[10px] font-medium text-stone mb-1">
              Какие задачи учитывать
            </div>
            <div className="space-y-0.5">
              <Checkbox
                label="Только с эстимейтом"
                checked={filters.hasEstimate}
                onChange={(v) => onChange({ ...filters, hasEstimate: v })}
              />
              <Checkbox
                label="Только завершённые задачи"
                checked={filters.completedOnly}
                onChange={(v) => onChange({ ...filters, completedOnly: v })}
              />
              <Checkbox
                label="Только где участвовал более 50%"
                checked={filters.workedHardOnly}
                onChange={(v) => onChange({ ...filters, workedHardOnly: v })}
              />
            </div>
          </div>

          <div className="border-t border-cloud pt-3">
            <div className="text-[10px] font-medium text-stone mb-1">
              Источники
            </div>
            <div className="space-y-0.5">
              <Checkbox
                label="Задачи из ActiveCollab"
                checked={filters.showCollab}
                onChange={(v) => onChange({ ...filters, showCollab: v })}
              />
              <Checkbox
                label="Задачи из ЯТ"
                checked={filters.showTracker}
                onChange={(v) => onChange({ ...filters, showTracker: v })}
              />
            </div>
          </div>

          {!isDefault && (
            <button
              type="button"
              onClick={() => onChange(defaults)}
              className="w-full text-xs text-stone hover:text-ink transition-colors
                         border-t border-cloud pt-2.5 text-left"
            >
              Сбросить к эталонной выборке
            </button>
          )}
        </div>
      )}
    </div>
  );
}
