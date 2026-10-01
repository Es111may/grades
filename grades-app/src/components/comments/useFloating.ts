'use client';

import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import type { ViewRect } from '@/lib/commentAnchor';
import { placeTooltip } from '@/lib/tooltipPlacement';

/** Отступ карточек слоя от краёв окна — шире, чем у хинта: они крупные. */
const EDGE = 12;

/**
 * Позиция плавающей карточки (тред, новый комментарий) у отметки: под ней,
 * а если снизу не влезает — над ней; по горизонтали — от левого края
 * отметки, внутрь окна. Геометрия — общий хелпер хинтов (placeTooltip).
 * Пересчёт — на каждый рендер (отметка едет со скроллом) и при смене
 * размера самой карточки (ответы, правка).
 */
export function useFloating(
  ref: RefObject<HTMLElement>,
  anchor: ViewRect | null,
): { top: number; left: number } | null {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [, bump] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const root = document.documentElement;
    const p = placeTooltip(
      {
        top: anchor.top,
        left: anchor.left,
        right: anchor.left + anchor.width,
        bottom: anchor.top + anchor.height,
      },
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: root.clientWidth, height: root.clientHeight },
      'left',
      8,
      EDGE,
    );
    setPos((prev) => (prev && prev.top === p.top && prev.left === p.left ? prev : { top: p.top, left: p.left }));
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => bump((n) => n + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return pos;
}
