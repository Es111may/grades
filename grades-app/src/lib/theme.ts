'use client';

/**
 * Механика светлой/тёмной темы.
 *
 * Дефолт — тёмная (без атрибута). Светлая = html[data-theme='light'].
 * Выбор хранится в localStorage('theme') и восстанавливается ДО первой
 * отрисовки инлайн-скриптом в layout.tsx (иначе была бы вспышка тёмной).
 *
 * Вся палитра живёт в CSS-переменных (globals.css), поэтому переключение —
 * это только смена атрибута. useTheme() нужен единичным JS-потребителям,
 * которым CSS недоступен (цвета осей chart.js).
 */

import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

export function getTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark';
}

export function setTheme(t: Theme) {
  if (t === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  try {
    localStorage.setItem('theme', t);
  } catch {
    // приватный режим — тема просто не переживёт перезагрузку
  }
  window.dispatchEvent(new Event('themechange'));
}

export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

function subscribe(cb: () => void) {
  window.addEventListener('themechange', cb);
  return () => window.removeEventListener('themechange', cb);
}

/** Реактивная тема для JS-потребителей (chart.js). SSR-снапшот — 'dark'. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, () => 'dark');
}

/** Цвета осей chart.js под тему — CSS туда не дотягивается. */
export const CHART_AXIS: Record<
  Theme,
  { grid: string; tick: string; label: string }
> = {
  dark: { grid: 'rgba(255,255,255,0.10)', tick: '#6e6e73', label: '#f5f5f7' },
  light: { grid: '#e5e3dc', tick: '#86857f', label: '#1a1a1a' },
};
