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

  // Все циклы того же лида — для переключателя в шапке
  const allReviews = await prisma.leadReview.findMany({
    where: { targetUserId: review.targetUserId },
    orderBy: { importedAt: 'desc' },
    select: { id: true, period: true, importedAt: true, responseCount: true },
  });

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
      target={review.targetUser}
      siblings={allReviews.map((r) => ({
        id: r.id,
        period: r.period,
        importedAt: r.importedAt.toISOString(),
        responseCount: r.responseCount,
      }))}
    />
  );
}
