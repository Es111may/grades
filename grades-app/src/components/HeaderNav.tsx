'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MenuIcon } from './icons';

type NavItem = { href: string; label: string };

/**
 * Навигация в Dynamic Island. Раскрытие — на CSS group-hover от ВСЕЙ
 * капсулы (класс `group` на острове в AppHeader): наводишь куда угодно на
 * остров → бургер плавно исчезает и на его месте из ЦЕНТРА выезжают пункты
 * меню; схлопывается только когда курсор уходит со всего острова.
 *
 * Почему из центра: внешний контейнер центрирован (justify-center) и
 * анимирует max-width от ширины иконки до ширины меню — окно растёт
 * симметрично в обе стороны от середины. Бургер и меню лежат в одной
 * grid-ячейке (стопкой) и кросс-фейдятся.
 *
 * Важно: НЕ используем group-focus-within — иначе фокус, остающийся на
 * кнопке темы / ссылке после клика, держал бы меню раскрытым и после
 * увода курсора (баг «не схлопывается при переходе / переключении темы»).
 */
export default function HeaderNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? '';

  function isActive(href: string) {
    if (pathname === href) return true;
    if (href !== '/' && pathname.startsWith(href + '/')) return true;
    return false;
  }

  return (
    <div
      className="flex justify-center overflow-hidden max-w-9
                 transition-[max-width] duration-500 ease-apple-out
                 group-hover:max-w-[760px]"
    >
      {/* Стопка: бургер и меню в одной ячейке, обе центрированы. Ширина —
          натуральная (по меню), внешнее окно обрезает её до иконки. */}
      <div className="grid place-items-center shrink-0">
        {/* Бургер — исчезает по ховеру острова */}
        <span
          className="col-start-1 row-start-1 flex items-center justify-center w-9 h-9
                     text-stone transition-opacity duration-300 ease-apple-out
                     group-hover:opacity-0 group-hover:pointer-events-none"
          aria-hidden
        >
          <MenuIcon className="w-[18px] h-[18px] shrink-0" />
        </span>

        {/* Пункты меню — появляются по ховеру острова */}
        <nav
          className="col-start-1 row-start-1 flex items-center gap-0.5 whitespace-nowrap
                     opacity-0 pointer-events-none transition-opacity duration-300 delay-100
                     ease-apple-out group-hover:opacity-100 group-hover:pointer-events-auto"
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
    </div>
  );
}
