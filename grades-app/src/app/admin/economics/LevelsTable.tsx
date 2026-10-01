'use client';

// «По уровням»: вилка, численность, медиана, ставки точками на общей шкале
// (язык BandMeter из поп-апа), выше/ниже вилки, средняя ставка найма (ССЗП).
// Строка раскрывается в список людей уровня.

import { Fragment, useId, useState } from 'react';
import Tooltip from '@/components/Tooltip';
import Avatar from '@/components/Avatar';
import Money from '@/components/Money';
import { formatPct } from '@/lib/compensation';
import { fmtDate, fmtDay, fmtRate, pctDelta, plural, type LevelPerson, type LevelRow } from '@/lib/economics';
import { Collapse, DeptChip, LevelName, Rate, SheetTerm, ToggleButton, useK } from './ui';

/** Шаг рисок шкалы в тысячах — 25, 50 или 100 в зависимости от размаха. */
function niceTicks(lo: number, hi: number): number[] {
  const span = hi - lo;
  const step = span > 220 ? 100 : span > 110 ? 50 : 25;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push(t);
  return out;
}

const SUBLABEL: Partial<Record<LevelRow['key'], string>> = {
  none: 'Грейда в Грейдах нет',
  hourly: 'Вне медиан и вилок',
};

function BandStrip({ row, lo, hi, ceiling }: { row: LevelRow; lo: number; hi: number; ceiling: number | null }) {
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  // Совпадающие ставки раскладываем по дорожкам ±5 px, чтобы точки не слипались
  const threshold = (hi - lo) * 0.026;
  const lanesLast: Record<number, number> = {};
  const dots = [...row.people]
    .filter((x) => x.salary > 0)
    .sort((a, b) => a.salary - b.salary)
    .map((x) => {
      const lane = [0, -1, 1, -2, 2].find((l) => lanesLast[l] == null || x.salary - lanesLast[l] >= threshold) ?? 0;
      lanesLast[lane] = x.salary;
      return { ...x, lane };
    });
  return (
    <div className="relative h-7">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-ink/[0.07]">
        {row.band && (
          <div
            className="absolute inset-y-0 rounded-full bg-emerald/30"
            style={{ left: `${pos(row.band.min)}%`, width: `${pos(row.band.max) - pos(row.band.min)}%` }}
          />
        )}
      </div>
      {ceiling != null && ceiling > lo && ceiling < hi && (
        <div className="absolute inset-y-0 border-l border-dashed border-blaze/70" style={{ left: `${pos(ceiling)}%` }} />
      )}
      {dots.map((x) => (
        <Tooltip
          key={x.p.key}
          portal
          align="center"
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 p-0.5"
          style={{ left: `${pos(x.salary)}%`, marginTop: x.lane * 5 }}
          text={
            <span>
              <span className="text-ink font-medium">{x.p.name}</span> · <Rate rub={x.salary} /> тыс.
              {x.state === 'above' && row.band && (
                <>
                  {' '}
                  · выше вилки на <Rate rub={x.salary - row.band.max} />
                </>
              )}
              {x.state === 'below' && <> · ниже вилки</>}
            </span>
          }
        >
          <span
            className={`block w-3 h-3 rounded-full ring-2 ring-snow ${
              x.state === 'above' ? 'bg-blaze' : x.state ? 'bg-emerald' : 'bg-stone'
            }`}
          />
        </Tooltip>
      ))}
      {/* Медиана — поверх точек и длиннее их, чтобы читалась и в кучке */}
      {row.median != null && (
        <Tooltip
          portal
          align="center"
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 px-1 z-10"
          style={{ left: `${pos(row.median)}%` }}
          text={<>Медиана — <Rate rub={row.median} /> тыс.</>}
        >
          <span className="block w-0.5 h-[22px] rounded-full bg-ink ring-1 ring-snow" />
        </Tooltip>
      )}
    </div>
  );
}

function BandChip({ x, band }: { x: LevelPerson; band: LevelRow['band'] }) {
  if (!band || !x.state) return <span className="text-ash">—</span>;
  return x.state === 'above' ? (
    <span className="chip-danger h-6 whitespace-nowrap">
      Выше вилки на <Rate rub={x.salary - band.max} />
    </span>
  ) : (
    <span className="chip-success h-6 whitespace-nowrap">{x.state === 'within' ? 'В вилке' : 'Ниже вилки'}</span>
  );
}

const PEOPLE_COLS =
  'grid grid-cols-[minmax(0,1.3fr)_112px_88px_minmax(0,1.4fr)_minmax(0,1.1fr)_minmax(0,1fr)] gap-4';

function LevelPeople({ row }: { row: LevelRow }) {
  return (
    // Подложка r-12 внутри отступа 16 px от края карточки (r-22) — радиусы концентричны
    <div className="px-4 pb-4 pt-1">
      <div className="rounded-[12px] bg-canvas px-4 py-3">
        <div className={`${PEOPLE_COLS} pb-2 border-b border-cloud/70`}>
          {['Имя', 'Отдел', 'Ставка, тыс.', 'С 1 января', 'Вилка', 'Пересмотр'].map((h) => (
            <span key={h} className="label-mono text-ash">
              {h}
            </span>
          ))}
        </div>
        {row.people.map((x) => {
          const pct = x.jan1 != null ? pctDelta(x.jan1, x.salary) : null;
          const hiredAt = x.p.stints[x.p.stints.length - 1]?.from;
          return (
            <div key={x.p.key} className={`${PEOPLE_COLS} items-center py-2 text-[13px]`}>
              <span className="flex items-center gap-2.5 min-w-0">
                <Avatar name={x.p.name} avatarUrl={x.p.avatarUrl} size={28} />
                <span className="font-medium truncate">{x.p.name}</span>
              </span>
              <span>
                <DeptChip dept={x.p.dept} />
              </span>
              <span className="font-medium tabular-nums">{x.salary > 0 ? <Rate rub={x.salary} /> : '—'}</span>
              <span className="text-stone whitespace-nowrap truncate tabular-nums">
                {x.jan1 == null ? (
                  <>Найм {hiredAt ? fmtDate(hiredAt) : '—'}</>
                ) : x.salary === x.jan1 ? (
                  <span className="text-ash">{x.p.noHistory ? 'Нет журнала в HR' : 'Без изменений'}</span>
                ) : (
                  <>
                    <span className="text-ink">
                      <Rate rub={x.jan1} /> → <Rate rub={x.salary} />
                    </span>
                    {pct != null && <> · {formatPct(pct)}</>}
                  </>
                )}
              </span>
              <span>
                <BandChip x={x} band={row.band} />
              </span>
              <span className="text-stone whitespace-nowrap tabular-nums">
                {x.planned ? (
                  <>
                    {x.planned.at ? fmtDay(x.planned.at) : 'Без даты'} →{' '}
                    <span className="text-ink">
                      <Rate rub={x.planned.salary} />
                    </span>
                  </>
                ) : (
                  <span className="text-ash">—</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LevelsTable({ rows, ceiling }: { rows: LevelRow[]; ceiling: number | null }) {
  const k = useK();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const baseId = useId();
  const all = rows.flatMap((r) => [
    ...r.people.map((x) => x.salary).filter((v) => v > 0),
    ...(r.band ? [r.band.min, r.band.max] : []),
  ]);
  if (ceiling != null) all.push(ceiling);
  const lo = (all.length ? Math.min(...all) : 50_000) * 0.9;
  const hi = (all.length ? Math.max(...all) : 200_000) * 1.04;
  // Риски — в тысячах текущего режима сумм
  const ticks = niceTicks((lo * k) / 1000, (hi * k) / 1000);
  const toggle = (key: string) =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <section data-comment-anchor="economics-levels" className="card overflow-hidden animate-fade-up" style={{ animationDelay: '280ms' }}>
      <div className="flex items-baseline justify-between gap-4 px-5 pt-5 pb-4">
        <h3 className="text-base font-medium text-balance">По уровням</h3>
        <div className="flex items-center gap-4 text-[11px] text-stone flex-wrap justify-end">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald" />В вилке или ниже
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blaze" />Выше вилки
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-1.5 rounded-full bg-emerald/30" />Вилка
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-0.5 h-3 rounded-full bg-ink/70" />Медиана
          </span>
          {ceiling != null && (
            <span className="flex items-center gap-1.5">
              <span className="h-3 border-l border-dashed border-blaze" />
              Потолок <Rate rub={ceiling} />
            </span>
          )}
        </div>
      </div>
      <table className="w-full text-sm table-fixed">
        <colgroup>
          <col style={{ width: 152 }} />
          <col style={{ width: 104 }} />
          <col style={{ width: 72 }} />
          <col style={{ width: 128 }} />
          <col />
          <col style={{ width: 100 }} />
          <col style={{ width: 108 }} />
          <col style={{ width: 56 }} />
        </colgroup>
        <thead>
          <tr className="bg-ink/[0.03] border-y border-cloud">
            <th className="label-mono text-left py-2.5 px-4 text-stone">Уровень</th>
            <th className="label-mono text-center py-2.5 px-4 text-stone">Вилка, тыс.</th>
            <th className="label-mono text-center py-2.5 px-4 text-stone">Людей</th>
            <th className="label-mono text-center py-2.5 px-4 text-stone">Медиана, тыс.</th>
            <th className="py-2.5 px-4">
              {/* Общая шкала для всех строк — уровни читаются лесенкой */}
              <div className="relative h-[9.5px] salary-sensitive">
                {ticks.map((t) => (
                  <span
                    key={t}
                    className="label-mono text-ash absolute -translate-x-1/2 tabular-nums"
                    style={{ left: `${(((t * 1000) / k - lo) / (hi - lo)) * 100}%` }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </th>
            <th className="label-mono text-center py-2.5 px-4 text-stone">
              <Tooltip
                portal
                align="center"
                text="Выше вилки ↑ (красным) и ниже вилки ↓. Правило цвета — как в поп-апе: выше — тревога, ниже — нет."
              >
                <span>Вне вилки</span>
              </Tooltip>
            </th>
            <th className="label-mono text-center py-2.5 px-4 text-stone">
              <Tooltip
                portal
                align="center"
                text={
                  <>
                    Средняя стартовая ставка нанятых с 1 января, включая уже ушедших. В скобках — сколько наймов.
                    <SheetTerm term="ССЗП" />
                  </>
                }
              >
                <span>Найм, тыс.</span>
              </Tooltip>
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isOpen = open.has(r.key);
            const id = `${baseId}-${r.key}`;
            const sub = SUBLABEL[r.key];
            return (
              <Fragment key={r.key}>
                <tr
                  onClick={() => toggle(r.key)}
                  className={`group cursor-pointer transition-colors duration-150 hover:bg-canvas/60 ${
                    i ? 'border-t border-cloud' : ''
                  } ${isOpen ? 'bg-canvas/40' : ''}`}
                >
                  <td className="py-3 px-4">
                    <LevelName level={r.level} label={r.label} />
                    {sub && <div className="text-[11px] text-ash mt-0.5 truncate">{sub}</div>}
                  </td>
                  <td className="py-3 px-4 text-center tabular-nums text-stone whitespace-nowrap">
                    {r.band ? (
                      <Money value={`${fmtRate(r.band.min, k)}–${fmtRate(r.band.max, k)}`} />
                    ) : (
                      <span className="text-ash">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center tabular-nums">{r.people.length}</td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <span className={`tabular-nums font-medium ${r.small ? 'text-stone' : ''}`}>
                      {r.median == null ? '—' : <Rate rub={r.median} />}
                    </span>
                    {r.small && r.median != null && (
                      <Tooltip
                        portal
                        align="center"
                        className="ml-1.5"
                        text={`Медиана по ${r.people.length} ${plural(r.people.length, ['человеку', 'людям', 'людям'])} — мало для выводов`}
                      >
                        <span className="text-[11px] text-ash tabular-nums">{r.people.length} чел.</span>
                      </Tooltip>
                    )}
                  </td>
                  <td className="py-1.5 px-4">
                    <BandStrip row={r} lo={lo} hi={hi} ceiling={ceiling} />
                  </td>
                  <td className="py-3 px-4 text-center tabular-nums whitespace-nowrap">
                    {r.above === 0 && r.below === 0 ? (
                      <span className="text-ash">—</span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        {r.above > 0 && <span className="text-blaze font-medium">↑ {r.above}</span>}
                        {r.below > 0 && <span className="text-stone">↓ {r.below}</span>}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center tabular-nums whitespace-nowrap">
                    {r.hire ? (
                      <>
                        <span className="font-medium">
                          <Rate rub={r.hire.avg} />
                        </span>
                        <span className="text-ash text-[11px] ml-1">({r.hire.count})</span>
                      </>
                    ) : (
                      <span className="text-ash">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <ToggleButton
                      open={isOpen}
                      label={`${r.label}: люди`}
                      controls={id}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(r.key);
                      }}
                    />
                  </td>
                </tr>
                <tr className={isOpen ? 'bg-canvas/40' : ''}>
                  <td colSpan={8} className="p-0">
                    <Collapse open={isOpen} id={id}>
                      <LevelPeople row={r} />
                    </Collapse>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
