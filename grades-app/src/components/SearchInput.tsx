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
      <SearchIcon className="w-3.5 h-3.5 text-ash absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input rounded-pill pl-9 h-10 py-0 bg-snow/60 backdrop-blur-md"
      />
    </span>
  );
}
