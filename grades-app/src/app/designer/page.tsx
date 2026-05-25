export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { loadPortraitData } from '@/lib/portrait';
import { fetchOnTimeStatsByEmail } from '@/lib/clickhousePerfBatch';
import { canCreateChecklistFor, type Role } from '@/lib/checklistPermissions';
import { GRADE_NAMES } from '@/lib/types';
import type { GradeCode } from '@/lib/types';
import Portrait from './Portrait';

export default async function DesignerPortraitPage({
  searchParams,
}: {
  searchParams: { assessmentId?: string };
}) {
  const user = await getCurrentUser();
  if (!user?.id) return null;

  const assessmentId = searchParams.assessmentId
    ? parseInt(searchParams.assessmentId, 10)
    : undefined;
  const result = await loadPortraitData(
    user.id,
    Number.isFinite(assessmentId) ? assessmentId : undefined,
  );

  if (result.kind === 'not_found') {
    return (
      <main className="max-w-[800px] mx-auto px-8 pt-12 pb-16">
        <div className="bg-white border border-cloud rounded-card p-8 shadow-soft text-center">
          <p className="text-stone">Профиль не найден.</p>
        </div>
      </main>
    );
  }

  if (result.kind === 'no_assessment') {
    const me = await prisma.user.findUnique({
      where: { id: user.id },
      include: { build: true, lead: true },
    });
    return (
      <main className="max-w-[1000px] mx-auto px-8 pt-8 pb-16">
        <div className="mb-8">
          <h1 className="font-display text-4xl font-semibold tracking-tight mb-2">
            {me?.fullName}
          </h1>
          <p className="text-stone text-sm">
            {me?.build?.name ?? '— билд не назначен'} · {me?.department ?? '—'}
          </p>
        </div>

        <div className="card p-10 text-center mb-5">
          <div className="font-display text-2xl font-semibold tracking-tight mb-2">
            Оценка ещё не проводилась
          </div>
          <p className="text-stone leading-relaxed max-w-md mx-auto">
            Когда лид опубликует первую оценку — здесь появится твой грейд, XP,
            радар-диаграмма и список навыков.
          </p>
        </div>

        {me?.gradeFloor && (
          <div className="bg-lime-light/60 border border-lime/30 rounded-card p-5">
            <div className="text-[11px]  text-graphite mb-1.5">
              Зафиксированный грейд
            </div>
            <p className="text-sm text-graphite leading-relaxed">
              При переходе с прежней системы за тобой закреплён грейд{' '}
              <strong>
                {GRADE_NAMES[me.gradeFloor as GradeCode] ?? me.gradeFloor}
              </strong>
              . Если расчёт по новой матрице даст ниже — всё равно показывается этот.
            </p>
          </div>
        )}
      </main>
    );
  }

  // Проекты дизайнера — справочник M:N. Дизайнер сам редактирует список.
  const userProjects = await prisma.userProject.findMany({
    where: { userId: user.id },
    include: {
      project: { select: { id: true, name: true, category: true } },
    },
    orderBy: [
      { project: { category: 'asc' } },
      { project: { sortOrder: 'asc' } },
      { project: { name: 'asc' } },
    ],
  });

  // Перформанс показываем только дизайнерам и стардизам (они работают
  // руками в трекерах). Лиды/админы на собственном портрете блок не видят.
  const showPerformance = user.role === 'designer' || user.role === 'stardiz';
  let onTimePercent: number | null = null;
  let onTimeTotalTasks = 0;
  if (showPerformance && user.email) {
    try {
      const stats = await fetchOnTimeStatsByEmail([user.email]);
      const s = stats.get(user.email.toLowerCase());
      if (s) {
        onTimePercent = s.onTimePercent;
        onTimeTotalTasks = s.totalTasks;
      }
    } catch (err) {
      // ClickHouse недоступен — портрет всё равно показываем, чип просто
      // не нарисуется (null).
      console.error('[/designer] fetchOnTimeStatsByEmail failed:', err);
    }
  }

  // Phase 17 — ИПР. Зритель здесь — сам owner портрета, т.е. user. У него
  // право создавать чек-листы себе (по матрице прав), значит canCreate=true.
  // Но используем общий хелпер — он же гарантирует консистентность.
  const meAsTarget = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, role: true, leadId: true, stardizId: true },
  });
  const canCreateChecklists =
    !!meAsTarget &&
    canCreateChecklistFor(
      { id: user.id, role: user.role ?? '' },
      meAsTarget,
    );

  return (
    <Portrait
      data={result.data}
      siblingHrefPrefix="/designer?assessmentId="
      canEditLeadComment={false}
      userId={user.id}
      initialProjects={userProjects.map((up) => up.project)}
      canEditProjects={true}
      showPerformance={showPerformance}
      onTimePercent={onTimePercent}
      onTimeTotalTasks={onTimeTotalTasks}
      meRole={(user.role ?? 'designer') as Role}
      meUserId={user.id}
      canCreateChecklists={canCreateChecklists}
    />
  );
}
