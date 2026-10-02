'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDownIcon } from '@/components/icons';
import { isCommentsLayerOpen, isFromCommentsLayer } from '@/lib/commentsLayer';

export type FilterOption<T extends string> = { value: T; label: string; count?: number };

/**
 * Общая фильтр-пилюля ряда контролов: «Роль: Все 14 ⌄» и список вариантов со
 * счётчиками. Вынесена из RoleDropdown «Команды» один в один по виду — туда
 * её и планируем вернуть, чтобы все фильтры сервиса были одним компонентом.
 * Закрывается по клику мимо, Esc и уходу фокуса; стрелки ходят по пунктам.
 * Слой комментариев к интерфейсу — не «мимо»: открытый список можно
 * прокомментировать, и он не свернётся.
 */
export default function FilterDropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  minWidth = 190,
}: {
  /** Подпись перед значением, без двоеточия: «Роль», «Тип» */
  label: string;
  value: T;
  options: FilterOption<T>[];
  onChange: (value: T) => void;
  minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) => !!ref.current && ref.current.contains(t as Node);
    function onDoc(e: MouseEvent) {
      if (!inside(e.target) && !isFromCommentsLayer(e)) setOpen(false);
    }
    // Tab увёл фокус за пределы — закрываем (blur не годится: Safari не
    // фокусирует кнопки по клику, и меню закрывалось бы до выбора пункта).
    // Фокус ушёл в поле комментария — не закрываем
    function onFocus(e: FocusEvent) {
      if (!inside(e.target) && !isFromCommentsLayer(e)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || isCommentsLayerOpen()) return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // При открытии фокус — на выбранный пункт, чтобы сразу работали стрелки
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, [open]);

  function onListKey(e: React.KeyboardEvent) {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
  }

  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className="inline-flex items-center gap-1.5 bg-ink/5 border border-ink/5 rounded-pill
                   px-4 h-10 text-[13px] font-normal leading-none text-stone
                   hover:text-ink hover:bg-ink/10 transition-colors"
      >
        <span className="text-stone font-normal">{label}:</span>
        {current?.label}
        {current?.count !== undefined && (
          <span className="text-stone text-xs tabular-nums">{current.count}</span>
        )}
        <ChevronDownIcon
          className={`w-3 h-3 text-stone transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          onKeyDown={onListKey}
          className="absolute left-0 top-full mt-2 z-30 card p-1.5 shadow-soft-lg animate-scale-in"
          style={{ minWidth }}
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className={`w-full flex items-center justify-between gap-4 px-3 py-2 rounded-[10px]
                            text-xs text-left transition-colors ${
                              active
                                ? 'bg-cloud/60 text-ink font-medium'
                                : 'text-stone hover:bg-canvas hover:text-ink'
                            }`}
              >
                {o.label}
                {o.count !== undefined && <span className="text-ash tabular-nums">{o.count}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
