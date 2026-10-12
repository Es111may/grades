'use client';

// Копирование в буфер с коротким откликом «Скопировано» — пароль в окне
// пароля, приглашение на самооценку в меню «⋯» поп-апа 360.

import { useCallback, useEffect, useState } from 'react';

/** Сколько держится отклик «Скопировано», мс. */
export const COPY_FEEDBACK_MS = 1600;

/**
 * Текст — в буфер. Clipboard API есть только в защищённом контексте (https,
 * localhost) и может отказать без разрешения — тогда старый путь через
 * выделение во временном поле. false — не вышло ни так, ни так.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // ниже — запасной путь
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export type CopyState = 'idle' | 'copied' | 'failed';

/**
 * copy(text) — скопировать; state — 'copied' / 'failed' на COPY_FEEDBACK_MS,
 * потом снова 'idle'. Повторное копирование продлевает отклик.
 */
export function useCopyFeedback(): { state: CopyState; copy: (text: string) => Promise<void> } {
  const [state, setState] = useState<CopyState>('idle');
  const [stamp, setStamp] = useState(0);
  useEffect(() => {
    if (state === 'idle') return;
    const t = window.setTimeout(() => setState('idle'), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(t);
  }, [state, stamp]);
  const copy = useCallback(async (text: string) => {
    const ok = await copyText(text);
    setState(ok ? 'copied' : 'failed');
    setStamp((n) => n + 1);
  }, []);
  return { state, copy };
}
