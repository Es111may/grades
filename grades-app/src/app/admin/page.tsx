export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export default async function AdminDashboard() {
  const user = await getCurrentUser();
  const [usersCount, leadsCount, designersCount, matrixVer, skillsCount] =
    await Promise.all([
      prisma.user.count({ where: { active: true } }),
      prisma.user.count({ where: { active: true, role: 'lead' } }),
      prisma.user.count({ where: { active: true, role: 'designer' } }),
      prisma.matrixVersion.findFirst({ where: { isCurrent: true } }),
      prisma.skill.count({
        where: { matrixVersion: { isCurrent: true }, active: true },
      }),
    ]);

  return (
    <main className="max-w-[1400px] mx-auto px-8 pt-12 pb-16">
      <div className="mb-10">
        <div className="text-xs uppercase tracking-widest text-stone mb-2">Phase 1 — каркас</div>
        <h1 className="font-display text-5xl font-light tracking-tight mb-2">Привет, {user?.name?.split(' ')[0]}</h1>
        <p className="text-stone leading-relaxed max-w-2xl">
          Это admin-дашборд. На Phase 1 здесь только сводка по системе. Реальные экраны
          (CRUD пользователей, редактор матрицы) появятся в фазах 2 и 5.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-cloud rounded-card p-5 shadow-soft">
          <div className="text-xs uppercase tracking-widest text-stone mb-2">Пользователей</div>
          <div className="font-display text-3xl">{usersCount}</div>
          <div className="text-xs text-stone mt-1">{leadsCount} лидов · {designersCount} дизайнеров</div>
        </div>
        <div className="bg-white border border-cloud rounded-card p-5 shadow-soft">
          <div className="text-xs uppercase tracking-widest text-stone mb-2">Матрица</div>
          <div className="font-display text-3xl">v{matrixVer?.number ?? '—'}</div>
          <div className="text-xs text-stone mt-1">
            {matrixVer ? matrixVer.createdAt.toLocaleDateString('ru-RU') : 'не загружена'}
          </div>
        </div>
        <div className="bg-white border border-cloud rounded-card p-5 shadow-soft">
          <div className="text-xs uppercase tracking-widest text-stone mb-2">Активных навыков</div>
          <div className="font-display text-3xl">{skillsCount}</div>
        </div>
        <div className="bg-lime-light border border-lime rounded-card p-5">
          <div className="text-xs uppercase tracking-widest text-graphite mb-2">Статус</div>
          <div className="font-display text-2xl">Phase 1 ✓</div>
          <div className="text-xs text-graphite mt-1">Auth + ролевые маршруты</div>
        </div>
      </div>
    </main>
  );
}
