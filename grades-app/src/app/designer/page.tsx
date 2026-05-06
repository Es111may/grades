export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export default async function DesignerPortrait() {
  const user = await getCurrentUser();
  if (!user?.id) return null;

  const me = await prisma.user.findUnique({
    where: { id: user.id },
    include: { build: true, lead: true },
  });

  return (
    <main className="max-w-[1200px] mx-auto px-8 pt-12 pb-16">
      <div className="mb-10">
        <div className="text-xs uppercase tracking-widest text-stone mb-2">Phase 1 — каркас</div>
        <h1 className="font-display text-5xl font-light tracking-tight mb-2">Мой портрет</h1>
        <p className="text-stone leading-relaxed max-w-2xl">
          На Phase 1 — только базовый профиль. Реальный портрет с XP, грейдом и радар-диаграммой
          появится в Phase 4 после реализации формы оценки и публикации.
        </p>
      </div>

      <div className="bg-white border border-cloud rounded-card p-8 shadow-soft mb-6">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div className="text-xs uppercase tracking-widest text-stone mb-2">Кто ты</div>
            <div className="font-display text-3xl mb-1">{me?.fullName}</div>
            <div className="text-sm text-stone">
              {me?.build?.name ?? '— билд не назначен'} · {me?.department ?? '—'}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-stone mb-2">Лид</div>
            <div className="font-display text-3xl mb-1">{me?.lead?.fullName ?? '—'}</div>
            <div className="text-sm text-stone">{me?.lead?.email ?? ''}</div>
          </div>
        </div>
      </div>

      {me?.gradeFloor && (
        <div className="bg-lime-light border border-lime rounded-card p-6 mb-6">
          <div className="text-xs uppercase tracking-widest text-graphite mb-2">Grade floor</div>
          <p className="text-sm text-graphite leading-relaxed">
            Твой грейд зафиксирован при переходе со старой системы на уровне{' '}
            <strong>{me.gradeFloor}</strong>. Если расчёт по новой матрице даст ниже —
            всё равно показывается этот.
          </p>
        </div>
      )}

      <div className="bg-canvas border border-cloud rounded-card p-6">
        <div className="text-sm text-stone leading-relaxed">
          <strong className="text-ink">Что появится в Phase 3-4:</strong> страница с радар-диаграммой
          по 5 скиллам, прогрессом по гейтам, полным списком оценённых навыков и историей
          циклов оценки.
        </div>
      </div>
    </main>
  );
}
