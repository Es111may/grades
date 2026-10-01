'use client';

// Общие мелочи страницы «Экономика»: режим сумм, денежные подписи,
// раскрытие строк, чипы. ToggleButton и Collapse — те же, что в карточках
// «Функционала» (FeaturesView) и истории з/п; кандидаты в общие компоненты.

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import Tooltip from '@/components/Tooltip';
import Money from '@/components/Money';
import { InfoIcon, PlusIcon, StarIcon } from '@/components/icons';
import {
  fmtMln,
  fmtRate,
  fmtSumK,
  type EconDept,
  type EconLevel,
  type Initiator,
} from '@/lib/economics';

// ─── Режим сумм ───────────────────────────────────────────────────────

/** Множитель сумм: 1 — «На руки», 1 + налог — «Для компании». */
export const KContext = createContext(1);
export const useK = () => useContext(KContext);

/** Ставка, тыс.: «104,9» на руки, «143» для компании. */
export function Rate({ rub }: { rub: number }) {
  const k = useK();
  return <Money className="tabular-nums" value={fmtRate(rub, k)} />;
}

/** Сумма, тыс., целыми: «3 414». */
export function SumK({ rub }: { rub: number }) {
  const k = useK();
  return <Money className="tabular-nums" value={fmtSumK(rub * k)} />;
}

/** Миллионы: «3,41». */
export function Mln({ rub }: { rub: number }) {
  const k = useK();
  return <Money className="tabular-nums" value={fmtMln(rub * k)} />;
}

/** «+196 тыс.» — знак виден всегда, сумма прячется глазом. */
export function SignedSumK({ rub }: { rub: number }) {
  const sign = rub > 0 ? '+' : rub < 0 ? '−' : '';
  return (
    <span className="whitespace-nowrap">
      {sign}
      <SumK rub={Math.abs(rub)} /> тыс.
    </span>
  );
}

// ─── Подсказки и раскрытие ────────────────────────────────────────────

/** Иконка «i» с хинтом. Зона наведения шире иконки — псевдоэлементом. */
export function Info({
  text,
  align = 'left',
  maxWidth = 300,
}: {
  text: ReactNode;
  align?: 'left' | 'center' | 'right';
  maxWidth?: number;
}) {
  return (
    <Tooltip portal text={text} maxWidth={maxWidth} align={align}>
      <span
        className="relative text-ash hover:text-stone cursor-help transition-colors duration-150
                   before:absolute before:-inset-2 before:content-['']"
      >
        <InfoIcon className="w-3.5 h-3.5" />
      </span>
    </Tooltip>
  );
}

/**
 * Вторичная строка подсказки: как показатель называется в табличке
 * («Дэшборд 2026»: ГПЗП, ССЗП…). В подписях — простые слова, сокращение —
 * только здесь.
 */
export function SheetTerm({ term }: { term: string }) {
  return <span className="block mt-1 text-ash">В табличке — {term}</span>;
}

/** «−» в геометрии PlusIcon — как в «Функционале». */
function MinusGlyph() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M5 11H19V13H5V11Z" />
    </svg>
  );
}

/** Кнопка раскрытия «+ / −» с кросс-фейдом — как в карточках «Функционала». */
export function ToggleButton({
  open,
  label,
  controls,
  onClick,
}: {
  open: boolean;
  label: string;
  controls?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const glyph = (shown: boolean, child: ReactNode) => (
    <span
      aria-hidden
      className={`absolute inset-0 flex items-center justify-center
                  transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]
                  ${shown ? 'opacity-100 scale-100 blur-0' : 'opacity-0 scale-[0.25] blur-[4px]'}`}
    >
      {child}
    </span>
  );
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={label}
      className="relative w-8 h-8 shrink-0 rounded-pill bg-ink/5 text-stone
                 group-hover:bg-ink/10 group-hover:text-ink hover:bg-ink/10 hover:text-ink active:scale-[0.96]
                 transition-[background-color,color,transform] duration-150 ease-out"
    >
      {glyph(!open, <PlusIcon className="w-4 h-4" />)}
      {glyph(open, <MinusGlyph />)}
    </button>
  );
}

/**
 * Раскрытие через grid-rows 0fr → 1fr — переход прерывается на полпути,
 * как в «Функционале». Закрытое содержимое — inert: не ловит фокус и Tab.
 */
export function Collapse({ open, id, children }: { open: boolean; id?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (ref.current) (ref.current as HTMLElement & { inert: boolean }).inert = !open;
  }, [open]);
  return (
    <div
      ref={ref}
      id={id}
      aria-hidden={open ? undefined : true}
      className="grid transition-[grid-template-rows] duration-[250ms] ease-out"
      style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

// ─── Чипы и подписи ───────────────────────────────────────────────────

export const DEPT_LABEL: Record<EconDept, string> = {
  navigator: 'Импрув',
  visioner: 'Криэйт',
  creator: 'Инхаус',
  leads: 'Лиды',
};

// Цвет отдела — тот же, что у точки билда в лидерборде
const DEPT_COLOR: Record<EconDept, string> = {
  creator: '#00ca48',
  visioner: '#7c3aed',
  navigator: '#0ea5e9',
  leads: 'rgb(var(--c-stone))',
};

export function DeptChip({ dept }: { dept: EconDept | null }) {
  if (!dept) return <span className="text-ash text-xs">Без отдела</span>;
  return (
    <span className="chip-build">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: DEPT_COLOR[dept] }} />
      {DEPT_LABEL[dept]}
    </span>
  );
}

export function LevelName({ level, label }: { level: EconLevel | null; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-display text-sm font-medium tracking-tight whitespace-nowrap">
      {level === 'stardiz' && <StarIcon className="w-3.5 h-3.5 shrink-0 text-violet" />}
      {label}
    </span>
  );
}

export function InitiatorChip({ initiator }: { initiator: Initiator | null }) {
  const size = 'h-5 px-2 py-0 text-[10px] leading-none whitespace-nowrap';
  if (initiator === 'company') return <span className={`chip-info ${size}`}>Компания</span>;
  if (initiator === 'employee') return <span className={`chip-neutral ${size}`}>Сотрудник</span>;
  return <span className={`chip-neutral ${size} text-ash`}>Не указан</span>;
}
