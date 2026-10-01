'use client';

// «Куда ушли деньги с 1 января»: разложение ФОТ (было → +повышения →
// −понижения → +наймы → −уходы → стало → пересмотры в плане), под ним годовой
// прирост зарплат (ГПЗП), средний прирост на человека (СГПЗП) и ориентир года.
// Сокращения таблички — только в подсказках. Ориентир — не бюджет: без «запаса»
// и без цвета-оценки.

import type { ReactNode } from 'react';
import Tooltip from '@/components/Tooltip';
import { InfoIcon } from '@/components/icons';
import {
  avgRaise,
  fmtDay,
  fmtSignedPct,
  nf,
  plural,
  PEOPLE_FORMS,
  type Bridge,
} from '@/lib/economics';
import { Info, Mln, Rate, SheetTerm, SignedSumK, SumK } from './ui';

type Step = {
  key: string;
  kind: 'total' | 'up' | 'down' | 'plan';
  from: number;
  to: number;
  value: ReactNode;
  label: string;
  sub: string;
  tip: ReactNode;
};

const BAR_CLASS: Record<Step['kind'], string> = {
  total: 'bg-ink/20',
  up: 'bg-emerald/80',
  down: 'bg-blaze/80',
  plan: 'border border-dashed border-emerald/70 bg-emerald/10',
};

const PLOT = 176;
const BAR = 44;

export default function MoneyBridge({
  b,
  targetRate,
  today,
  coverage,
}: {
  b: Bridge;
  targetRate: number;
  today: string;
  coverage: { have: number; total: number };
}) {
  const targetPct = targetRate * 100;
  const target = b.start * (1 + targetRate);

  const steps: Step[] = [];
  let lvl = b.start;
  steps.push({
    key: 'start',
    kind: 'total',
    from: 0,
    to: b.start,
    value: <><Mln rub={b.start} /> млн</>,
    label: '1 января',
    sub: `${b.startCount} ${plural(b.startCount, PEOPLE_FORMS)}`,
    tip: <>ФОТ на 1 января — <SumK rub={b.start} /> тыс.</>,
  });
  steps.push({
    key: 'raises',
    kind: 'up',
    from: lvl,
    to: (lvl += b.raises),
    value: <SignedSumK rub={b.raises} />,
    label: 'Повышения',
    sub: `${b.raiseCount} ${plural(b.raiseCount, ['повышение', 'повышения', 'повышений'])}`,
    tip: 'Рост ставок у тех, кто работал 1 января и работает сейчас',
  });
  if (b.cuts < 0) {
    steps.push({
      key: 'cuts',
      kind: 'down',
      from: lvl,
      to: (lvl += b.cuts),
      value: <SignedSumK rub={b.cuts} />,
      label: 'Понижения',
      sub: `${b.cutCount} ${plural(b.cutCount, PEOPLE_FORMS)}`,
      tip: 'Снижение ставок у тех, кто работал 1 января и работает сейчас',
    });
  }
  steps.push({
    key: 'hires',
    kind: 'up',
    from: lvl,
    to: (lvl += b.hires),
    value: <SignedSumK rub={b.hires} />,
    label: 'Наймы',
    sub: `${b.hireCount} ${plural(b.hireCount, PEOPLE_FORMS)}`,
    tip: 'Текущие ставки нанятых с 1 января, кто работает сейчас',
  });
  steps.push({
    key: 'leavers',
    kind: 'down',
    from: lvl,
    to: (lvl -= b.leavers),
    value: <SignedSumK rub={-b.leavers} />,
    label: 'Уходы',
    sub: `${b.leaverCount} ${plural(b.leaverCount, PEOPLE_FORMS)}`,
    tip: 'Ставки ушедших на 1 января',
  });
  steps.push({
    key: 'end',
    kind: 'total',
    from: 0,
    to: b.end,
    value: <><Mln rub={b.end} /> млн</>,
    label: 'Сейчас',
    sub: `${b.endCount} ${plural(b.endCount, PEOPLE_FORMS)}`,
    tip: <>ФОТ сейчас — <SumK rub={b.end} /> тыс.</>,
  });
  steps.push({
    key: 'plan',
    kind: 'plan',
    from: b.end,
    to: b.end + b.planned,
    value: <SignedSumK rub={b.planned} />,
    label: 'Пересмотры',
    sub: b.plannedCount ? `${b.plannedCount} в плане до декабря` : 'Не запланированы',
    tip: 'Плановые пересмотры до 31 декабря: новая ставка минус текущая',
  });

  // Шкала не от нуля: приросты в 5–15% на полной шкале были бы чертой
  const levels = [...steps.flatMap((s) => (s.kind === 'total' ? [s.to] : [s.from, s.to])), target];
  const minV = Math.min(...levels);
  const maxV = Math.max(...levels);
  const range = maxV - minV || Math.max(maxV * 0.2, 1);
  const lo = Math.max(0, minV - range * 1.1);
  const hi = maxV + range * 0.12;
  const y = (v: number) => ((v - lo) / (hi - lo || 1)) * PLOT;
  const cols = { gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` };
  const sgpzp = avgRaise(b);

  return (
    <section data-comment-anchor="economics-bridge" className="card p-5 animate-fade-up" style={{ animationDelay: '210ms' }}>
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <h3 className="text-base font-medium text-balance">Куда ушли деньги с 1 января</h3>
        <span className="text-[11px] text-ash whitespace-nowrap tabular-nums">
          ФОТ / мес, 01.01 → {fmtDay(today)}.{today.slice(0, 4)}
        </span>
      </div>

      <div className="relative mt-8" style={{ height: PLOT }}>
        {/* Ориентир года — пунктир по всей ширине */}
        <div className="absolute inset-x-0 border-t border-dashed border-stone/60" style={{ bottom: y(target) }} />
        <span className="absolute left-0 text-[11px] text-stone leading-none pb-1.5 tabular-nums" style={{ bottom: y(target) }}>
          Ориентир +{nf(targetPct, 1)}% · <Mln rub={target} /> млн
        </span>
        <div className="absolute inset-0 grid" style={cols}>
          {steps.map((s, i) => {
            const total = s.kind === 'total';
            // Итоги стоят на нижнем крае (шкала обрезана — «разрыв»), шаги
            // висят между уровнями «до» и «после»
            const bottom = total ? 0 : y(Math.min(s.from, s.to));
            const h = total ? y(s.to) : Math.max(2, Math.abs(y(s.to) - y(s.from)));
            const next = steps[i + 1];
            return (
              <div key={s.key} className="relative">
                {next && (
                  <div
                    className="absolute h-px bg-ash/60"
                    style={{ left: `calc(50% + ${BAR / 2}px)`, width: `calc(100% - ${BAR}px)`, bottom: y(s.to) }}
                  />
                )}
                <Tooltip
                  portal
                  text={s.tip}
                  align="center"
                  maxWidth={240}
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{ bottom, height: h, width: BAR }}
                >
                  <span
                    className={`relative block w-full h-full rounded-[4px] overflow-hidden ${
                      s.key === 'end' ? 'bg-ink/80' : BAR_CLASS[s.kind]
                    }`}
                  >
                    {total && (
                      <span aria-hidden className="absolute inset-x-0 bottom-3 h-[5px] bg-snow -skew-y-[14deg]" />
                    )}
                  </span>
                </Tooltip>
                <div
                  className="absolute inset-x-0 flex justify-center pointer-events-none"
                  style={{ bottom: bottom + h + 6 }}
                >
                  <span className="px-1 rounded bg-snow text-sm font-medium leading-none whitespace-nowrap tabular-nums">
                    {s.value}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid mt-3" style={cols}>
        {steps.map((s) => (
          <div key={s.key} className="text-center px-1">
            <div className="text-[13px] text-ink">{s.label}</div>
            <div className="text-xs text-stone mt-0.5 tabular-nums">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6 mt-6 pt-5 border-t border-cloud/60">
        <div>
          <div className="flex items-center gap-1.5 h-3.5">
            <span className="label-mono text-stone">Годовой прирост зарплат</span>
            <Info
              text={
                <>
                  На сколько в месяц выросли ставки с 1 января: текущая ставка минус ставка на 1 января у всех, у
                  кого она выросла. Наймы и уходы не входят.
                  <SheetTerm term="ГПЗП" />
                </>
              }
            />
          </div>
          <div className="font-display text-[22px] leading-none font-medium tracking-tight mt-3 tabular-nums">
            <SumK rub={b.raises} />
            <span className="text-sm text-ash font-normal tracking-normal ml-1">тыс.</span>
          </div>
          <div className="text-xs text-stone mt-2">Сумма повышений с 1 января</div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 h-3.5">
            <span className="label-mono text-stone">Средний прирост на человека</span>
            <Info
              text={
                <>
                  Годовой прирост зарплат, делённый на число людей, у которых выросла ставка.
                  <SheetTerm term="СГПЗП" />
                </>
              }
            />
          </div>
          <div className="font-display text-[22px] leading-none font-medium tracking-tight mt-3 tabular-nums">
            {sgpzp == null ? '—' : <Rate rub={sgpzp} />}
            {sgpzp != null && <span className="text-sm text-ash font-normal tracking-normal ml-1">тыс.</span>}
          </div>
          <div className="text-xs text-stone mt-2 tabular-nums">
            {b.raiseCount
              ? `Среднее по ${b.raiseCount} ${plural(b.raiseCount, ['повышению', 'повышениям', 'повышениям'])}`
              : 'Повышений с 1 января нет'}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 h-3.5">
            <span className="label-mono text-stone">Ориентир на год</span>
            <Info
              align="right"
              text="Ориентир, а не бюджет: рост всего ФОТ к 31 декабря относительно 1 января, вместе с наймом. Задаётся в настройках."
            />
          </div>
          <div className="font-display text-[22px] leading-none font-medium tracking-tight mt-3 tabular-nums">
            +{nf(targetPct, 1)}%
          </div>
          <div className="text-xs text-stone mt-2 leading-relaxed tabular-nums text-pretty">
            Сейчас {b.growthPct == null ? '—' : fmtSignedPct(b.growthPct)} · с пересмотрами{' '}
            {b.plannedGrowthPct == null ? '—' : fmtSignedPct(b.plannedGrowthPct)}
            <div className="text-ash">
              {b.plannedCount ? (
                <>
                  В плане {b.plannedCount} {plural(b.plannedCount, ['пересмотр', 'пересмотра', 'пересмотров'])} ·{' '}
                  <SignedSumK rub={b.planned} />
                </>
              ) : (
                'Плановых пересмотров до декабря нет'
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-1.5 mt-5 text-[11px] text-ash leading-relaxed text-pretty">
        <InfoIcon className="w-3.5 h-3.5 shrink-0 mt-px" />
        <span>
          Шкала не от нуля.{' '}
          {b.inOut > 0 && (
            <>
              {b.inOut} {plural(b.inOut, PEOPLE_FORMS)} {b.inOut === 1 ? 'нанят и ушёл' : 'наняты и ушли'} в этом году —
              в разложение не {b.inOut === 1 ? 'входит' : 'входят'}.{' '}
            </>
          )}
          История ставок в HR есть по {coverage.have} из {coverage.total}
          {coverage.have < coverage.total ? ' — у остальных ставка на 1 января приближена текущей.' : '.'}
        </span>
      </div>
    </section>
  );
}
