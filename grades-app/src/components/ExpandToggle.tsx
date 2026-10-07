import type { MouseEvent, ReactNode } from 'react';
import { MinusIcon, PlusIcon } from '@/components/icons';

const SIZE = {
  /** 40 px — карточки «Функционала». */
  md: 'w-10 h-10',
  /** 32 px — строки таблиц «Экономики». */
  sm: 'w-8 h-8',
} as const;

/**
 * Круглая кнопка раскрытия «+ / −» (пара к Collapse). Оба значка в DOM —
 * кросс-фейд: новый появляется из размытия и масштаба 0.25. Ховер — и от
 * своей строки (group-hover: строку обычно можно кликнуть целиком), и от
 * самой кнопки.
 */
export default function ExpandToggle({
  open,
  label,
  controls,
  onClick,
  size = 'md',
  className = '',
}: {
  open: boolean;
  /** aria-label: что раскрывается («Ирина Белова: люди»). */
  label: string;
  /** id раскрываемого блока (Collapse). */
  controls?: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  size?: keyof typeof SIZE;
  /** Подгонка под ряд: например, -my-2 держит ряд по чипам высотой 24. */
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={label}
      className={`relative ${SIZE[size]} shrink-0 rounded-pill bg-ink/5 text-stone
                  group-hover:bg-ink/10 group-hover:text-ink hover:bg-ink/10 hover:text-ink active:scale-[0.96]
                  transition-[background-color,color,transform] duration-150 ease-out ${className}`}
    >
      <Glyph shown={!open}>
        <PlusIcon className="w-4 h-4" />
      </Glyph>
      <Glyph shown={open}>
        <MinusIcon className="w-4 h-4" />
      </Glyph>
    </button>
  );
}

/** Значок в кнопке: появляется из размытия и масштаба 0.25. */
function Glyph({ shown, children }: { shown: boolean; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={`absolute inset-0 flex items-center justify-center
                  transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]
                  ${shown ? 'opacity-100 scale-100 blur-0' : 'opacity-0 scale-[0.25] blur-[4px]'}`}
    >
      {children}
    </span>
  );
}
