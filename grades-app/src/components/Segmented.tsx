'use client';

import { Fragment, useRef, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Счётчик после подписи: у активного — stone, у остальных — ash. */
  count?: number;
  /** Нативная подсказка (title). */
  title?: string;
  /**
   * Обёртка пункта — например, хинт сервиса по ховеру:
   * `wrap: (item) => <Tooltip text="…">{item}</Tooltip>` («Для компании» в
   * «Экономике»). Функцией, а не готовым Tooltip внутри: иначе код хинта
   * ехал бы в First Load каждой страницы с сегментами.
   */
  wrap?: (item: ReactElement) => ReactNode;
};

/**
 * Сегментированный контрол — трек `.segmented` с пунктами `.segmented-item`
 * (globals.css). Один компонент на все переключатели сервиса: «Текущие ·
 * Все» и вид «Команды», вкладки «Функционала», «На руки · Для компании» и
 * «График · Таблица» «Экономики», «Эта страница · Все страницы» в
 * комментариях, «Активные · Архивные» скиллов, периоды перформанса.
 *
 *  • kind — семантика: 'radio' — фильтр или режим (radiogroup), 'tabs' —
 *    переключение вида (tablist). Внешне одинаковы.
 *  • size — 'default' (h-10, 13px — ряд контролов страницы) или 'compact'
 *    (h-8 трек, h-7 пункты 12px — шапки карточек и поповеров).
 *  • press — отклик нажатия scale(0.96). Пока не везде: включён там, где
 *    был до выноса в компонент.
 *  • onItemIntent — ховер/фокус пункта: намерение выбрать его (на «Команде»
 *    так заранее качается код вида).
 *
 * Клавиатура — как у радиогруппы и вкладок: в ряд Tab попадает один раз (на
 * выбранный пункт), стрелки и Home/End переходят и сразу выбирают. onChange
 * зовётся только при смене значения — повторный клик по выбранному ничего
 * не делает.
 */
export default function Segmented<T extends string>({
  value,
  options,
  onChange,
  kind = 'radio',
  size = 'default',
  label,
  press = false,
  className = '',
  itemClassName = '',
  onItemIntent,
}: {
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  kind?: 'radio' | 'tabs';
  size?: 'default' | 'compact';
  /** aria-label группы: «Кого показывать», «Суммы», «Вид». */
  label?: string;
  press?: boolean;
  /** Добавки трека (w-full). */
  className?: string;
  /** Добавки каждого пункта (flex-1 justify-center — пункты на всю ширину). */
  itemClassName?: string;
  onItemIntent?: (value: T) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabs = kind === 'tabs';
  const compact = size === 'compact';
  const selected = options.findIndex((o) => o.value === value);
  // Таб-стоп ряда — выбранный пункт; значения нет среди пунктов — первый
  const tabStop = selected >= 0 ? selected : 0;

  function pick(i: number) {
    const o = options[i];
    if (o && o.value !== value) onChange(o.value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const n = options.length;
    if (!n) return;
    const focused = refs.current.findIndex((el) => el === document.activeElement);
    const from = focused >= 0 ? focused : tabStop;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || (!tabs && e.key === 'ArrowDown')) next = (from + 1) % n;
    else if (e.key === 'ArrowLeft' || (!tabs && e.key === 'ArrowUp')) next = (from - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next === null) return;
    e.preventDefault();
    refs.current[next]?.focus();
    pick(next);
  }

  const itemBase = `segmented-item${compact ? ' h-7 px-3 text-xs' : ''}${
    press ? ' active:scale-[0.96] transition-[color,background-color,transform] duration-150' : ''
  }${itemClassName ? ` ${itemClassName}` : ''}`;

  return (
    <div
      role={tabs ? 'tablist' : 'radiogroup'}
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`segmented${compact ? ' h-8 p-0.5' : ''}${className ? ` ${className}` : ''}`}
    >
      {options.map((o, i) => {
        const active = i === selected;
        const item = (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role={tabs ? 'tab' : 'radio'}
            aria-selected={tabs ? active : undefined}
            aria-checked={tabs ? undefined : active}
            tabIndex={i === tabStop ? 0 : -1}
            title={o.title}
            onClick={() => pick(i)}
            onPointerEnter={onItemIntent ? () => onItemIntent(o.value) : undefined}
            onFocus={onItemIntent ? () => onItemIntent(o.value) : undefined}
            className={`${itemBase}${active ? ' segmented-item-active' : ''}`}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={`ml-1.5 tabular-nums ${active ? 'text-stone' : 'text-ash'}`}>{o.count}</span>
            )}
          </button>
        );
        return o.wrap ? <Fragment key={o.value}>{o.wrap(item)}</Fragment> : item;
      })}
    </div>
  );
}
