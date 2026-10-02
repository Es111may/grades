'use client';

import { useEffect, useRef, useState } from 'react';
import type { CommentAnchor } from '@/lib/commentAnchor';
import { isInCommentsLayer } from '@/lib/commentsLayer';
import { measureAnchor, resetAnchorCaches, type AnchorGeom } from './anchorDom';

export type AnchorEntry = { key: string; anchor: CommentAnchor | null };

/** Подпись геометрии — чтобы не перерисовывать слой, когда ничего не сдвинулось. */
function signature(map: Map<string, AnchorGeom>): string {
  let s = '';
  map.forEach((g, k) => {
    s += `${k}:${g.status}:${g.x},${g.y}`;
    if (g.clip) s += `:${Math.round(g.clip.left)},${Math.round(g.clip.top)},${Math.round(g.clip.width)},${Math.round(g.clip.height)}`;
    if (g.rect) s += `:${g.rect.width}x${g.rect.height}`;
    s += '|';
  });
  return s;
}

/**
 * Где сейчас отметки на экране. Пересчёт — не чаще кадра: скролл любого
 * контейнера, ресайз, рост документа (ResizeObserver), вставка и удаление
 * узлов (MutationObserver childList — дёшево, атрибуты не слушаем), конец
 * CSS-анимаций и переходов, клик (раскрытия, переключатели). Подстраховка —
 * раз в секунду, пока вкладка видна. Свои узлы слоя мутациями не считаем —
 * иначе отрисовка меток запускала бы пересчёт по кругу.
 */
export function useAnchorGeoms(entries: AnchorEntry[], active: boolean): Map<string, AnchorGeom> {
  const [geoms, setGeoms] = useState<Map<string, AnchorGeom>>(() => new Map());
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const sigRef = useRef('');
  const scheduleRef = useRef<() => void>(() => {});

  // Ключи изменились (новый тред, другой фильтр) — пересчитать сразу
  const keys = entries.map((e) => e.key).join(',');
  useEffect(() => {
    scheduleRef.current();
  }, [keys]);

  useEffect(() => {
    if (!active) {
      sigRef.current = '';
      setGeoms(new Map());
      return;
    }
    let raf = 0;
    const run = () => {
      raf = 0;
      const next = new Map<string, AnchorGeom>();
      for (const e of entriesRef.current) next.set(e.key, measureAnchor(e.anchor));
      const sig = signature(next);
      if (sig === sigRef.current) return;
      sigRef.current = sig;
      setGeoms(next);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(run);
    };
    scheduleRef.current = schedule;

    const ro = new ResizeObserver(schedule);
    ro.observe(document.documentElement);
    const mo = new MutationObserver((records) => {
      if (records.every((r) => isInCommentsLayer(r.target))) return;
      resetAnchorCaches();
      schedule();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener('scroll', schedule, opts);
    window.addEventListener('resize', schedule);
    document.addEventListener('transitionend', schedule, opts);
    document.addEventListener('animationend', schedule, opts);
    document.addEventListener('click', schedule, opts);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') schedule();
    }, 1000);
    schedule();

    return () => {
      cancelAnimationFrame(raf);
      scheduleRef.current = () => {};
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('scroll', schedule, opts);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('transitionend', schedule, opts);
      document.removeEventListener('animationend', schedule, opts);
      document.removeEventListener('click', schedule, opts);
      window.clearInterval(timer);
    };
  }, [active]);

  return geoms;
}
