'use client';

/**
 * Сумма в рублях, которую прячет кнопка-глаз в шапке («Скрыть зарплаты»,
 * html[data-salary='hidden']). Значение — внутри .salary-sensitive, на его
 * месте при скрытии — «•••» (.salary-hidden-only). Прячет CSS, поэтому
 * первая отрисовка уже правильная и гидрации нечего ломать.
 *
 * Оборачивать только саму сумму: единицы («тыс.», «млн»), проценты,
 * численность и знак остаются видны.
 *
 *   <Money value={fmtRate(salary)} /> тыс.
 *
 * Для canvas (chart.js), куда CSS не дотягивается, — useSalaryHidden().
 */

import { useSyncExternalStore, type ReactNode } from 'react';

export const MONEY_PLACEHOLDER = '•••';

export default function Money({
  value,
  className = '',
  placeholder = MONEY_PLACEHOLDER,
}: {
  value: ReactNode;
  className?: string;
  placeholder?: string;
}) {
  return (
    <span className={className}>
      <span className="salary-sensitive">{value}</span>
      <span className="salary-hidden-only">
        <span aria-hidden>{placeholder}</span>
        <span className="sr-only">Сумма скрыта</span>
      </span>
    </span>
  );
}

function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-salary'] });
  return () => mo.disconnect();
}

const getHidden = () => document.documentElement.getAttribute('data-salary') === 'hidden';

/** Скрыты ли зарплаты — для JS-потребителей (оси и подписи chart.js). SSR — «видны». */
export function useSalaryHidden(): boolean {
  return useSyncExternalStore(subscribe, getHidden, () => false);
}
