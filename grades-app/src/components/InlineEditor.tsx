'use client';

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { isFromCommentsLayer } from '@/lib/commentsLayer';

/**
 * Инлайн-редактор: карточка встаёт на место строки в поп-апе — заголовок,
 * поля, ошибка, «Сохранить» / «Отмена». Так устроены дата грейдирования
 * (GradingDateEditor), плановый пересмотр (PlannedRow) и премия (BonusForm
 * в SalaryBlock). Поля и логика сохранения — у вызывающего, здесь оболочка
 * и поведение.
 *
 * Клавиатура:
 *  • Enter в поле ввода — сохранить (submitOnEnter={false} — выключить);
 *    Enter на кнопке — её собственный клик;
 *  • Escape — отмена, и дальше не всплывает: поп-ап под редактором не
 *    закрывается вместе с ним. preventDefault — ещё и метка для оконных
 *    обработчиков поп-апов (они пропускают defaultPrevented). Пока идёт
 *    сохранение, Escape гасится, но не отменяет;
 *  • событие из слоя комментариев — не наше (lib/commentsLayer).
 *
 * Фокус: при открытии — в первое поле (autoFocus — задержка в мс, если
 * редактор раскрывается анимацией: пока панель свёрнута, браузер прокрутил
 * бы overflow-hidden к полю и сбил анимацию). Закрылся — returnFocus():
 * элемент, с которого продолжать с клавиатуры (строка, кнопка «История»).
 */
export default function InlineEditor({
  title,
  fieldId,
  children,
  error,
  onSave,
  onCancel,
  saveLabel = 'Сохранить',
  cancelLabel = 'Отмена',
  pending = false,
  canSave = true,
  submitOnEnter = true,
  actions,
  framed = true,
  autoFocus = true,
  returnFocus,
}: {
  title: ReactNode;
  /** id поля, которое подписывает заголовок: тогда заголовок — его label. */
  fieldId?: string;
  /** Поля и подсказки — между заголовком и ошибкой. */
  children: ReactNode;
  error?: string | null;
  onSave: () => void;
  onCancel: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  /** Идёт сохранение: кнопки заблокированы, Escape не отменяет. */
  pending?: boolean;
  /** false — сохранять нечего (пустое поле): «Сохранить» и Enter молчат. */
  canSave?: boolean;
  submitOnEnter?: boolean;
  /** Справа в ряду кнопок — например, «Снять». */
  actions?: ReactNode;
  /** false — без своей рамки: редактор стоит на подложке (премия в истории). */
  framed?: boolean;
  /** true — фокус в первое поле сразу; число — через столько мс; false — не трогать. */
  autoFocus?: boolean | number;
  returnFocus?: () => HTMLElement | null | undefined;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Фокус — в первое поле, один раз при открытии
  useEffect(() => {
    if (autoFocus === false) return;
    const focusFirst = () =>
      rootRef.current?.querySelector<HTMLElement>('input, select, textarea')?.focus();
    if (autoFocus === true) {
      focusFirst();
      return;
    }
    const t = setTimeout(focusFirst, autoFocus);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Закрылся — фокус туда, откуда продолжать. Очистка эффекта идёт после
  // коммита: то, что встало на место редактора, уже в DOM и с ref-ами.
  const returnRef = useRef(returnFocus);
  returnRef.current = returnFocus;
  useEffect(() => () => returnRef.current?.()?.focus(), []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (isFromCommentsLayer(e.nativeEvent)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (!pending) onCancel();
    } else if (
      e.key === 'Enter' &&
      submitOnEnter &&
      !e.nativeEvent.isComposing &&
      e.target instanceof HTMLInputElement
    ) {
      // Только из поля: Enter на «Отмене» — её собственный клик
      e.preventDefault();
      if (!pending && canSave) onSave();
    }
  }

  return (
    <div
      ref={rootRef}
      role="group"
      aria-labelledby={titleId}
      className={`${framed ? 'rounded-card border border-cloud p-3 ' : ''}flex flex-col gap-2.5`}
      onKeyDown={onKeyDown}
    >
      {fieldId ? (
        <label id={titleId} htmlFor={fieldId} className="text-stone">
          {title}
        </label>
      ) : (
        <div id={titleId} className="text-stone">
          {title}
        </div>
      )}
      {children}
      {error && (
        <p role="alert" className="text-xs text-blaze">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={pending || !canSave}
          onClick={onSave}
        >
          {saveLabel}
        </button>
        <button type="button" className="btn-ghost" disabled={pending} onClick={onCancel}>
          {cancelLabel}
        </button>
        {actions}
      </div>
    </div>
  );
}
