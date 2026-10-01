'use client';

// Шапка «Экономики»: четыре карточки, как bento на «Команде» — число 44 px,
// изменение за год (YoY), подпись и полоса снизу.

import type { ReactNode } from 'react';
import Tooltip from '@/components/Tooltip';
import { formatPct } from '@/lib/compensation';
import {
  fmtPp,
  fmtShare,
  fmtSigned,
  fmtSignedPct,
  nf,
  plural,
  PEOPLE_FORMS,
  type Bridge,
  type MonthPoint,
  type Snapshot,
} from '@/lib/economics';
import { Info, Mln, Rate } from './ui';

export type BentoData = {
  now: Snapshot;
  ago: Snapshot;
  yoy: boolean;
  series: MonthPoint[];
  bridge: Bridge;
  targetRate: number;
  banded: number;
  above: number;
  cohort: { pct: number | null; n: number };
  companyFotNow: number | null;
  shareNow: number | null;
  shareAgo: number | null;
};

function StatCard({
  label,
  info,
  infoAlign,
  value,
  unit,
  delta,
  caption,
  children,
}: {
  label: string;
  info?: ReactNode;
  infoAlign?: 'left' | 'center' | 'right';
  value: ReactNode;
  unit?: string;
  delta?: ReactNode;
  caption: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="card p-5 flex flex-col min-h-[188px] min-w-0">
      <div className="flex items-center gap-1.5 h-3.5">
        <div className="label-mono text-stone">{label}</div>
        {info && <Info text={info} align={infoAlign} />}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-display text-[36px] xl:text-[44px] leading-none font-medium tracking-tight whitespace-nowrap tabular-nums">
          {value}
          {unit && <span className="text-lg text-ash font-normal tracking-normal ml-1.5">{unit}</span>}
        </span>
        {delta && <span className="text-sm text-stone whitespace-nowrap tabular-nums">{delta}</span>}
      </div>
      <div className="text-xs text-stone mt-2 leading-relaxed text-pretty">{caption}</div>
      {children}
    </div>
  );
}

/**
 * Рост ФОТ с 1 января к ориентиру года. Ориентир — не бюджет, поэтому без
 * оценочного цвета: заливка — сейчас, светлая часть — с плановыми
 * пересмотрами, риска — ориентир.
 */
function GuideBar({ now, planned, target }: { now: number; planned: number; target: number }) {
  const max = Math.max(target * 1.3, planned * 1.08, now * 1.08, 1);
  const w = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div className="relative h-1 bg-cloud rounded-full mt-auto">
      {planned > now && (
        <Tooltip
          portal
          className="absolute inset-y-0 left-0"
          style={{ width: w(planned) }}
          text={`С плановыми пересмотрами — ${fmtSignedPct(planned)}`}
        >
          <span className="block w-full h-full rounded-full bg-ink/20" />
        </Tooltip>
      )}
      <div className="absolute inset-y-0 left-0 rounded-full pointer-events-none bg-ink/60" style={{ width: w(now) }} />
      <Tooltip
        portal
        align="center"
        className="absolute -top-[3px] px-1 -ml-1"
        style={{ left: w(target) }}
        text={`Ориентир на год — +${nf(target, 1)}%`}
      >
        <span className="block h-2.5 w-px bg-ash/80" aria-hidden />
      </Tooltip>
    </div>
  );
}

/** Спарклайн как у «В срок · команда»: линия с заливкой, точка на конце. */
function Sparkline({ points, label }: { points: number[]; label: (v: number) => string }) {
  if (points.length < 2) return <div className="mt-auto h-[34px]" />;
  const W = 240;
  const H = 34;
  const pad = 4;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const X = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const Y = (v: number) => H - 5 - ((v - min) / range) * (H - 10);
  const line = points.map((v, i) => `${i ? 'L' : 'M'} ${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <div className="relative mt-auto pt-1">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[34px] block" aria-hidden>
        <path d={`${line} L ${X(points.length - 1)} ${H} L ${X(0)} ${H} Z`} className="fill-emerald/10" />
        <path
          d={line}
          fill="none"
          className="stroke-emerald"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <Tooltip
        portal
        align="right"
        className="absolute -translate-x-1/2 -translate-y-1/2 p-1"
        style={{ left: `${(X(points.length - 1) / W) * 100}%`, top: 4 + Y(last) }}
        text={label(last)}
      >
        <span className="block w-2 h-2 rounded-full bg-emerald ring-2 ring-snow" />
      </Tooltip>
    </div>
  );
}

export default function Bento({ d }: { d: BentoData }) {
  const { now, ago, yoy, bridge: b } = d;
  const targetPct = d.targetRate * 100;
  const fotYoY = ago.fot > 0 ? ((now.fot - ago.fot) / ago.fot) * 100 : null;
  const medYoY = ago.median && now.median ? ((now.median - ago.median) / ago.median) * 100 : null;
  const hiresYtd = b.hireCount + b.inOut;
  const leaversYtd = b.leaverCount + b.inOut;
  const last12 = d.series.slice(-12);
  const shares = last12.map((m) => m.share).filter((v): v is number => v != null);
  const smallMedian = now.paidCount > 0 && now.paidCount <= 3;

  return (
    <div className="grid grid-cols-4 gap-3 animate-fade-up" style={{ animationDelay: '140ms' }}>
      <StatCard
        label="ФОТ / мес"
        info={
          <>
            Сумма текущих ставок работающих, вместе с почасовщиками.
            {now.mean != null && (
              <>
                {' '}
                Средняя ставка — <Rate rub={now.mean} /> тыс.: её тянут вверх ставки лидов, поэтому в шапке —
                медиана.
              </>
            )}
          </>
        }
        value={<Mln rub={now.fot} />}
        unit="млн"
        delta={yoy && fotYoY != null ? `${formatPct(fotYoY)} за год` : null}
        caption={
          <>
            С 1 января {b.growthPct == null ? '—' : fmtSignedPct(b.growthPct)} · ориентир +{nf(targetPct, 1)}%
          </>
        }
      >
        {b.growthPct != null && (
          <GuideBar now={b.growthPct} planned={b.plannedGrowthPct ?? b.growthPct} target={targetPct} />
        )}
      </StatCard>

      <StatCard
        label="Человек"
        value={String(now.count)}
        delta={yoy ? `${fmtSigned(now.count - ago.count)} за год` : null}
        caption={
          <>
            С 1 января: {hiresYtd} {plural(hiresYtd, ['найм', 'найма', 'наймов'])}, {leaversYtd}{' '}
            {plural(leaversYtd, ['уход', 'ухода', 'уходов'])}
          </>
        }
      >
        <Sparkline points={last12.map((m) => m.count)} label={(v) => `Сейчас ${v} ${plural(v, PEOPLE_FORMS)}`} />
      </StatCard>

      <StatCard
        label="Медиана ставки"
        info="Середина текущих ставок: половина получает меньше, половина — больше. Не искажается одной большой ставкой. Почасовщики не входят."
        value={now.median == null ? '—' : <Rate rub={now.median} />}
        unit={now.median == null ? undefined : 'тыс.'}
        delta={
          smallMedian ? (
            // Мало ставок — вместо изменения за год честно говорим, из скольких медиана
            <span className="text-[11px] text-ash">
              Всего {now.paidCount} {plural(now.paidCount, ['ставка', 'ставки', 'ставок'])}
            </span>
          ) : yoy && medYoY != null ? (
            `${formatPct(medYoY)} за год`
          ) : null
        }
        caption={
          <>
            {d.cohort.pct != null && d.cohort.n > 0 && (
              <span className="block">
                У тех же людей с 1 января {formatPct(d.cohort.pct)}
                {/* Иконка — в строке текста: при переносе едет со словами, а не к краю */}
                <span className="inline-flex align-[-2px] ml-1.5">
                  <Info text="Медиана у тех, кто работал и 1 января, и сейчас. Общая медиана может упасть из-за найма — эта цифра показывает, что было со ставками у оставшихся." />
                </span>
              </span>
            )}
            <span className="block">
              {d.banded ? `Выше вилки — ${d.above} из ${d.banded}` : 'Вилок у этих людей нет'}
            </span>
          </>
        }
      >
        {d.banded > 0 && (
          <div className="flex h-1 gap-0.5 mt-auto" aria-hidden>
            {d.banded - d.above > 0 && <div className="rounded-full bg-emerald" style={{ flex: d.banded - d.above }} />}
            {d.above > 0 && <div className="rounded-full bg-blaze" style={{ flex: d.above }} />}
          </div>
        )}
      </StatCard>

      <StatCard
        label="Доля в ФОТ компании"
        infoAlign="right"
        info="ФОТ выбранных людей к ФОТ всей компании из HR-портала, на конец месяца."
        value={d.shareNow == null ? '—' : `${fmtShare(d.shareNow)}%`}
        delta={yoy && d.shareNow != null && d.shareAgo != null ? `${fmtPp(d.shareNow - d.shareAgo)} за год` : null}
        caption={
          d.companyFotNow == null ? (
            'Нет данных HR о ФОТ компании'
          ) : (
            <>
              ФОТ компании — <Mln rub={d.companyFotNow} /> млн/мес
            </>
          )
        }
      >
        {shares.length > 1 && <Sparkline points={shares} label={(v) => `Сейчас ${fmtShare(v)}%`} />}
      </StatCard>
    </div>
  );
}
