export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import type { LeadReviewAggregates } from '@/lib/leadSurvey';

/**
 * GET /api/users/[id]/history
 *
 * Возвращает историю оценок пользователя — Assessment'ы для дизайнера,
 * LeadReview'ы для лида/стардиза. Используется лениво в UserCard360.
 *
 * Права:
 *   - сам пользователь (targetId === me.id) — всегда.
 *   - admin — всегда.
 *   - lead — если target.leadId === me.id.
 *   - stardiz — если target.stardizId === me.id или target.leadId === me.id.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getCurrentUser();
  if (!me || !me.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const targetId = parseInt(params.id, 10);
  if (isNaN(targetId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true, leadId: true, stardizId: true },
  });
  if (!target) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const isSelf = targetId === me.id;
  const canView =
    isSelf ||
    me.role === 'admin' ||
    (me.role === 'lead' && target.leadId === me.id) ||
    (me.role === 'stardiz' &&
      (target.stardizId === me.id || target.leadId === me.id));
  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Assessment-история (для всех ролей, у кого она есть — дизайнер, стардиз)
  const assessments = await prisma.assessment.findMany({
    where: { designerId: targetId, status: 'published' },
    orderBy: { publishedAt: 'desc' },
    include: {
      lead: { select: { fullName: true } },
    },
  });

  // LeadReview-история (только для лидов и стардизов)
  let leadReviews: Array<{
    id: number;
    period: string;
    importedAt: string;
    responseCount: number;
    enps: number | null;
  }> = [];
  if (target.role === 'lead' || target.role === 'stardiz') {
    const rows = await prisma.leadReview.findMany({
      where: { targetUserId: targetId },
      orderBy: { importedAt: 'desc' },
      select: { id: true, period: true, importedAt: true, responseCount: true, aggregates: true },
    });
    leadReviews = rows.map((r) => {
      const agg = r.aggregates as unknown as LeadReviewAggregates;
      return {
        id: r.id,
        period: r.period,
        importedAt: r.importedAt.toISOString(),
        responseCount: r.responseCount,
        enps: agg?.enps?.average ?? null,
      };
    });
  }

  return NextResponse.json({
    assessments: assessments.map((a) => ({
      id: a.id,
      publishedAt: a.publishedAt?.toISOString() ?? null,
      effectiveGrade: a.effectiveGrade,
      totalXp: a.totalXp,
      leadName: a.lead?.fullName ?? null,
    })),
    leadReviews,
  });
}
