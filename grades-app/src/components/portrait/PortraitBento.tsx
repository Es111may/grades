'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { getOnTimeZone, type OnTimeZone } from '@/lib/perfScore';
import { SalaryCardSkeleton } from '@/components/skeletons/portrait';

/**
 * Ячейки bento портрета (концепт v6). Единая анатомия, как у bento
 * «Команды»: подпись → крупное число 44px → описание → бар, прижатый к низу;
 * высота — от 188px. Общие для портрета с оценкой и без неё.
 */

// SalaryBlock нужен только админу и лиду — дизайнеру код «Зарплаты» вообще
// не приезжает. Заглушка — с тем же flex-1, что у карточки в слоте.
const SalaryCard = dynamic(() => import('@/components/SalaryCard'), {
  ssr: false,
  loading: () => <SalaryCardSkeleton className="flex-1" />,
});

export function BentoCard({
  label,
  className = '',
  children,
}: {
  label: ReactNode;
  /** Размер в сетке/ряду — у портрета без оценки ячейки делят ряд поровну. */
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`card p-5 flex flex-col min-h-[188px] ${className}`}>
      <div className="label-mono text-stone">{label}</div>
      {children}
    </div>
  );
}

/** Крупное число ячейки — 44px. */
export function BentoNumber({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`font-display text-[44px] leading-none font-medium tracking-tight mt-3 ${className}`}>
      {children}
    </div>
  );
}

/** Бар у нижнего края ячейки. percent — уже в пределах 0…100. */
export function BentoBar({ percent, fillClassName }: { percent: number; fillClassName: string }) {
  return (
    <div className="h-1 bg-cloud rounded-full overflow-hidden mt-auto">
      <div className={`h-full rounded-full ${fillClassName}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

// Зона «в срок» (lib/perfScore): ≥85 — цель, 70–84 — можно лучше, ниже — просадка
const ZONE_TEXT: Record<OnTimeZone, string> = {
  emerald: 'text-emerald',
  amber: 'text-sunset',
  blaze: 'text-blaze',
};
const ZONE_BG: Record<OnTimeZone, string> = {
  emerald: 'bg-emerald',
  amber: 'bg-sunset',
  blaze: 'bg-blaze',
};

/**
 * «В срок · 6 мес» — число, описание, бар в цвете зоны. Данных нет (ClickHouse
 * не ответил, задач нет) или перформанс не показываем — тихая строка вместо
 * числа; у Инхауса задачи не трекаются.
 */
export function OnTimeCell({
  show,
  percent,
  totalTasks,
  buildCode,
  className = '',
}: {
  /** Перформанс виден (роль и билд — performanceVisible). */
  show: boolean;
  percent: number | null;
  totalTasks: number;
  buildCode: string | null;
  className?: string;
}) {
  return (
    <BentoCard label="В срок · 6 мес" className={className}>
      {show && percent !== null ? (
        <>
          <BentoNumber>{Math.round(percent)}%</BentoNumber>
          <div className="text-xs text-stone mt-2">
            {totalTasks} задач в выборке ·{' '}
            <span className={`${ZONE_TEXT[getOnTimeZone(percent)]} font-medium`}>
              цель 85%{percent >= 85 ? ' — есть' : ''}
            </span>
          </div>
          <BentoBar
            percent={Math.max(0, Math.min(100, Math.round(percent)))}
            fillClassName={ZONE_BG[getOnTimeZone(percent)]}
          />
        </>
      ) : (
        <div className="text-sm text-ash mt-3">
          {buildCode === 'creator' ? 'Инхаус — задачи не трекаются' : 'Нет данных по задачам'}
        </div>
      )}
    </BentoCard>
  );
}

/**
 * Позиция 9-Box. half — верхняя половина слота, под ней «Зарплата»:
 * та же анатомия, что у зарплаты (ряд подписи 24px, значение text-xl), —
 * половины читаются парой. Позиции нет — «Не размечена».
 */
export function NineBoxCell({
  title,
  half = false,
  className = '',
}: {
  title: string | null;
  half?: boolean;
  className?: string;
}) {
  if (!half) {
    return (
      <BentoCard label="Позиция · 9-Box" className={className}>
        <div className="font-display text-2xl font-medium tracking-tight mt-3">{title}</div>
      </BentoCard>
    );
  }
  return (
    // pt-[13px] + ряд подписи в 24px: подпись на той же высоте, что у
    // соседних карточек с p-5
    <div className="card flex-1 px-5 pt-[13px] pb-4">
      <div className="min-h-6 flex items-center label-mono text-stone">Позиция · 9-Box</div>
      <div
        className={`mt-1.5 font-display text-xl leading-tight font-medium tracking-tight ${
          title ? '' : 'text-ash'
        }`}
      >
        {title ?? 'Не размечена'}
      </div>
    </div>
  );
}

/**
 * Слот «Зарплата» — тем, кто видит деньги (админ и лид этого человека).
 * С 9-Box слот делится пополам: сверху позиция, снизу «Зарплата»,
 * подробности — в поп-апе по «+». Зарплаты спрятаны выключателем в шапке —
 * нижней половины нет (salary-sensitive), позиция растягивается на весь
 * слот (flex-1). Без 9-Box (человек вне грейдирования — в 9-Box его нет)
 * «Зарплата» занимает слот целиком, а при скрытых зарплатах слота нет вовсе.
 */
export function SalaryCell({
  userId,
  nineBoxTitle,
  withNineBox = true,
  className = '',
}: {
  userId: number;
  nineBoxTitle: string | null;
  withNineBox?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`${withNineBox ? '' : 'salary-sensitive '}flex flex-col gap-3 min-h-[188px] ${className}`}
    >
      {withNineBox && <NineBoxCell title={nineBoxTitle} half />}
      <SalaryCard userId={userId} className="flex-1" tall={!withNineBox} />
    </div>
  );
}
