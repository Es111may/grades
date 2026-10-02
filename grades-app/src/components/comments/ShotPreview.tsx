'use client';

// Снимки отдаёт свой роут с долгим кэшем — оптимизация next/image не нужна
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef } from 'react';
import { CloseIcon } from '@/components/icons';
import type { UiCommentShotDto } from '@/lib/uiCommentsShared';
import { Z } from './CommentPins';
import { useEscape } from './useEscape';

// Снимок места комментария (lib/commentShot): превью в карточке треда,
// миниатюра в строке списка и просмотр целиком. Картинка — по ссылке с
// версией (кэш на год), w/h — её размер: место под неё отведено до загрузки.
// Обводка картинок — общий класс img-outline (globals.css).

const ALT = 'Снимок места комментария';

/**
 * Превью в карточке треда: до 160 px по высоте, во всю ширину колонки
 * текста, пропорции снимка. Скругление 6 px — концентрично карточке
 * (22 px − поле 16 px). Клик — снимок целиком.
 */
export function ShotThumb({ shot, onOpen }: { shot: UiCommentShotDto; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Открыть снимок целиком"
      className="mt-2 block max-w-full rounded-[6px] cursor-zoom-in hover:opacity-90 transition-opacity duration-150"
    >
      <img
        src={shot.url}
        width={shot.w}
        height={shot.h}
        loading="lazy"
        decoding="async"
        alt={ALT}
        className="block w-auto h-auto max-w-full max-h-40 rounded-[6px] bg-ink/[0.04] img-outline"
      />
    </button>
  );
}

/** Миниатюра 40×28 справа в строке списка — что снимок есть и о чём он. */
export function ShotChip({ shot }: { shot: UiCommentShotDto }) {
  return (
    <img
      src={shot.url}
      width={40}
      height={28}
      loading="lazy"
      decoding="async"
      alt=""
      className="w-10 h-7 shrink-0 rounded-[4px] object-cover bg-ink/[0.04] img-outline"
    />
  );
}

/** Поле вокруг снимка в просмотре, px. */
const LIGHTBOX_GAP = 40;

/**
 * Снимок целиком поверх всего. Живёт внутри слоя комментариев (рядом с
 * карточкой, не внутри неё — у карточки transform-анимация), поэтому клик
 * и Escape здесь не закрывают поп-ап страницы под слоем. Escape и клик мимо
 * картинки закрывают просмотр, карточка остаётся. Фокус — на «Закрыть»,
 * после — обратно на превью.
 *
 * Размер — как на экране автора: снимок снят с плотностью min(2, dpr),
 * делим на неё же (у смотрящего обычно такой же экран), и вписываем в окно.
 */
export function ShotLightbox({ shot, onClose }: { shot: UiCommentShotDto; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEscape(onClose, true);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    return () => prev?.focus?.({ preventScroll: true });
  }, []);

  const size = useMemo(() => {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const w = shot.w / ratio;
    const h = shot.h / ratio;
    const k = Math.min(
      1,
      (window.innerWidth - LIGHTBOX_GAP * 2) / w,
      (window.innerHeight - LIGHTBOX_GAP * 2) / h,
    );
    return { width: Math.round(w * k), height: Math.round(h * k) };
  }, [shot.w, shot.h]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ALT}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={`fixed inset-0 ${Z.lightbox} flex items-center justify-center bg-black/70 animate-fade-in`}
    >
      <img
        src={shot.url}
        width={shot.w}
        height={shot.h}
        alt={ALT}
        style={size}
        className="block rounded-[8px] bg-ink/[0.04] img-outline shadow-soft-lg"
      />
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Закрыть снимок"
        className="absolute top-4 right-4 w-10 h-10 rounded-pill flex items-center justify-center
                   text-white/80 hover:text-white hover:bg-white/10 active:scale-[0.96]
                   transition-[color,background-color,transform] duration-150 ease-out"
      >
        <CloseIcon className="w-5 h-5" />
      </button>
    </div>
  );
}
