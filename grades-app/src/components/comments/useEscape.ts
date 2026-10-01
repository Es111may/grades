'use client';

import { useEffect, useRef } from 'react';

// Escape слоя комментариев: стек обработчиков, срабатывает верхний — тот,
// что открыли последним (правка внутри карточки → карточка → поповер).
// Слушаем window на фазе захвата и гасим событие: слой живёт поверх поп-апов
// страницы, и без этого тот же Escape закрыл бы ещё и поп-ап 360 под ним.

type Entry = { current: () => void };
const stack: Entry[] = [];

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.isComposing || stack.length === 0) return;
  e.preventDefault();
  e.stopPropagation();
  stack[stack.length - 1].current();
}

export function useEscape(handler: () => void, enabled: boolean) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const entry: Entry = {
      get current() {
        return ref.current;
      },
    };
    if (stack.length === 0) window.addEventListener('keydown', onKey, true);
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0) window.removeEventListener('keydown', onKey, true);
    };
  }, [enabled]);
}
