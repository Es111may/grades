'use client';

// «Динамика по месяцам»: три панели с общей осью времени (ФОТ, численность,
// доля в ФОТ компании) вместо одной диаграммы с тремя осями Y — совмещение
// шкал выдумало бы корреляцию. Ховер синхронный, считывание — над панелями.
// Ряд начинается с TRACK_SINCE (январь 2025). Грузится лениво (chart.js).
//
// Глаз «Скрыть зарплаты» до canvas не дотягивается — подписи оси ФОТ
// прячем сами (useSalaryHidden), числа в считывании и таблице — через Money.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  type ChartOptions,
  type Plugin,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useSalaryHidden } from '@/components/Money';
import { CHART_AXIS, useTheme, type Theme } from '@/lib/theme';
import {
  fmtShare,
  MONTH_FULL,
  MONTH_GENITIVE,
  MONTH_SHORT,
  nf,
  plural,
  PEOPLE_FORMS,
  type MonthPoint,
} from '@/lib/economics';
import { Mln, SumK, useK } from './ui';

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Filler);

/** Ховер одного графика на все три панели — хранилище на экземпляр карточки. */
function createHoverStore() {
  let i: number | null = null;
  const charts = new Set<ChartJS>();
  const subs = new Set<() => void>();
  return {
    charts,
    get: () => i,
    set(next: number | null) {
      if (i === next) return;
      i = next;
      charts.forEach((c) => c.update('none'));
      subs.forEach((f) => f());
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
  };
}
type HoverStore = ReturnType<typeof createHoverStore>;

function cssRgba(name: string, a = 1) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(/\s+/).join(', ');
  return `rgba(${v}, ${a})`;
}

/** Перекрестие и подсветка периода «с 1 января». */
function makePlugin(store: HoverStore, theme: Theme, janIdx: number, label: boolean): Plugin<'line'> {
  return {
    id: 'econSync',
    afterInit(chart) {
      store.charts.add(chart as unknown as ChartJS);
    },
    afterDestroy(chart) {
      store.charts.delete(chart as unknown as ChartJS);
    },
    beforeDatasetsDraw(chart) {
      if (janIdx < 0) return;
      const { ctx, chartArea: a, scales } = chart;
      const x0 = scales.x.getPixelForValue(janIdx);
      ctx.save();
      ctx.fillStyle = theme === 'dark' ? 'rgba(255,255,255,0.035)' : 'rgba(17,24,39,0.035)';
      ctx.fillRect(x0, a.top, a.right - x0, a.bottom - a.top);
      if (label) {
        ctx.fillStyle = CHART_AXIS[theme].tick;
        ctx.font = "500 9.5px 'JetBrains Mono', ui-monospace, monospace";
        ctx.textBaseline = 'top';
        ctx.fillText('С 1 ЯНВАРЯ', x0 + 8, a.top + 6);
      }
      ctx.restore();
    },
    afterDatasetsDraw(chart) {
      const i = store.get();
      if (i == null) return;
      const { ctx, chartArea: a, scales } = chart;
      const x = Math.round(scales.x.getPixelForValue(i)) + 0.5;
      ctx.save();
      ctx.strokeStyle = theme === 'dark' ? 'rgba(255,255,255,0.28)' : 'rgba(17,24,39,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, a.top);
      ctx.lineTo(x, a.bottom);
      ctx.stroke();
      ctx.restore();
    },
  };
}

export default function MonthlyCard({ series, today }: { series: MonthPoint[]; today: string }) {
  const k = useK();
  const theme = useTheme();
  const hidden = useSalaryHidden();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const storeRef = useRef<HoverStore | null>(null);
  if (!storeRef.current) storeRef.current = createHoverStore();
  const store = storeRef.current;
  const hi = useSyncExternalStore(store.subscribe, store.get, () => null);
  const idx = hi ?? series.length - 1;
  const cur = series[Math.min(idx, series.length - 1)];
  const year = Number(today.slice(0, 4));
  // Точка «конец декабря прошлого года» — это и есть 1 января
  const janIdx = series.findIndex((m) => m.key === `${year - 1}-12`);
  const hasShare = series.some((m) => m.share != null);
  const first = series[0];

  const panels = useMemo(() => {
    const axis = CHART_AXIS[theme];
    const surface = cssRgba('--c-snow');
    const ink = cssRgba('--c-ink');
    const sky = cssRgba('--c-sky');
    const stone = cssRgba('--c-stone');
    const labels = series.map((m) => m.key);
    const tickLabel = (i: number) => {
      const m = series[i];
      if (!m) return '';
      if (i === 0 || m.m === 1) return [MONTH_SHORT[m.m - 1], String(m.y)];
      return [4, 7, 10].includes(m.m) ? MONTH_SHORT[m.m - 1] : '';
    };
    const radius = (ctx: { dataIndex: number }) => (ctx.dataIndex === (store.get() ?? series.length - 1) ? 4 : 0);
    const opts = (
      fmt: (v: number, digits: number) => string,
      showX: boolean,
      ticks: number,
    ): ChartOptions<'line'> => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      events: ['mousemove', 'mouseout', 'touchstart', 'touchmove'],
      onHover: (e, _els, chart) => {
        if (e.x == null) return;
        const i = Math.round(chart.scales.x.getValueForPixel(e.x) as number);
        store.set(Math.max(0, Math.min(series.length - 1, i)));
      },
      layout: { padding: { top: 8, right: 10, left: 0, bottom: 0 } },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: {
          grid: { display: false },
          border: { display: showX, color: axis.grid },
          ticks: {
            display: showX,
            autoSkip: false,
            maxRotation: 0,
            color: axis.tick,
            font: { size: 10.5, family: "'Onest', system-ui, sans-serif" },
            callback: (_v, i) => tickLabel(i) as string,
          },
        },
        y: {
          grace: '12%',
          grid: { color: axis.grid, drawTicks: false },
          border: { display: false },
          ticks: {
            maxTicksLimit: ticks,
            padding: 8,
            color: axis.tick,
            font: { size: 10.5, family: "'Onest', system-ui, sans-serif" },
            callback: (v, _i, all) => {
              const step = all.length > 1 ? Math.abs(all[1].value - all[0].value) : 1;
              return fmt(Number(v), step >= 1 ? 0 : step >= 0.1 ? 1 : 2);
            },
          },
          afterFit: (s) => {
            s.width = 46;
          },
        },
      },
    });
    const ds = (data: Array<number | null>, color: string, fill: string | false, width = 2, smooth = true) => ({
      data,
      borderColor: color,
      backgroundColor: fill || 'transparent',
      fill: fill ? 'start' : false,
      borderWidth: width,
      borderJoinStyle: 'round' as const,
      spanGaps: true,
      ...(smooth ? { cubicInterpolationMode: 'monotone' as const } : { tension: 0 }),
      pointRadius: radius,
      pointHoverRadius: radius,
      pointBackgroundColor: color,
      pointBorderColor: surface,
      pointBorderWidth: 2,
    });
    // Ось времени — только у нижней панели; у неё же +30 px под подписи
    const specs = [
      {
        key: 'fot',
        title: 'ФОТ, млн / мес',
        height: 168,
        data: ds(series.map((m) => (m.fot * k) / 1e6), ink, cssRgba('--c-ink', 0.045)),
        // Скрыты зарплаты — без подписей оси: линия есть, сумм нет
        fmt: (v: number, d: number) => (hidden ? '' : nf(v, d)),
        ticks: 4,
        integer: false,
      },
      {
        key: 'count',
        title: 'Человек',
        height: 84,
        data: ds(series.map((m) => m.count), sky, cssRgba('--c-sky', 0.08), 2, false),
        fmt: (v: number) => (Number.isInteger(v) ? String(v) : ''),
        ticks: 3,
        integer: true,
      },
      ...(hasShare
        ? [
            {
              key: 'share',
              title: 'Доля в ФОТ компании, %',
              height: 84,
              data: ds(series.map((m) => m.share), stone, false, 1.5),
              fmt: (v: number, d: number) => nf(v, d),
              ticks: 3,
              integer: false,
            },
          ]
        : []),
    ];
    const list = specs.map((sp, i) => {
      const last = i === specs.length - 1;
      const options = opts(sp.fmt, last, sp.ticks);
      if (sp.integer) (options.scales!.y as { ticks: { precision?: number } }).ticks.precision = 0;
      return {
        key: sp.key,
        title: sp.title,
        height: sp.height + (last ? 30 : 0),
        data: { labels, datasets: [sp.data] },
        options,
        plugin: makePlugin(store, theme, janIdx, i === 0),
      };
    });
    return list;
  }, [series, theme, k, hidden, hasShare, janIdx, store]);

  useEffect(() => () => store.set(null), [store]);

  return (
    <section data-comment-anchor="economics-monthly" className="card p-5 min-w-0 animate-fade-up" style={{ animationDelay: '350ms' }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-medium text-balance">Динамика по месяцам</h3>
          <div className="text-[11px] text-stone mt-0.5">
            С {MONTH_GENITIVE[first.m - 1]} {first.y}, на конец месяца
          </div>
        </div>
        <div className="segmented h-8 p-0.5" role="group" aria-label="Вид">
          {(
            [
              ['chart', 'График'],
              ['table', 'Таблица'],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`segmented-item h-7 px-3 text-xs active:scale-[0.96] transition-[color,background-color,transform] duration-150 ${
                view === v ? 'segmented-item-active' : ''
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {view === 'chart' ? (
        <>
          {/* Считывание: значения за месяц под курсором, по умолчанию — последний */}
          <div className="mt-4 flex items-center gap-x-5 gap-y-1 flex-wrap min-h-8 py-1.5 px-3 rounded-[10px] bg-canvas/70">
            <span className="label-mono text-stone w-[104px] shrink-0">
              {MONTH_FULL[cur.m - 1]} {cur.y}
            </span>
            <span className="flex items-center gap-1.5 text-[13px] whitespace-nowrap">
              <span className="w-3 h-0.5 rounded-full bg-ink" aria-hidden />
              <span className="font-medium tabular-nums">
                <Mln rub={cur.fot} /> млн
              </span>
              <span className="text-stone">ФОТ</span>
            </span>
            <span className="flex items-center gap-1.5 text-[13px] whitespace-nowrap">
              <span className="w-3 h-0.5 rounded-full bg-sky" aria-hidden />
              <span className="font-medium tabular-nums">{cur.count}</span>
              <span className="text-stone">{plural(cur.count, PEOPLE_FORMS)}</span>
            </span>
            {hasShare && (
              <span className="flex items-center gap-1.5 text-[13px] whitespace-nowrap">
                <span className="w-3 h-0.5 rounded-full bg-stone" aria-hidden />
                <span className="font-medium tabular-nums">{cur.share == null ? '—' : `${fmtShare(cur.share)}%`}</span>
                <span className="text-stone">Доля в ФОТ компании</span>
              </span>
            )}
          </div>
          <div className="mt-3" onMouseLeave={() => store.set(null)}>
            {panels.map((p, i) => (
              <div key={p.key} className={i ? 'mt-2' : ''}>
                <div className="label-mono text-ash pl-[46px] mb-1">{p.title}</div>
                <div className="relative" style={{ height: p.height }}>
                  <Line key={`${theme}-${k}-${hidden}`} data={p.data as never} options={p.options} plugins={[p.plugin]} />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-4 max-h-[472px] overflow-auto rounded-[12px] border border-cloud">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-snow">
              <tr className="border-b border-cloud">
                {['Месяц', 'ФОТ, тыс.', 'Человек', 'Доля, %'].map((h, i) => (
                  <th key={h} className={`label-mono py-2.5 px-4 text-stone ${i ? 'text-right' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-cloud">
              {[...series].reverse().map((m) => (
                <tr key={m.key} className={m.y >= year ? '' : 'text-stone'}>
                  <td className="py-2 px-4">
                    {MONTH_FULL[m.m - 1]} {m.y}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums">
                    <SumK rub={m.fot} />
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums">{m.count}</td>
                  <td className="py-2 px-4 text-right tabular-nums">{m.share == null ? '—' : fmtShare(m.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
