'use client';

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { UI_COMMENT_LIMITS } from '@/lib/uiCommentsShared';

/**
 * Поле комментария: растёт по тексту до 6 строк, Enter — отправить,
 * Shift+Enter — новая строка. Escape не трогаем — его ловит стек слоя
 * (useEscape) и закрывает то, что открыто последним. Одно поле на все
 * места: новый комментарий, ответ, правка.
 */
type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Подпись для скринридера, если placeholder не описывает поле. */
  label?: string;
  className?: string;
};

// Строка 20px + поля 9px и рамка 1px: одна строка — ровно 40px, как у
// кнопок рядом (h-10 — высота контролов сервиса). Больше 6 строк — скролл.
const MAX_HEIGHT = 6 * 20 + 18 + 2;

const CommentField = forwardRef<HTMLTextAreaElement, Props>(function CommentField(
  { value, onChange, onSubmit, placeholder, autoFocus, disabled, label, className = '' },
  outerRef,
) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(outerRef, () => ref.current as HTMLTextAreaElement);

  // Высота по содержимому: сбросить и взять scrollHeight, до отрисовки
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, MAX_HEIGHT)}px`;
  }, [value]);

  // Фокус в конец текста: при правке курсор встаёт после последнего слова
  useLayoutEffect(() => {
    const el = ref.current;
    if (!autoFocus || !el) return;
    el.focus({ preventScroll: true });
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [autoFocus]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      disabled={disabled}
      maxLength={UI_COMMENT_LIMITS.textMax}
      placeholder={placeholder}
      aria-label={label ?? placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          if (value.trim()) onSubmit();
        }
      }}
      // ! — у textarea.input в globals.css свои leading и py, они специфичнее утилит
      className={`input resize-none overflow-y-auto overscroll-contain text-sm !leading-5 !py-[9px] ${className}`}
    />
  );
});

export default CommentField;
