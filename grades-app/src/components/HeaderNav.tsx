'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = { href: string; label: string };

export default function HeaderNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? '';

  function isActive(href: string) {
    // Точное совпадение или префикс с разделителем
    if (pathname === href) return true;
    if (href !== '/' && pathname.startsWith(href + '/')) return true;
    return false;
  }

  return (
    <nav className="flex items-center gap-1">
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
  );
}
