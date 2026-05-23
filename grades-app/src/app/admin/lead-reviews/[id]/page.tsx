export const dynamic = 'force-dynamic';

import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import type { LeadReviewAggregates } from '@/lib/leadSurvey';
import LeadReviewView from './LeadReviewView';

/**
 * /admin/lead-reviews/[id] — портрет лида/стардиза по конкретной оценке.
 * Доступ: admin (всегда), сам лид/стардиз (если targetUserId === me.id).
 */
export default async function LeadReviewPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await requireRole(['admin', 'lead', 'stardiz']);
  const reviewId = parseInt(params.id, 10);
  if (isNaN(reviewId)) notFound();

  const review = await prisma.leadReview.findUnique({
    where: { id: reviewId },
    include: {
      targetUser: {
        select: {
          id: true,
          fullName: true,
          role: true,
          avatarUrl: true,
          email: true,
          active: true,
        },
      },
    },
  });
  if (!review) notFound();

  const canView =
    me.role === 'admin' || (review.targetUserId === me.id);
  if (!canView) {
    redirect('/admin/users');
  }

  // Проекты лида/стардиза (Phase 24)
  const userProjects = await prisma.userProject.findMany({
    where: { userId: review.targetUserId },
    include: {
      project: { select: { id: true, name: true, category: true } },
    },
    orderBy: [
      { project: { category: 'asc' } },
      { project: { sortOrder: 'asc' } },
      { project: { name: 'asc' } },
    ],
  });

  // Все циклы того же лида — для переключателя в шапке + поиска предыдущего
  const allReviews = await prisma.leadReview.findMany({
    where: { targetUserId: review.targetUserId },
    orderBy: { importedAt: 'desc' },
    select: {
      id: true,
      period: true,
      importedAt: true,
      responseCount: true,
      aggregates: true,
    },
  });

  // Предыдущий цикл — следующая по дате запись, более старая чем текущая.
  // Сортировка desc, поэтому в массиве предыдущий идёт ПОСЛЕ текущего.
  const currentIdx = allReviews.findIndex((r) => r.id === review.id);
  const prev =
    currentIdx >= 0 && currentIdx < allReviews.length - 1
      ? allReviews[currentIdx + 1]
      : null;

  return (
    <LeadReviewView
      meRole={me.role}
      review={{
        id: review.id,
        period: review.period,
        importedAt: review.importedAt.toISOString(),
        responseCount: review.responseCount,
        aggregates: review.aggregates as unknown as LeadReviewAggregates,
        aiSummary: review.aiSummary,
        cdoSummary: review.cdoSummary,
      }}
      previous={
        prev
          ? {
              id: prev.id,
              period: prev.period,
              aggregates: prev.aggregates as unknown as LeadReviewAggregates,
            }
          : null
      }
      target={review.targetUser}
      siblings={allReviews.map((r) => ({
        id: r.id,
        period: r.period,
        importedAt: r.importedAt.toISOString(),
        responseCount: r.responseCount,
      }))}
      initialProjects={userProjects.map((up) => up.project)}
      canEditProjects={me.role === 'admin' || review.targetUserId === me.id}
    />
  );
}
