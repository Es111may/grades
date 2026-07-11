'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MenuIcon } from './icons';

type NavItem = { href: string; label: string };

/**
 * Навигация в Dynamic Island: иконка-бургер, по наведению пункты
 * раскрываются ПРЯМО В ОСТРОВЕ — капсула плавно расширяется (анимация
 * max-width + opacity). Активный раздел подсвечен.
 */
export default function HeaderNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState(false);

  function isActive(href: string) {
    if (pathname === href) return true;
    if (href !== '/' && pathname.startsWith(href + '/')) return true;
    return false;
  }

  return (
    <div
      className="flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Меню разделов"
        aria-expanded={open}
        className={`w-9 h-9 flex items-center justify-center rounded-pill transition-colors ${
          open ? 'text-ink' : 'text-stone hover:text-ink hover:bg-cloud/50'
        }`}
      >
        <MenuIcon className="w-[18px] h-[18px]" />
      </button>

      {/* Инлайн-раскрытие в острове: nowrap-ряд ссылок, ширина анимируется */}
      <nav
        className={`flex items-center gap-0.5 overflow-hidden whitespace-nowrap
                    transition-all duration-300 ease-apple-out ${
                      open ? 'max-w-[720px] opacity-100 ml-1' : 'max-w-0 opacity-0'
                    }`}
        aria-hidden={!open}
      >
        {items.map((n) => {
          const active = isActive(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              tabIndex={open ? 0 : -1}
              className={`px-3 py-1.5 text-sm rounded-pill transition-colors duration-150 ${
                active
                  ? 'bg-cloud text-ink'
                  : 'text-stone hover:text-ink hover:bg-cloud/50'
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
