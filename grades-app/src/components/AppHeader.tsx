import Link from 'next/link';
import UserMenu from './UserMenu';
import HeaderNav from './HeaderNav';

type NavItem = { href: string; label: string };

export default function AppHeader({
  user,
  navItems = [],
}: {
  user: { fullName: string; role: string };
  navItems?: NavItem[];
}) {
  const initials = user.fullName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-cloud/80 bg-snow/85 backdrop-blur-md">
      <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between gap-6">
        <div className="flex items-center gap-8 min-w-0">
          <Link
            href="/"
            className="block hover:opacity-80 transition-opacity"
            aria-label="Грейды"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/grades-logo.svg" alt="Грейды" width={108} height={20} />
          </Link>
          {navItems.length > 0 && <HeaderNav items={navItems} />}
        </div>
        <UserMenu fullName={user.fullName} role={user.role} initials={initials} />
      </div>
    </header>
  );
}
