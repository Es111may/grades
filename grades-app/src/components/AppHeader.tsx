import Link from 'next/link';
import { prisma } from '@/lib/db';
import UserMenu from './UserMenu';
import HeaderNav from './HeaderNav';

type NavItem = { href: string; label: string };

/**
 * Шапка приложения. user.fullName/role приходят из JWT-сессии и могут
 * быть устаревшими (правки админа не отражаются в сессии до релогина),
 * поэтому актуальные fullName + avatarUrl подтягиваем из БД при каждом
 * SSR-рендере страницы.
 */
export default async function AppHeader({
  user,
  navItems = [],
}: {
  user: { id?: number; fullName: string; role: string };
  navItems?: NavItem[];
}) {
  let fullName = user.fullName;
  let avatarUrl: string | null = null;

  if (user.id) {
    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      select: { fullName: true, avatarUrl: true },
    });
    if (fresh) {
      fullName = fresh.fullName;
      avatarUrl = fresh.avatarUrl;
    }
  }

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
            <img
              src="/grades-logo.png"
              alt="Ида Грейдс"
              width={158}
              height={22}
            />
          </Link>
          {navItems.length > 0 && <HeaderNav items={navItems} />}
        </div>
        <UserMenu fullName={fullName} role={user.role} avatarUrl={avatarUrl} />
      </div>
    </header>
  );
}
