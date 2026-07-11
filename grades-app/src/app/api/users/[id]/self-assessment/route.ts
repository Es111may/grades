/**
 * GET /api/users/[id]/self-assessment — самооценки и подтверждения дизайнера
 * одним ответом (Phase 14).
 *
 * Права: сам владелец, его лид/стардиз, admin —
 * см. src/lib/selfAssessmentPermissions.ts.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { canViewSelfAssessment } from '@/lib/selfAssessmentPermissions';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getCurrentUser();
  if (!me?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = parseInt(params.id, 10);
  if (isNaN(ownerId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, role: true, active: true, leadId: true, stardizId: true },
  });
  if (!owner) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!canViewSelfAssessment({ id: me.id, role: me.role ?? '' }, owner)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [selfAssessments, evidences] = await Promise.all([
    prisma.selfAssessment.findMany({
      where: { designerId: ownerId },
      select: {
        skillId: true,
        level: true,
        comment: true,
        updatedAt: true,
      },
    }),
    prisma.skillEvidence.findMany({
      where: { designerId: ownerId },
      select: {
        id: true,
        skillId: true,
        url: true,
        title: true,
        description: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return NextResponse.json({ selfAssessments, evidences });
}
