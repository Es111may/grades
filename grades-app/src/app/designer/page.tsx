export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { loadPortraitData } from '@/lib/portrait';
import { fetchOnTimeStatsByEmail } from '@/lib/clickhousePerfBatch';
import { PAGE_BUDGET_MS, withTimeout } from '@/lib/perfCache';
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

  // Перформанс показываем только дизайнерам и стардизам (они работают
  // руками в трекерах). Лиды/админы на собственном портрете блок не видят.
  const showPerformance = user.role === 'designer' || user.role === 'stardiz';
  const email = user.email;

  // Портрет, проекты и «в срок» друг от друга не зависят — параллельно.
  // Если оценки ещё нет, проекты окажутся лишним лёгким чтением.
  const [result, userProjects, onTime] = await Promise.all([
    loadPortraitData(user.id, Number.isFinite(assessmentId) ? assessmentId : undefined),
    // Проекты дизайнера — справочник M:N. Дизайнер сам редактирует список.
    prisma.userProject.findMany({
      where: { userId: user.id },
      select: { project: { select: { id: true, name: true, category: true } } },
      orderBy: [
        { project: { category: 'asc' } },
        { project: { sortOrder: 'asc' } },
        { project: { name: 'asc' } },
      ],
    }),
    showPerformance && email
      ? // Не дольше бюджета страницы: запрос допишет кэш в фоне.
        withTimeout(fetchOnTimeStatsByEmail([email]), PAGE_BUDGET_MS, 'fetchOnTimeStatsByEmail')
          .then((stats) => stats.get(email.toLowerCase()) ?? null)
          .catch((err) => {
            // ClickHouse недоступен — портрет всё равно показываем, чип просто
            // не нарисуется (null).
            console.error('[/designer] fetchOnTimeStatsByEmail failed:', err);
            return null;
          })
      : null,
  ]);

  if (result.kind === 'not_found') {
    return (
      <main className="max-w-[800px] mx-auto px-8 pt-12 pb-16">
        <div className="bg-snow border border-cloud rounded-card p-8 shadow-soft text-center">
          <p className="text-stone">Профиль не найден.</p>
        </div>
      </main>
    );
  }

  if (result.kind === 'no_assessment') {
    // Имя, билд, отдел и грейд-floor уже прочитаны загрузчиком портрета.
    const me = result.designer;
    return (
      <main className="max-w-[1000px] mx-auto px-8 pt-8 pb-16">
        <div className="mb-8">
          <h1 className="font-display text-4xl font-medium tracking-tight mb-2">
            {me.fullName}
          </h1>
          <p className="text-stone text-sm">
            {me.buildName ?? 'Билд не назначен'} · {me.department ?? '—'}
          </p>
        </div>

        <div className="card p-10 text-center mb-5">
          <div className="font-display text-2xl font-medium tracking-tight mb-2">
            Оценка ещё не проводилась
          </div>
          <p className="text-stone leading-relaxed max-w-md mx-auto">
            Когда лид опубликует первую оценку — здесь появится твой грейд, XP,
            радар-диаграмма и список навыков.
          </p>
        </div>

        {me.gradeFloor && (
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

  const onTimePercent = onTime?.onTimePercent ?? null;
  const onTimeTotalTasks = onTime?.totalTasks ?? 0;

  // Phase 17 — ИПР. Зритель здесь — сам owner портрета, т.е. user. У него
  // право создавать чек-листы себе (по матрице прав), значит canCreate=true.
  // Но используем общий хелпер — он же гарантирует консистентность. Строку
  // владельца (роль, лид, стардиз) отдал загрузчик портрета — из той же БД.
  const canCreateChecklists = canCreateChecklistFor(
    { id: user.id, role: user.role ?? '' },
    result.target,
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
