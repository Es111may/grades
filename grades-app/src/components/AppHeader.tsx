import Link from 'next/link';
import { prisma } from '@/lib/db';
import UserMenu from './UserMenu';
import HeaderNav from './HeaderNav';
import ThemeToggle from './ThemeToggle';

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
    // Dynamic Island: плавающая капсула по центру, отвязанная от краёв.
    // Ширина — по контенту (w-fit), glass-блюр, мягкая тень. px-4 — чтобы
    // на узких экранах остров не липнул к краям; overflow-скролл внутри
    // капсулы на совсем маленьких ширинах.
    <header className="sticky top-3 z-30 px-4">
      {/* `group` — hover-зона для инлайн-меню (HeaderNav): раскрытие при
          наведении на любую часть острова, схлопывание при уходе с него */}
      <div
        className="group w-fit max-w-full mx-auto flex items-center gap-3 h-14 pl-6 pr-3
                   rounded-pill border border-cloud/60 bg-snow/75
                   backdrop-blur-2xl shadow-soft-lg"
        style={{ WebkitBackdropFilter: 'blur(24px) saturate(160%)' }}
      >
        <Link
          href="/"
          className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
          aria-label="Грейды"
        >
          {/* Живой логотип: «ида ● грейдс» текстом (Onest — сам красится
              под тему), в кружке — зациклённое видео лаймовой 3D-спирали
              (34KB, muted+playsInline — автоплеится и на iOS). */}
          <span className="font-display text-[19px] font-medium tracking-tight leading-none lowercase">
            ида
          </span>
          <span className="w-7 h-7 rounded-full overflow-hidden shrink-0">
            <video
              src="/logo-spiral.mp4"
              autoPlay
              loop
              muted
              playsInline
              aria-hidden
              className="w-full h-full object-cover"
            />
          </span>
          <span className="font-display text-[19px] font-medium tracking-tight leading-none lowercase">
            грейдс
          </span>
        </Link>
        {/* Разделитель: логотип | контролы */}
        <span className="w-px h-5 bg-cloud/80 shrink-0" aria-hidden />
        {/* Бургер (раскрывается в острове) и тумблер темы — вплотную */}
        <div className="flex items-center gap-0.5 shrink-0">
          {navItems.length > 0 && <HeaderNav items={navItems} />}
          <ThemeToggle />
        </div>
        {/* Разделитель: контролы | аватар */}
        <span className="w-px h-5 bg-cloud/80 shrink-0" aria-hidden />
        <UserMenu fullName={fullName} role={user.role} avatarUrl={avatarUrl} />
      </div>
    </header>
  );
}
