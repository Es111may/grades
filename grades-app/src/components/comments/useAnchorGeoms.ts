'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommentAnchor } from '@/lib/commentAnchor';
import { isInCommentsLayer } from '@/lib/commentsLayer';
import { measureAnchor, resetAnchorCaches, type AnchorGeom } from './anchorDom';

export type AnchorEntry = { key: string; anchor: CommentAnchor | null };

/** Что ставим на место: метку (точка) или рамку (видимая часть). */
export type PlaceTarget = 'pin' | 'rect';

/**
 * Подпись того, что нужно React'у: какие метки есть, в каком слое, рисовать
 * ли их. Положение в неё не входит — его пишем в DOM сами (write). Исключение
 * — follow: у открытой карточки и нового комментария карточка едет за меткой
 * через React, ей нужно и положение.
 */
function structure(map: Map<string, AnchorGeom>, follow: Set<string>): string {
  let s = '';
  map.forEach((g, k) => {
    const found = g.status === 'missing' || g.status === 'hidden' ? g.status : 'found';
    s += `${k}:${found}:${g.mode}:${g.shown ? 1 : 0}:${g.place.clip ? 1 : 0}`;
    if (follow.has(k)) {
      s += `:${g.status}:${g.x},${g.y}`;
      if (g.rect) s += `:${g.rect.width}x${g.rect.height}`;
    }
    s += '|';
  });
  return s;
}

/** Пишем, только если значение другое: лишняя запись — лишняя отрисовка. */
function setPx(el: HTMLElement, prop: 'left' | 'top' | 'width' | 'height', v: number) {
  const s = `${v}px`;
  if (el.style[prop] !== s) el.style[prop] = s;
}

function write(el: HTMLElement, target: PlaceTarget, g: AnchorGeom | undefined) {
  if (!g) return;
  if (target === 'pin') {
    setPx(el, 'left', g.place.x);
    setPx(el, 'top', g.place.y);
    return;
  }
  const c = g.place.clip;
  if (!c) return;
  setPx(el, 'left', c.left);
  setPx(el, 'top', c.top);
  setPx(el, 'width', c.width);
  setPx(el, 'height', c.height);
}

/**
 * Где сейчас отметки. Пересчёт — не чаще кадра: скролл любого контейнера,
 * ресайз, рост документа (ResizeObserver), вставка и удаление узлов
 * (MutationObserver childList — дёшево, атрибуты не слушаем), конец
 * CSS-анимаций и переходов, клик (раскрытия, переключатели). Подстраховка —
 * раз в секунду, пока вкладка видна. Свои узлы слоя мутациями не считаем —
 * иначе отрисовка меток запускала бы пересчёт по кругу.
 *
 * Положение меток и рамок пишется прямо в DOM (bind — ref узла), в том же
 * кадре, где измерено: без перерисовки React и без отставания на кадр. Раньше
 * каждый кадр скролла шёл setState → рендер всего слоя в следующей задаче:
 * метки отставали от страницы до сотни пикселей, заезжали на остров шапки и
 * мигали у её края (Pavel, 02.10.2026). Метки страницы (mode page) стоят в
 * координатах документа, метки поп-апов — в координатах окна: скролл окна
 * не двигает ни те, ни другие (AnchorGeom.steady), и на нём слой не делает
 * ничего — ни замеров, ни записей. Пересчёт на кадре скролла окна — только
 * у follow и у якорей в sticky-контейнерах; полный — при скролле внутренних
 * контейнеров (поп-ап, таблица), сдвигах вёрстки и раз в секунду. React
 * перерисовывает слой, только когда меняется structure.
 */
export function useAnchorGeoms(
  entries: AnchorEntry[],
  active: boolean,
  follow: string[] = [],
): {
  geoms: Map<string, AnchorGeom>;
  bind: (key: string, target: PlaceTarget) => (el: HTMLElement | null) => void;
} {
  const [geoms, setGeoms] = useState<Map<string, AnchorGeom>>(() => new Map());
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const followKey = follow.join(',');
  const followRef = useRef(new Set<string>());
  followRef.current = new Set(follow);
  const sigRef = useRef('');
  const scheduleRef = useRef<() => void>(() => {});
  // Последний замер и узлы, которым пишем положение
  const latest = useRef(new Map<string, AnchorGeom>());
  const nodes = useRef(new Map<string, { el: HTMLElement; key: string; target: PlaceTarget }>());
  const refs = useRef(new Map<string, (el: HTMLElement | null) => void>());

  // ref узла метки или рамки. Новый узел получает положение сразу при
  // монтировании — до первой отрисовки, без кадра в углу экрана
  const bind = useCallback((key: string, target: PlaceTarget) => {
    const id = `${target}:${key}`;
    let cb = refs.current.get(id);
    if (!cb) {
      cb = (el: HTMLElement | null) => {
        if (!el) {
          nodes.current.delete(id);
          return;
        }
        nodes.current.set(id, { el, key, target });
        write(el, target, latest.current.get(key));
      };
      refs.current.set(id, cb);
    }
    return cb;
  }, []);

  // Ключи или follow изменились (новый тред, другой фильтр, открыли
  // карточку) — пересчитать сразу; ref'ы ушедших ключей — забыть
  const keys = entries.map((e) => e.key).join(',');
  useEffect(() => {
    const live = new Set(keys.split(','));
    refs.current.forEach((_, id) => {
      if (!live.has(id.slice(id.indexOf(':') + 1))) refs.current.delete(id);
    });
    scheduleRef.current();
  }, [keys, followKey]);

  useEffect(() => {
    if (!active) {
      sigRef.current = '';
      latest.current = new Map();
      setGeoms(new Map());
      return;
    }
    let raf = 0;
    // Нужен ли полный пересчёт; нет — только скролл окна с прошлого кадра
    let full = true;
    const run = () => {
      raf = 0;
      const all = full;
      full = false;
      const prev = latest.current;
      const next = new Map<string, AnchorGeom>();
      for (const e of entriesRef.current) {
        const was = prev.get(e.key);
        next.set(
          e.key,
          !all && was && was.steady && !followRef.current.has(e.key) ? was : measureAnchor(e.anchor),
        );
      }
      latest.current = next;
      nodes.current.forEach(({ el, key, target }) => write(el, target, next.get(key)));
      const sig = structure(next, followRef.current);
      if (sig === sigRef.current) return;
      sigRef.current = sig;
      setGeoms(next);
    };
    const schedule = () => {
      full = true;
      if (!raf) raf = requestAnimationFrame(run);
    };
    scheduleRef.current = schedule;
    // Скролл окна: кадр нужен, только если есть кого двигать
    const onScroll = (e: Event) => {
      if (e.target !== document) {
        schedule();
        return;
      }
      if (raf) return;
      let need = false;
      for (const en of entriesRef.current) {
        const g = latest.current.get(en.key);
        if (!g || !g.steady || followRef.current.has(en.key)) {
          need = true;
          break;
        }
      }
      if (need) raf = requestAnimationFrame(run);
    };

    const ro = new ResizeObserver(schedule);
    ro.observe(document.documentElement);
    const mo = new MutationObserver((records) => {
      if (records.every((r) => isInCommentsLayer(r.target))) return;
      resetAnchorCaches();
      schedule();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener('scroll', onScroll, opts);
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
      window.removeEventListener('scroll', onScroll, opts);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('transitionend', schedule, opts);
      document.removeEventListener('animationend', schedule, opts);
      document.removeEventListener('click', schedule, opts);
      window.clearInterval(timer);
    };
  }, [active]);

  return { geoms, bind };
}
