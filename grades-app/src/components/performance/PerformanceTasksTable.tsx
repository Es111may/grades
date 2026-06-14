'use client';

/**
 * Таблица детальных задач. React-порт `TimeManageTasksTable.vue` без QA-колонок
 * (для дизайна неактуально) и без ресайза столбцов (Pavel'у не критично, а
 * код был большой и узко-специфичный).
 *
 * Колонки сортируемые по клику на заголовок. Цветовая ячейка для pushRatio
 * подсвечивается по уровню оверпуша — совпадает с тегами level в данных.
 */

import { useMemo, useState } from 'react';
import {
  formatDecimal,
  formatFraction,
  formatHoursToTime,
  getPushRatioStyle,
} from '@/lib/performanceAggregation';
import type { TaskDetail } from '@/lib/clickhousePerf';

type SortKey = keyof TaskDetail;
type SortDir = 'asc' | 'desc';

interface ColumnDef {
  key: SortKey;
  label: string;
  render?: (t: TaskDetail) => React.ReactNode;
}

const COLUMNS: ColumnDef[] = [
  { key: 'quarter', label: 'Период' },
  {
    key: 'source',
    label: 'Источник',
    render: (t) => (
      <span className={t.source === 'tracker' ? 'font-medium text-ink' : 'text-stone'}>
        {t.source === 'tracker' ? 'Трекер' : 'Collab'}
      </span>
    ),
  },
  { key: 'projectName', label: 'Проект' },
  {
    key: 'taskName',
    label: 'Задача',
    render: (t) => (
      <a
        href={taskLink(t)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-ink hover:underline"
      >
        {t.taskName}
      </a>
    ),
  },
  { key: 'taskCreatedOn', label: 'Создана' },
  {
    key: 'estimate',
    label: 'Эстимейт',
    render: (t) =>
      t.estimate === 0 ? (
        <span className="text-blaze font-medium">Не задан</span>
      ) : (
        formatHoursToTime(t.estimate)
      ),
  },
  {
    key: 'pushedByDev',
    label: 'Запушено',
    render: (t) => formatHoursToTime(t.pushedByDev),
  },
  { key: 'devTime', label: 'Разработка', render: (t) => formatHoursToTime(t.devTime) },
  {
    key: 'reworkTime',
    label: 'Доработка',
    render: (t) => formatHoursToTime(t.reworkTime),
  },
  {
    key: 'overpushHours',
    label: 'Превышение',
    render: (t) => formatHoursToTime(t.overpushHours),
  },
  {
    key: 'pushRatio',
    label: '% от эстимейта',
    render: (t) => (
      <span
        className="inline-block px-2 py-0.5 rounded-pill text-[11px] font-medium"
        style={getPushRatioStyle(t.pushRatio)}
      >
        {formatDecimal(t.pushRatio)}%
      </span>
    ),
  },
  {
    key: 'devContribution',
    label: 'Вклад в задачу',
    render: (t) => formatFraction(t.devContribution),
  },
  {
    key: 'totalTeamPush',
    label: 'Пуши команды',
    render: (t) => formatHoursToTime(t.totalTeamPush),
  },
];

function taskLink(t: TaskDetail): string {
  if (t.source === 'tracker' && t.taskKey) {
    return `https://tracker.yandex.ru/${t.taskKey}`;
  }
  return `https://collab.idaproject.com/projects/${t.projectId}/tasks/${t.taskId}`;
}

export default function PerformanceTasksTable({ tasks }: { tasks: TaskDetail[] }) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo<TaskDetail[]>(() => {
    if (!sortKey) return tasks;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...tasks].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va ?? '').localeCompare(String(vb ?? '')) * dir;
    });
  }, [tasks, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  if (tasks.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-stone italic">
        Нет задач по выбранным фильтрам.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-card border border-cloud">
      <table className="w-full text-xs tabular-nums">
        <thead className="bg-canvas">
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                onClick={() => toggleSort(c.key)}
                className={`px-3 py-2 text-left text-[11px] font-medium whitespace-nowrap cursor-pointer select-none transition-colors ${
                  sortKey === c.key ? 'text-ink' : 'text-stone hover:text-ink'
                }`}
              >
                {c.label}
                {sortKey === c.key && (
                  <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr
              key={`${t.source}-${t.projectId}-${t.taskId}`}
              className="border-t border-cloud hover:bg-canvas/40 transition-colors"
            >
              {COLUMNS.map((c) => (
                <td key={c.key} className="px-3 py-2 text-ink whitespace-nowrap">
                  {c.render ? c.render(t) : String(t[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
