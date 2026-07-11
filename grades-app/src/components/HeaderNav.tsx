'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MenuIcon } from './icons';

type NavItem = { href: string; label: string };

/**
 * Навигация в Dynamic Island-хедере: иконка-бургер, по наведению (и клику
 * для тача) раскрывается меню со всеми разделами. Активный раздел подсвечен.
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
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Меню разделов"
        aria-expanded={open}
        className="w-9 h-9 flex items-center justify-center rounded-pill text-stone
                   hover:text-ink hover:bg-cloud/50 transition-colors"
      >
        <MenuIcon className="w-[18px] h-[18px]" />
      </button>

      {open && (
        // pt-2 — «мостик» hover-зоны между кнопкой и меню
        <div className="absolute left-0 top-full pt-2 w-52 z-40">
          <div className="rounded-card bg-snow border border-cloud shadow-soft-lg overflow-hidden p-1.5 animate-scale-in">
            {items.map((n) => {
              const active = isActive(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className={`block px-3 py-2 rounded-[10px] text-sm transition-colors ${
                    active
                      ? 'bg-cloud/60 text-ink font-medium'
                      : 'text-stone hover:bg-canvas hover:text-ink'
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
