'use client';

import { useEffect, useId, type ReactNode } from 'react';
import { isCommentsLayerOpen, isFromCommentsLayer } from '@/lib/commentsLayer';

/**
 * Подтверждения вместо нативного confirm() (он в некоторых браузерах молча
 * не срабатывал). Два вида с одними кнопками:
 *  • ConfirmDialog — модальное окно поверх страницы: затемнение, snow,
 *    rounded-modal, как поп-ап 360 (передача человека другому лиду);
 *  • InlineConfirm — строка на месте действия: вопрос и «Отмена · Удалить»
 *    (удаление в комментариях, «Опасная зона» модалки «Изменить»).
 *
 * Рисуются там, где их поставили, без портала: внутри слоя комментариев
 * подтверждение остаётся в слое, и клик по нему для поп-апов страницы не
 * «мимо» (lib/commentsLayer).
 */

type Tone = 'primary' | 'danger';

const DENSITY = {
  /** Обычные btn-sm — модалки. */
  regular: { button: '', message: '' },
  /** 32 px — низ карточки треда. */
  compact: { button: 'h-8 py-0', message: 'text-[13px] pl-1' },
  /** 28 px — под ответом в треде. */
  tight: { button: 'h-7 py-0', message: 'text-xs' },
} as const;

/**
 * Строка подтверждения: вопрос слева (если есть), «Отмена» и действие
 * справа. Escape здесь не ловится — он у того, кто строку показал: в слое
 * комментариев — общий стек useEscape, на странице — свой обработчик.
 */
export function InlineConfirm({
  message,
  confirmLabel,
  pendingLabel,
  cancelLabel = 'Отмена',
  tone = 'danger',
  density = 'regular',
  pending = false,
  confirmDisabled = false,
  cancelDisabled = false,
  focusCancel = false,
  className = '',
  onConfirm,
  onCancel,
}: {
  message?: ReactNode;
  confirmLabel: string;
  /** Подпись действия, пока идёт запрос («Удаляю…»). */
  pendingLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  density?: keyof typeof DENSITY;
  /** Идёт запрос: действие заблокировано (отмену блокирует cancelDisabled). */
  pending?: boolean;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  /** Фокус на «Отмене» при появлении — для необратимого, что нельзя отыграть. */
  focusCancel?: boolean;
  /** Ряд: отступы и выравнивание по месту (gap, justify, mt). */
  className?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const d = DENSITY[density];
  // В плотных рядах у отмены — отклик на нажатие, как у кнопок слоя комментариев
  const press = density === 'regular' ? '' : 'active:scale-[0.96]';
  return (
    <div className={`flex items-center ${className}`}>
      {message != null && <span className={`text-ink mr-auto ${d.message}`}>{message}</span>}
      <button
        type="button"
        autoFocus={focusCancel}
        onClick={onCancel}
        disabled={cancelDisabled}
        className={`btn-ghost btn-sm ${d.button} ${press}`}
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={pending || confirmDisabled}
        className={`${tone === 'danger' ? 'btn-danger' : 'btn-primary'} btn-sm ${d.button}`}
      >
        {pending && pendingLabel ? pendingLabel : confirmLabel}
      </button>
    </div>
  );
}

/**
 * Модальное подтверждение. Escape и клик по затемнению — отмена (пока не
 * идёт запрос). Пока в слое комментариев что-то открыто, Escape — его, а клик
 * из слоя — не «мимо». Фокус — на «Отмене»: подтверждают обычно то, что
 * самому не отыграть.
 */
export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  tone = 'primary',
  pending = false,
  onConfirm,
  onCancel,
}: {
  title: ReactNode;
  /** Пояснение под заголовком. */
  children?: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const textId = useId();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending && !isCommentsLayerOpen()) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[20vh]">
      <div
        className="absolute inset-0 bg-black/60 animate-fade-in"
        onClick={(e) => {
          if (!pending && !isFromCommentsLayer(e.nativeEvent)) onCancel();
        }}
        aria-hidden
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children != null ? textId : undefined}
        className="relative w-full max-w-[420px] bg-snow rounded-modal shadow-soft-lg p-6 animate-scale-in"
      >
        <h2 id={titleId} className="font-display text-xl font-medium tracking-tight">
          {title}
        </h2>
        {children != null && (
          <p id={textId} className="text-sm text-stone mt-2 leading-relaxed">
            {children}
          </p>
        )}
        <InlineConfirm
          className="justify-end gap-2 mt-5"
          confirmLabel={confirmLabel}
          pendingLabel={pendingLabel}
          cancelLabel={cancelLabel}
          tone={tone}
          pending={pending}
          cancelDisabled={pending}
          focusCancel
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}
