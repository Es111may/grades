'use client';

import { useRef, useState, type PointerEvent } from 'react';
import {
  classifyGesture,
  normalizeRect,
  type CommentAnchorKind,
  type Point,
  type ViewRect,
} from '@/lib/commentAnchor';
import { Z } from './CommentPins';
import { useEscape } from './useEscape';

/**
 * Режим постановки: прозрачный слой на всё окно поверх всего (и поп-апов
 * страницы), курсор-прицел. Клик — точка, протяжка от 4px — рамка
 * (пунктир по ходу). Мышью; Escape и правый клик — отмена. Колесо мыши
 * прокручивает страницу и в этом режиме.
 *
 * onPlace вызывается, пока слой ещё в DOM: элемент под отметкой ищут
 * через elementsFromPoint, слой отсекается как часть интерфейса
 * комментариев (data-comments-ui у корня).
 */
export default function PlacementOverlay({
  onPlace,
  onCancel,
}: {
  onPlace: (kind: CommentAnchorKind, selection: ViewRect) => void;
  onCancel: () => void;
}) {
  const start = useRef<Point | null>(null);
  const [drag, setDrag] = useState<ViewRect | null>(null);

  useEscape(onCancel, true);

  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY };
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const s = start.current;
    if (!s) return;
    const p = { x: e.clientX, y: e.clientY };
    setDrag(classifyGesture(s, p) === 'rect' ? normalizeRect(s, p) : null);
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    const s = start.current;
    if (!s) return;
    start.current = null;
    setDrag(null);
    const p = { x: e.clientX, y: e.clientY };
    const kind = classifyGesture(s, p);
    onPlace(kind, kind === 'rect' ? normalizeRect(s, p) : { left: s.x, top: s.y, width: 0, height: 0 });
  }

  return (
    <>
      <div
        className={`fixed inset-0 ${Z.overlay} cursor-crosshair select-none touch-none`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          start.current = null;
          setDrag(null);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onCancel();
        }}
      >
        {drag && (
          <div
            aria-hidden
            className="absolute rounded-[4px] border-[1.5px] border-dashed border-lime-dark bg-lime/10"
            style={{ left: drag.left, top: drag.top, width: drag.width, height: drag.height }}
          />
        )}
      </div>
      {/* Подсказка — под островом шапки, клики проходят сквозь неё */}
      <div
        role="status"
        className={`fixed top-[84px] left-1/2 -translate-x-1/2 ${Z.overlay} pointer-events-none
                    card rounded-pill shadow-soft-lg h-10 px-4 flex items-center
                    text-[13px] text-ink whitespace-nowrap animate-fade-in`}
      >
        Кликни, чтобы поставить точку, или протяни рамку
        <span className="text-stone">&nbsp;· Esc — отмена</span>
      </div>
    </>
  );
}
