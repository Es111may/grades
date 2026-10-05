import type { ReactNode } from 'react';
import { buildDotColor } from '@/lib/buildTone';

/**
 * Точка билда — цвет из lib/buildTone. Размеры, что есть в сервисе:
 *  • sm — 6px: внутри чипов, подписи карточек и порогов;
 *  • md — 8px: шапки таблицы матрицы, карточки весов в «Новом навыке».
 * dot — свой цвет вместо цвета билда (строка «Лиды» в «Экономике»).
 */
export function BuildDot({
  code,
  size = 'sm',
  dot,
  className = '',
}: {
  code: string | null | undefined;
  size?: 'sm' | 'md';
  dot?: string;
  className?: string;
}) {
  return (
    <span
      className={`${size === 'md' ? 'w-2 h-2' : 'w-1.5 h-1.5'} rounded-full${className ? ` ${className}` : ''}`}
      style={{ background: dot ?? buildDotColor(code) }}
    />
  );
}

/**
 * Чип билда: точка + название.
 *  • sm — `.chip-build` (10px): плотные списки — лидерборд, канбан, оценки,
 *    «Экономика»; билд там второстепенен;
 *  • md — `.chip-neutral` (11.5px): шапки — поп-ап 360, страница оценки,
 *    где чип стоит в ряду с ролью и статусом и равен им по размеру.
 * className — добавки места (h-6 в ряду чипов поп-апа).
 */
export default function BuildChip({
  code,
  name,
  size = 'sm',
  dot,
  className = '',
}: {
  code: string | null | undefined;
  name: ReactNode;
  size?: 'sm' | 'md';
  dot?: string;
  className?: string;
}) {
  return (
    <span className={`${size === 'md' ? 'chip-neutral' : 'chip-build'}${className ? ` ${className}` : ''}`}>
      <BuildDot code={code} dot={dot} />
      {name}
    </span>
  );
}
