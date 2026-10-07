'use client';

import { useCallback, type ReactNode } from 'react';

/**
 * Раскрытие блока: grid-rows 0fr → 1fr. Переход прерываемый (повторный клик
 * на полпути разворачивает его обратно), высоту содержимого знать не нужно.
 * Так раскрываются карточки «Функционала», строки «Экономики» и история з/п.
 *
 * Свёрнутое содержимое остаётся в DOM ради анимации, но не ловит фокус, Tab
 * и поиск по странице: inert и aria-hidden. inert — через DOM: React 18 не
 * знает этот атрибут и булево значение в разметку не пишет. Callback-ref, а
 * не эффект: атрибут встаёт в том же коммите, что и сам блок (история з/п
 * появляется позже родителя — когда придут данные).
 */
export default function Collapse({
  open,
  id,
  className = '',
  innerClassName = '',
  onClosed,
  children,
}: {
  open: boolean;
  /** Для aria-controls у кнопки раскрытия. */
  id?: string;
  /** Внешняя обёртка-сетка: например, -mt-3, гасящий gap родителя. */
  className?: string;
  /** Обрезка (overflow-hidden): например, поля, за которые выходит подложка. */
  innerClassName?: string;
  /** Свёртка доиграла — можно убрать то, что внутри больше не видно. */
  onClosed?: () => void;
  children: ReactNode;
}) {
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) el.inert = !open;
    },
    [open],
  );

  return (
    <div
      ref={ref}
      id={id}
      aria-hidden={open ? undefined : true}
      className={`${className} grid transition-[grid-template-rows] duration-[250ms] ease-out`}
      style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      onTransitionEnd={
        onClosed
          ? (e) => {
              // transitionend всплывает и от детей (цвет кнопок) — только свой
              if (e.target === e.currentTarget && !open) onClosed();
            }
          : undefined
      }
    >
      <div className={`min-h-0 overflow-hidden ${innerClassName}`}>{children}</div>
    </div>
  );
}
