'use client';

/**
 * Единый хинт сервиса (Pavel: «хинты везде одинаковые по стилистике»):
 * светлая карточка-поповер по ховеру — стиль информера самооценки.
 * CSS-only (named group — не конфликтует с group острова/строк),
 * мгновенный показ, плавное появление, без нативного title.
 *
 * Использование:
 *   <Tooltip text="Подсказка" align="center"><button …/></Tooltip>
 */

import { type ReactNode, type CSSProperties } from 'react';

export default function Tooltip({
  text,
  children,
  className = '',
  align = 'left',
  /** Максимальная ширина поповера в px (ширина — по контенту). */
  maxWidth = 280,
  style,
}: {
  text: ReactNode;
  children: ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
  maxWidth?: number;
  style?: CSSProperties;
}) {
  const pos =
    align === 'center'
      ? 'left-1/2 -translate-x-1/2'
      : align === 'right'
        ? 'right-0'
        : 'left-0';
  return (
    <span className={`group/tt relative inline-flex ${className}`} style={style}>
      {children}
      {text != null && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute top-full mt-2 ${pos} z-40
                      card p-3 text-left text-xs text-stone leading-relaxed shadow-soft-lg
                      font-normal normal-case tracking-normal whitespace-normal break-words
                      [font-family:Onest,sans-serif]
                      opacity-0 translate-y-1 transition-all duration-150
                      group-hover/tt:opacity-100 group-hover/tt:translate-y-0`}
          style={{ maxWidth, width: 'max-content' }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
