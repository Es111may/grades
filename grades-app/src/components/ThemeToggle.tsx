'use client';

import { toggleTheme } from '@/lib/theme';
import { SunIcon, MoonIcon } from './icons';
import Tooltip from './Tooltip';

/**
 * Тумблер светлой/тёмной темы в шапке. Обе иконки в DOM всегда,
 * видимость переключает CSS (.dark-only / .light-only в globals) —
 * серверный HTML одинаков для любой темы, гидрации нечего ломать.
 */
export default function ThemeToggle() {
  return (
    <Tooltip align="center" text="Переключить тему">
      <button
        type="button"
        onClick={toggleTheme}
        className="w-8 h-8 flex items-center justify-center rounded-pill
                   text-stone hover:text-ink hover:bg-cloud/50 transition-colors"
        aria-label="Переключить тему"
      >
        {/* на тёмной теме показываем солнце («переключи на светлую»), на светлой — луну */}
        <SunIcon className="w-4 h-4 dark-only" />
        <MoonIcon className="w-4 h-4 light-only" />
      </button>
    </Tooltip>
  );
}
