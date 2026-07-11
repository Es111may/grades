'use client';

import { SearchIcon } from './icons';

/**
 * Единый компонент поиска (пилюля с иконкой, высота h-10 — как у
 * сегментов тулбара). Используется на «Команде», «Скиллах» и везде,
 * где нужен поиск, — чтобы поле выглядело одинаково во всём продукте.
 */
export default function SearchInput({
  value,
  onChange,
  placeholder = 'Поиск',
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <span className={`relative ${className}`}>
      {/* text-ink: в тёмной теме белая, в светлой — тёмная (Pavel) */}
      <SearchIcon className="w-3.5 h-3.5 text-ink absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
      {/* Подложка 1:1 как трек сегментов (bg-ink/5) — без .input, чтобы
          его bg-snow/border-cloud не спорили по специфичности */}
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-pill pl-9 pr-4 h-10 text-sm leading-none
                   bg-ink/5 border border-ink/5 text-ink placeholder:text-stone
                   transition-colors focus:outline-none focus:border-sky
                   focus:ring-4 focus:ring-sky/15"
      />
    </span>
  );
}
