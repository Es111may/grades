'use client';

/**
 * Простой CSS-tooltip без задержки появления.
 *
 * Native `title=""` ждёт ~1 сек перед показом — Pavel'у это медленно для
 * информеров на графиках. Здесь — мгновенный показ через group-hover.
 *
 * Использование:
 *   <Tooltip text="Длинный текст подсказки">
 *     <InfoIcon />
 *   </Tooltip>
 *
 * Tooltip появляется СНИЗУ от триггера, прижатый к левому краю. Для
 * заголовков графиков это нормально — иконка обычно в начале строки.
 * Если хочется правее/выше — можно прокинуть `placement` (пока не нужно).
 */

import { type ReactNode } from 'react';

export default function Tooltip({
  text,
  children,
  className = '',
  /** Максимальная ширина tooltip-bubble в px. */
  maxWidth = 280,
}: {
  text: string;
  children: ReactNode;
  className?: string;
  maxWidth?: number;
}) {
  return (
    <span className={`group relative inline-flex ${className}`}>
      {children}
      <span
        className="pointer-events-none invisible group-hover:visible
                   absolute top-full left-0 mt-2 z-30
                   bg-ink text-snow text-xs leading-relaxed
                   rounded-card px-3 py-2 shadow-soft
                   whitespace-normal break-words"
        style={{ maxWidth, width: 'max-content' }}
      >
        {text}
      </span>
    </span>
  );
}
