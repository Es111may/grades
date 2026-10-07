'use client';

// Общие мелочи страницы «Экономика»: режим сумм, денежные подписи,
// подсказки, чипы. Раскрытие строк — общие ExpandToggle и Collapse
// (components/), те же, что в карточках «Функционала» и истории з/п.

import { createContext, useContext, type ReactNode } from 'react';
import Tooltip from '@/components/Tooltip';
import Money from '@/components/Money';
import { InfoIcon, StarIcon } from '@/components/icons';
import BuildChip from '@/components/BuildChip';
import { NEUTRAL_DOT } from '@/lib/buildTone';
import { BUILD_NAMES } from '@/lib/types';
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

// ─── Подсказки ────────────────────────────────────────────────────────

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

// ─── Чипы и подписи ───────────────────────────────────────────────────

// Отделы «Экономики» — коды билдов (названия — из BUILD_NAMES) и «Лиды»
export const DEPT_LABEL: Record<EconDept, string> = { ...BUILD_NAMES, leads: 'Лиды' };

// Цвет отдела — тот же, что у точки билда в лидерборде (lib/buildTone);
// у «Лидов» билда нет — нейтральная точка
export function DeptChip({ dept }: { dept: EconDept | null }) {
  if (!dept) return <span className="text-ash text-xs">Без отдела</span>;
  return <BuildChip code={dept} name={DEPT_LABEL[dept]} dot={dept === 'leads' ? NEUTRAL_DOT : undefined} />;
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
