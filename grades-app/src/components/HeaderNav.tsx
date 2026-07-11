'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MenuIcon } from './icons';

type NavItem = { href: string; label: string };

/**
 * Навигация в Dynamic Island. Работает на CSS group-hover от ВСЕГО острова
 * (класс `group` на капсуле в AppHeader):
 *  - при наведении на остров иконка-бургер плавно исчезает, и на её месте
 *    выезжают пункты меню;
 *  - схлопывается только когда курсор уходит со всей капсулы.
 * `group-focus-within` даёт то же поведение с клавиатуры (Tab).
 */
export default function HeaderNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? '';

  function isActive(href: string) {
    if (pathname === href) return true;
    if (href !== '/' && pathname.startsWith(href + '/')) return true;
    return false;
  }

  return (
    <div className="flex items-center">
      {/* Бургер: при ховере острова плавно схлопывается */}
      <span
        className="flex items-center justify-center h-9 overflow-hidden text-stone
                   transition-all duration-500 ease-apple-out
                   max-w-9 w-9 opacity-100
                   group-hover:max-w-0 group-hover:opacity-0
                   group-focus-within:max-w-0 group-focus-within:opacity-0"
        aria-hidden
      >
        <MenuIcon className="w-[18px] h-[18px] shrink-0" />
      </span>

      {/* Пункты меню: выезжают на месте бургера */}
      <nav
        className="flex items-center gap-0.5 overflow-hidden whitespace-nowrap
                   transition-all duration-500 ease-apple-out
                   max-w-0 opacity-0
                   group-hover:max-w-[720px] group-hover:opacity-100
                   group-focus-within:max-w-[720px] group-focus-within:opacity-100"
        aria-label="Разделы"
      >
        {items.map((n) => {
          const active = isActive(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
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
