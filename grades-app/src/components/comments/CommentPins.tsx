'use client';

import type { ReactNode } from 'react';
import Tooltip from '@/components/Tooltip';
import { PlusIcon } from '@/components/icons';
import type { ViewRect } from '@/lib/commentAnchor';
import type { CommentStatus } from './types';

/** Слои: метки — над поп-апами страницы (z-50), но под карточками слоя. */
export const Z = {
  pins: 'z-[70]',
  pinActive: 'z-[71]',
  button: 'z-[72]',
  popover: 'z-[74]',
  card: 'z-[76]',
  /** Снимок места целиком — поверх карточки, под хинтами. */
  lightbox: 'z-[80]',
  overlay: 'z-[90]',
  /** Хинты слоя — поверх его карточек (у Tooltip по умолчанию z-60). */
  tip: '!z-[95]',
} as const;

/** Размер метки, px. Хвостик «капли» — левый нижний угол, он и есть точка. */
export const PIN = 24;

/**
 * Метка-«капля», как в Figma: круг 24px с острым левым нижним углом,
 * номер треда внутри. Открытый — лайм, решённый — приглушённый. Обводка
 * цветом поверхности отделяет метку от любого фона под ней.
 */
export function PinShape({
  status,
  selected = false,
  children,
}: {
  status: CommentStatus | 'draft';
  /** Выбранная метка — обводка контрастным цветом вместо цвета поверхности. */
  selected?: boolean;
  children?: ReactNode;
}) {
  const tone = status === 'resolved' ? 'bg-stone text-snow' : 'bg-lime text-black';
  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 shrink-0
                  rounded-[12px_12px_12px_3px] ring-2 shadow-soft-md
                  text-[11px] font-medium leading-none tabular-nums ${tone}
                  ${selected ? 'ring-ink' : 'ring-snow'}`}
    >
      {children}
    </span>
  );
}

/** Метка треда на странице: кнопка, по клику — карточка треда. */
export function CommentPin({
  id,
  number,
  status,
  x,
  y,
  selected,
  preview,
  onClick,
}: {
  id: number;
  number: number;
  status: CommentStatus;
  x: number;
  y: number;
  selected: boolean;
  /** Хинт по ховеру: автор и начало текста. Пока карточка открыта — нет. */
  preview: string | null;
  onClick: () => void;
}) {
  return (
    <Tooltip
      portal
      text={selected ? null : preview}
      maxWidth={260}
      tipClassName={Z.tip}
      className={`fixed ${selected ? Z.pinActive : Z.pins}`}
      // Хвостик — ровно в точке: метка стоит над ней и правее
      style={{ left: x, top: y - PIN }}
    >
      <button
        type="button"
        data-comment-pin={id}
        onClick={onClick}
        aria-label={`Комментарий ${number}`}
        aria-expanded={selected}
        className={`relative block rounded-[12px_12px_12px_3px] origin-bottom-left
                    transition-transform duration-150 ease-out hover:scale-[1.08] active:scale-[0.96]
                    before:absolute before:-inset-1 before:content-['']
                    ${selected ? 'scale-[1.12]' : ''}`}
      >
        <PinShape status={status} selected={selected}>
          {number}
        </PinShape>
      </button>
    </Tooltip>
  );
}

/** Пунктирная рамка комментария-рамки. Клики не ловит — под ней страница. */
export function RectOutline({
  rect,
  status,
  selected,
}: {
  rect: ViewRect;
  status: CommentStatus | 'draft';
  selected: boolean;
}) {
  const tone =
    status === 'resolved'
      ? 'border-stone/60'
      : selected || status === 'draft'
        ? 'border-lime-dark bg-lime/10'
        : 'border-lime-dark/70';
  return (
    <div
      aria-hidden
      className={`fixed pointer-events-none rounded-[4px] border-[1.5px] border-dashed ${Z.pins} ${tone}`}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    />
  );
}

/** Метка нового комментария, пока его пишут. */
export function DraftPin({ x, y }: { x: number; y: number }) {
  return (
    <span aria-hidden className={`fixed pointer-events-none ${Z.pinActive}`} style={{ left: x, top: y - PIN }}>
      <PinShape status="draft">
        <PlusIcon className="w-3.5 h-3.5" />
      </PinShape>
    </span>
  );
}
