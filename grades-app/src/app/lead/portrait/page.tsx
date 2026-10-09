export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { canViewCompensation } from '@/lib/compPermissions';
import { findPortraitDesigner, loadPortraitData } from '@/lib/portrait';
import { fetchOnTimeStatsByEmail } from '@/lib/clickhousePerfBatch';
import { PAGE_BUDGET_MS, withTimeout } from '@/lib/perfCache';
import { canCreateChecklistFor, type Role } from '@/lib/checklistPermissions';
import { canGradeDesigner } from '@/lib/permissions';
import { isGradable } from '@/lib/employment';
import { pendingPortraitView } from '@/lib/portraitPending';
import { getNineBoxTitle, getTeamGrowthMedian } from '@/lib/teamMetrics';
import Portrait from '@/app/designer/Portrait';
import PortraitPending from '@/app/designer/PortraitPending';
import PortraitActions from './PortraitActions';

export default async function LeadPortraitPage({
  searchParams,
}: {
  searchParams: { id?: string; assessmentId?: string };
}) {
  const user = await getCurrentUser();
  if (!user?.id) redirect('/auth/signin');

  const designerId = parseInt(searchParams.id ?? '', 10);
  if (isNaN(designerId)) redirect('/admin/users');

  // Permission: admin / designer's lead / designer's stardiz. Строку берём
  // select'ом портрета и отдаём в loadPortraitData — второй раз не читаем.
  const designer = await findPortraitDesigner(designerId);
  if (!designer) redirect('/admin/users');
  const canView =
    user.role === 'admin' ||
    designer.leadId === user.id ||
    designer.stardizId === user.id;
  if (!canView) redirect('/admin/users');

  const assessmentId = searchParams.assessmentId
    ? parseInt(searchParams.assessmentId, 10)
    : undefined;

  // Перформанс — только для designer/stardiz целевого пользователя.
  // Лида/админа на собственном портрете тут вообще не открывают, но если
  // вдруг будет ссылка — блок не покажем.
  const showPerformance = designer.role === 'designer' || designer.role === 'stardiz';
  // Редизайн v6: позиция 9-Box — ТОЛЬКО для admin/lead (стардиз не видит,
  // решение Pavel). Медиана роста команды — admin/lead/stardiz.
  const viewerRole = user.role ?? '';

  // Всё ниже зависит только от designerId — одним Promise.all. Портрет без
  // оценки (PortraitPending) берёт отсюда же черновик, проекты, «в срок» и
  // 9-Box; «в срок» почти всегда уже в кэше — его раскладывает командный
  // запрос /admin/users.
  const [result, draft, userProjects, onTime, nineBoxTitle, teamGrowthMedian] =
    await Promise.all([
      loadPortraitData(designer, Number.isFinite(assessmentId) ? assessmentId : undefined),
      prisma.assessment.findFirst({
        where: { designerId, status: 'draft' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      }),
      prisma.userProject.findMany({
        where: { userId: designerId },
        select: { project: { select: { id: true, name: true, category: true } } },
        orderBy: [
          { project: { category: 'asc' } },
          { project: { sortOrder: 'asc' } },
          { project: { name: 'asc' } },
        ],
      }),
      showPerformance && designer.email
        ? // Не дольше бюджета: медленный ClickHouse не держит портрет, чип
          // просто не нарисуется, а запрос допишет кэш в фоне.
          withTimeout(fetchOnTimeStatsByEmail([designer.email]), PAGE_BUDGET_MS, 'fetchOnTimeStatsByEmail')
            .then((stats) => stats.get(designer.email.toLowerCase()) ?? null)
            .catch((err) => {
              console.error('[/lead/portrait] fetchOnTimeStatsByEmail failed:', err);
              return null;
            })
        : null,
      viewerRole === 'admin' || viewerRole === 'lead' ? getNineBoxTitle(designerId) : null,
      ['admin', 'lead', 'stardiz'].includes(viewerRole) ? getTeamGrowthMedian() : null,
    ]);

  if (result.kind === 'not_found') redirect('/admin/users');

  // Звать к форме оценки — только если её откроют: человек грейдируется
  // (не почасовщик и не билд без грейдов, активен, дизайнер/стардиз) и
  // зритель вправе его оценивать. Иначе /lead/assess вернёт назад или
  // скажет «не грейдируется».
  // Те же условия — у кнопок «Продолжить черновик» и «Новый цикл» в hero и
  // у «Провести оценку» на портрете без оценки.
  const canAssess = isGradable(designer) && canGradeDesigner(user, designer);
  const canViewSalary = canViewCompensation({ id: user.id, role: user.role }, designer);
  const canEditProjects = user.role === 'admin' || designerId === user.id;
  const initialProjects = userProjects.map((up) => up.project);
  const onTimePercent = onTime?.onTimePercent ?? null;
  const onTimeTotalTasks = onTime?.totalTasks ?? 0;

  // Оценки ещё нет — тот же портрет без блоков, которым она нужна: hero,
  // «Провести оценку», bento (XP пуст, «в срок», зарплата), проекты и
  // перформанс. Хлебных крошек нет — как у портрета с оценкой.
  if (result.kind === 'no_assessment') {
    return (
      <PortraitPending
        person={result.designer}
        view={pendingPortraitView({
          viewer: 'manager',
          person: designer,
          canAssess,
          hasDraft: !!draft,
        })}
        userId={designerId}
        canViewSalary={canViewSalary}
        nineBoxTitle={nineBoxTitle}
        initialProjects={initialProjects}
        canEditProjects={canEditProjects}
        showPerformance={showPerformance}
        onTimePercent={onTimePercent}
        onTimeTotalTasks={onTimeTotalTasks}
      />
    );
  }

  // Phase 17 — ИПР: можно ли мне (зрителю) создавать чек-листы на портрете
  // target'а (designer).
  const canCreateChecklists = canCreateChecklistFor(
    { id: user.id, role: user.role ?? '' },
    {
      id: designer.id,
      role: designer.role,
      leadId: designer.leadId,
      stardizId: designer.stardizId,
    },
  );

  return (
    <>
      <Portrait
        data={result.data}
        actions={
          <PortraitActions
            designerId={designerId}
            publishedAssessmentId={result.data.assessmentId}
            hasDraft={!!draft}
            canAssess={canAssess}
          />
        }
        siblingHrefPrefix={`/lead/portrait?id=${designerId}&assessmentId=`}
        canEditLeadComment={
          user.role === 'admin' ||
          designer.leadId === user.id ||
          designer.stardizId === user.id
        }
        userId={designerId}
        canViewSalary={canViewSalary}
        initialProjects={initialProjects}
        canEditProjects={canEditProjects}
        showPerformance={showPerformance}
        onTimePercent={onTimePercent}
        onTimeTotalTasks={onTimeTotalTasks}
        meRole={(user.role ?? 'designer') as Role}
        meUserId={user.id}
        canCreateChecklists={canCreateChecklists}
        nineBoxTitle={nineBoxTitle}
        teamGrowthMedian={teamGrowthMedian}
      />
    </>
  );
}
