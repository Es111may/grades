'use client';

import { useRef, useState } from 'react';
import type { ViewRect } from '@/lib/commentAnchor';
import CommentField from './CommentField';
import { Z } from './CommentPins';
import { useEscape } from './useEscape';
import { useFloating } from './useFloating';

/**
 * Новый комментарий у только что поставленной отметки: поле с фокусом,
 * «Отправить» / «Отмена». Enter — отправить, Shift+Enter — новая строка,
 * Escape — отмена. Карточка едет за отметкой при скролле (anchor — её
 * текущий прямоугольник).
 */
export default function CommentComposer({
  anchor,
  onSubmit,
  onCancel,
  textRef,
}: {
  anchor: ViewRect;
  onSubmit: (text: string) => Promise<void>;
  onCancel: () => void;
  /** Текст наружу — клик мимо не закрывает карточку, если в ней что-то написано. */
  textRef: { current: string };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useFloating(ref, anchor);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  textRef.current = text;

  useEscape(onCancel, true);

  async function send() {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось отправить комментарий');
      setSending(false);
    }
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Новый комментарий"
      className={`fixed ${Z.card} w-[320px] card shadow-soft-lg p-3 animate-scale-in origin-top-left`}
      // Без visibility: hidden до расчёта — скрытое поле не берёт фокус.
      // Позиция встаёт в layout-эффекте, до первой отрисовки.
      style={{ top: pos?.top ?? anchor.top, left: pos?.left ?? anchor.left }}
    >
      <CommentField
        value={text}
        onChange={setText}
        onSubmit={send}
        placeholder="Комментарий"
        autoFocus
        disabled={sending}
      />
      {error && (
        <p role="alert" className="text-xs text-blaze mt-2 px-1">
          {error}
        </p>
      )}
      <div className="flex items-center gap-1.5 mt-2">
        <span className="text-[11px] text-ash px-1 mr-auto">Enter — отправить</span>
        <button
          type="button"
          onClick={onCancel}
          className="btn-ghost btn-sm h-8 py-0 active:scale-[0.96]"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() || sending}
          className="btn-accent btn-sm h-8 py-0"
        >
          {sending ? 'Отправляем…' : 'Отправить'}
        </button>
      </div>
    </div>
  );
}
