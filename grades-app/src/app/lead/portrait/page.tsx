export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { loadPortraitData } from '@/lib/portrait';
import { fetchOnTimeStatsByEmail } from '@/lib/clickhousePerfBatch';
import { canCreateChecklistFor, type Role } from '@/lib/checklistPermissions';
import { GRADE_NAMES } from '@/lib/types';
import type { GradeCode } from '@/lib/types';
import Portrait from '@/app/designer/Portrait';
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

  // Permission: admin / designer's lead / designer's stardiz
  const designer = await prisma.user.findUnique({ where: { id: designerId } });
  if (!designer) redirect('/admin/users');
  const canView =
    user.role === 'admin' ||
    designer.leadId === user.id ||
    designer.stardizId === user.id;
  if (!canView) redirect('/admin/users');

  const assessmentId = searchParams.assessmentId
    ? parseInt(searchParams.assessmentId, 10)
    : undefined;
  const result = await loadPortraitData(
    designerId,
    Number.isFinite(assessmentId) ? assessmentId : undefined,
  );

  if (result.kind === 'not_found') redirect('/admin/users');

  if (result.kind === 'no_assessment') {
    return (
      <main className="max-w-[1400px] mx-auto px-8 pt-8 pb-16">
        <div className="text-xs text-stone mb-3">
          <Link href="/admin/users" className="hover:text-ink transition-colors">
            Команда
          </Link>
          <span className="text-ash mx-1.5">/</span>
          <span>{result.designer.fullName}</span>
        </div>
        <div className="mb-8">
          <h1 className="font-display text-4xl font-medium tracking-tight mb-2">
            {result.designer.fullName}
          </h1>
        </div>
        <div className="card p-10 text-center">
          <div className="font-display text-2xl font-medium tracking-tight mb-2">
            Оценка не опубликована
          </div>
          <p className="text-stone mb-6">
            Чтобы увидеть портрет — заполни и опубликуй первую оценку.
          </p>
          <Link href={`/lead/assess?id=${designerId}`} className="btn-accent">
            К форме оценки
          </Link>
        </div>
        {result.designer.gradeFloor && (
          <div className="bg-lime-light/60 border border-lime/30 rounded-card p-5 mt-5">
            <div className="text-[11px]  text-graphite mb-1.5">
              Зафиксированный грейд
            </div>
            <p className="text-sm text-graphite leading-relaxed">
              За дизайнером закреплён грейд{' '}
              <strong>
                {GRADE_NAMES[result.designer.gradeFloor as GradeCode] ??
                  result.designer.gradeFloor}
              </strong>
              .
            </p>
          </div>
        )}
      </main>
    );
  }

  const draft = await prisma.assessment.findFirst({
    where: { designerId, status: 'draft' },
    orderBy: { createdAt: 'desc' },
  });

  const userProjects = await prisma.userProject.findMany({
    where: { userId: designerId },
    include: {
      project: { select: { id: true, name: true, category: true } },
    },
    orderBy: [
      { project: { category: 'asc' } },
      { project: { sortOrder: 'asc' } },
      { project: { name: 'asc' } },
    ],
  });

  // Перформанс — только для designer/stardiz целевого пользователя.
  // Лида/админа на собственном портрете тут вообще не открывают, но если
  // вдруг будет ссылка — блок не покажем.
  const showPerformance = designer.role === 'designer' || designer.role === 'stardiz';
  let onTimePercent: number | null = null;
  let onTimeTotalTasks = 0;
  if (showPerformance && designer.email) {
    try {
      const stats = await fetchOnTimeStatsByEmail([designer.email]);
      const s = stats.get(designer.email.toLowerCase());
      if (s) {
        onTimePercent = s.onTimePercent;
        onTimeTotalTasks = s.totalTasks;
      }
    } catch (err) {
      console.error('[/lead/portrait] fetchOnTimeStatsByEmail failed:', err);
    }
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
      <PortraitActions
        designerId={designerId}
        publishedAssessmentId={result.data.assessmentId}
        hasDraft={!!draft}
      />
      <Portrait
        data={result.data}
        breadcrumb={{ href: '/admin/users', label: 'Команда' }}
        siblingHrefPrefix={`/lead/portrait?id=${designerId}&assessmentId=`}
        canEditLeadComment={
          user.role === 'admin' ||
          designer.leadId === user.id ||
          designer.stardizId === user.id
        }
        userId={designerId}
        initialProjects={userProjects.map((up) => up.project)}
        canEditProjects={user.role === 'admin' || designerId === user.id}
        showPerformance={showPerformance}
        onTimePercent={onTimePercent}
        onTimeTotalTasks={onTimeTotalTasks}
        meRole={(user.role ?? 'designer') as Role}
        meUserId={user.id}
        canCreateChecklists={canCreateChecklists}
      />
    </>
  );
}
