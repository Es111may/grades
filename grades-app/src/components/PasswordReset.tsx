'use client';

import { useState, type KeyboardEvent } from 'react';
import { useCopyFeedback } from '@/lib/clipboard';
import { CheckIcon } from '@/components/icons';

/**
 * Пароль для входа: сгенерировать или задать вручную и показать один раз —
 * POST /api/users/[id]/password (кто вправе — canIssuePassword из
 * lib/permissions, сервер проверяет им же). Три состояния: выбор → ручной
 * ввод → новый пароль на экране.
 *
 * Где живёт:
 *  • layout="row" — модалка «Изменить», в карточке «Пароль для входа»:
 *    текст слева, кнопки справа (вёрстка прежняя, попиксельно);
 *  • layout="stack" — окно из меню «⋯» поп-апа 360: колонка в 372px, кнопки
 *    под текстом справа, как в ConfirmDialog. Заголовок и «Для кого» — у
 *    окна; здесь onCancel («Отмена» в выборе) и onDone («Готово» после
 *    показа пароля) закрывают его, Enter в поле — «Сохранить».
 */
export default function PasswordReset({
  userId,
  email,
  layout = 'row',
  onCancel,
  onDone,
}: {
  userId: number;
  email: string;
  layout?: 'row' | 'stack';
  /** stack: «Отмена» в выборе — закрыть окно. */
  onCancel?: () => void;
  /** stack: «Готово» после показа пароля — закрыть окно. Без него — «Скрыть». */
  onDone?: () => void;
}) {
  const [mode, setMode] = useState<'idle' | 'manual' | 'shown'>('idle');
  const [manual, setManual] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { state: copyState, copy } = useCopyFeedback();
  const stack = layout === 'stack';

  async function setPassword(useManual: boolean) {
    if (useManual && manual.length < 8) {
      alert('Минимум 8 символов');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${userId}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(useManual ? { password: manual } : {}),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(`Ошибка: ${j.error ?? 'не получилось'}`);
        return;
      }
      setResult(j.password);
      setMode('shown');
      setManual('');
    } finally {
      setSaving(false);
    }
  }

  function hide() {
    if (onDone) {
      onDone();
      return;
    }
    setMode('idle');
    setResult(null);
  }

  function cancelManual() {
    setMode('idle');
    setManual('');
  }

  // Enter в поле — «Сохранить» (только в окне: в модалке «Изменить» поведение
  // поля прежнее)
  function onManualKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!stack || e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (!saving && manual.length >= 8) void setPassword(true);
  }

  const copyLabel =
    copyState === 'copied' ? 'Скопировано' : copyState === 'failed' ? 'Не скопировалось' : 'Скопировать';
  // В окне ручной ввод и пароль стоят под заголовком окна — отступ от него
  const stackGap = stack ? 'mt-4 ' : '';

  if (mode === 'shown' && result) {
    return (
      <div className={`${stackGap}space-y-3`}>
        <div className="text-sm">
          Новый пароль для <strong>{email}</strong>
        </div>
        <div className="bg-canvas border border-lime/40 rounded-card p-3 flex items-center justify-between gap-3">
          <code className="font-mono text-base select-all">{result}</code>
          {/* Отклик — как у «Позвать на самооценку» в меню поп-апа: зелёная
              галочка «Скопировано», красное «Не скопировалось» */}
          <button
            onClick={() => void copy(result)}
            className={`btn-ghost btn-sm ${
              copyState === 'copied' ? '!text-emerald' : copyState === 'failed' ? '!text-blaze' : ''
            }`}
            aria-live="polite"
          >
            {copyState === 'copied' && <CheckIcon className="w-3.5 h-3.5 -mr-1" />}
            {copyLabel}
          </button>
        </div>
        <p className="text-xs text-sunset">
          Пароль показан один раз — скопируй и отправь пользователю.
        </p>
        {stack ? (
          <div className="flex justify-end !mt-5">
            <button type="button" onClick={hide} className="btn-primary btn-sm">
              {onDone ? 'Готово' : 'Скрыть'}
            </button>
          </div>
        ) : (
          <button onClick={hide} className="btn-ghost btn-sm">
            Скрыть
          </button>
        )}
      </div>
    );
  }

  if (mode === 'manual') {
    return (
      <div className={`${stackGap}space-y-3`}>
        <input
          type="text"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={onManualKey}
          placeholder="Минимум 8 символов"
          className="input font-mono"
          autoFocus={stack}
          aria-label="Новый пароль"
        />
        {stack ? (
          <div className="flex justify-end gap-2 !mt-5">
            <button type="button" onClick={cancelManual} disabled={saving} className="btn-ghost btn-sm">
              Отмена
            </button>
            <button
              type="button"
              onClick={() => void setPassword(true)}
              disabled={saving || manual.length < 8}
              className="btn-accent btn-sm"
            >
              {saving ? 'Сохраняю…' : 'Сохранить'}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setPassword(true)}
              disabled={saving || manual.length < 8}
              className="btn-accent btn-sm"
            >
              {saving ? 'Сохраняю…' : 'Сохранить'}
            </button>
            <button onClick={cancelManual} disabled={saving} className="btn-ghost btn-sm">
              Отмена
            </button>
          </div>
        )}
      </div>
    );
  }

  const choice = (
    <>
      <button onClick={() => setMode('manual')} className="btn-secondary btn-sm">
        Задать вручную
      </button>
      <button onClick={() => setPassword(false)} disabled={saving} className="btn-accent btn-sm">
        {saving ? 'Генерирую…' : 'Сгенерировать'}
      </button>
    </>
  );

  if (stack) {
    // Выбор в окне: пояснение — под заголовком окна, «Отмена» — первой и в
    // фокусе (новый пароль сразу заменяет старый — отыграть нельзя)
    return (
      <>
        <p className="text-sm text-stone mt-2 leading-relaxed">
          Покажем один раз — отправь пользователю любым удобным каналом.
        </p>
        <div className="flex justify-end gap-2 mt-5">
          {onCancel && (
            <button type="button" autoFocus onClick={onCancel} disabled={saving} className="btn-ghost btn-sm">
              Отмена
            </button>
          )}
          {choice}
        </div>
      </>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="font-medium text-sm">Сгенерировать пароль или задать вручную</div>
        <div className="text-xs text-stone mt-1 leading-relaxed">
          Покажем один раз — отправь пользователю любым удобным каналом.
        </div>
      </div>
      <div className="flex gap-2 shrink-0">{choice}</div>
    </div>
  );
}
