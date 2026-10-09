export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { loadPortraitData } from '@/lib/portrait';
import { fetchOnTimeStatsByEmail } from '@/lib/clickhousePerfBatch';
import { PAGE_BUDGET_MS, withTimeout } from '@/lib/perfCache';
import { canCreateChecklistFor, type Role } from '@/lib/checklistPermissions';
import { pendingPortraitView } from '@/lib/portraitPending';
import Portrait from './Portrait';
import PortraitPending from './PortraitPending';

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
  // Проекты и «в срок» нужны и портрету без оценки.
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

  const onTimePercent = onTime?.onTimePercent ?? null;
  const onTimeTotalTasks = onTime?.totalTasks ?? 0;
  const initialProjects = userProjects.map((up) => up.project);

  // Оценки ещё нет — тот же портрет без блоков, которым она нужна: hero,
  // bento (XP пуст, «в срок»), проекты и перформанс. Кнопки оценки нет —
  // оценку проводит лид.
  if (result.kind === 'no_assessment') {
    return (
      <PortraitPending
        person={result.designer}
        view={pendingPortraitView({ viewer: 'self', person: result.target })}
        userId={user.id}
        initialProjects={initialProjects}
        canEditProjects={true}
        showPerformance={showPerformance}
        onTimePercent={onTimePercent}
        onTimeTotalTasks={onTimeTotalTasks}
      />
    );
  }

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
      initialProjects={initialProjects}
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
