import Link from 'next/link';
import UserMenu from './UserMenu';

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
    <header className="border-b border-cloud bg-canvas">
      <div className="max-w-[1400px] mx-auto px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <Link href="/" className="font-display text-2xl tracking-tight">
            Грейды
          </Link>
          {navItems.length > 0 && (
            <nav className="flex items-center gap-7">
              {navItems.map((n) => (
                <Link key={n.href} href={n.href} className="text-stone hover:text-ink text-sm">
                  {n.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <UserMenu fullName={user.fullName} role={user.role} initials={initials} />
      </div>
    </header>
  );
}
