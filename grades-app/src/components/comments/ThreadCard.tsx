'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ViewRect } from '@/lib/commentAnchor';
import { PinShape, Z } from './CommentPins';
import { ShotLightbox } from './ShotPreview';
import ThreadBody from './ThreadBody';
import type { CommentThread, CommentsViewer } from './types';
import { useEscape } from './useEscape';
import { useFloating } from './useFloating';

/**
 * Карточка треда у метки. Содержимое — ThreadBody (то же, что у треда
 * другой страницы в поповере): автор, дата, текст, ответы и поле ответа,
 * «Решено», «Скопировать ссылку» (адрес страницы с #comment-<id>, по нему
 * тред откроется сам), «Удалить». Снимок места — превью под текстом, клик
 * открывает его целиком (ShotLightbox, рядом с карточкой в слое).
 *
 * Позиция: у метки (useFloating, под ней или над ней), а если метки на
 * экране нет — `fallback`: например, слева от поповера списка; тогда
 * `hint` объясняет, где метка (в закрытом поп-апе, на странице под поп-апом).
 */
export default function ThreadCard({
  thread,
  number,
  viewer,
  anchor,
  fallbackStyle,
  hint,
  onClose,
  onChanged,
  onDeleted,
}: {
  thread: CommentThread;
  number: number | null;
  viewer: CommentsViewer;
  /** Прямоугольник метки (и рамки) на экране; null — метки не видно. */
  anchor: ViewRect | null;
  /** Где стоять, если метки не видно. */
  fallbackStyle: CSSProperties;
  /** Почему метки не видно (lib/commentAnchor, threadHint); null — видно. */
  hint: string | null;
  onClose: () => void;
  onChanged: (t: CommentThread) => void;
  onDeleted: (threadId: number, replyId?: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useFloating(ref, anchor);
  const [shotOpen, setShotOpen] = useState(false);

  useEscape(onClose, true);

  // Фокус — в карточку: Tab дальше идёт по её кнопкам
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [thread.id]);

  const style: CSSProperties = anchor
    ? { top: pos?.top ?? anchor.top, left: pos?.left ?? anchor.left }
    : fallbackStyle;

  return (
    <>
      <div
        ref={ref}
        role="dialog"
        aria-label={number ? `Комментарий ${number}` : 'Комментарий'}
        tabIndex={-1}
        className={`fixed ${Z.card} w-[340px] max-h-[min(72vh,560px)] flex flex-col
                    card shadow-soft-lg outline-none animate-scale-in origin-top-left`}
        style={style}
      >
        <ThreadBody
          thread={thread}
          viewer={viewer}
          variant="card"
          start={number != null && <PinShape status={thread.status}>{number}</PinShape>}
          hint={hint}
          onClose={onClose}
          onOpenShot={() => setShotOpen(true)}
          onChanged={onChanged}
          onDeleted={onDeleted}
        />
      </div>
      {/* Рядом с карточкой, а не внутри: у карточки transform-анимация, и
          fixed-просмотр встал бы относительно неё */}
      {shotOpen && thread.screenshot && (
        <ShotLightbox shot={thread.screenshot} onClose={() => setShotOpen(false)} />
      )}
    </>
  );
}
