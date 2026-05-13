export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

/** GET /api/assessments?designerId=X — get or create draft assessment for current cycle */
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me || (me.role !== 'lead' && me.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const designerId = parseInt(req.nextUrl.searchParams.get('designerId') ?? '', 10);
  if (isNaN(designerId)) {
    return NextResponse.json({ error: 'designerId required' }, { status: 400 });
  }

  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const cycle = month <= 6
    ? `${now.getFullYear()}-04`
    : `${now.getFullYear()}-10`;

  // Try to find existing assessment for this cycle
  let assessment = await prisma.assessment.findFirst({
    where: { designerId, cycle, status: { not: 'archived' } },
    orderBy: { createdAt: 'desc' },
    include: { scores: true },
  });

  if (!assessment) {
    // Get current matrix version
    const matrix = await prisma.matrixVersion.findFirst({ where: { isCurrent: true } });
    if (!matrix) {
      return NextResponse.json({ error: 'No active matrix' }, { status: 400 });
    }

    assessment = await prisma.assessment.create({
      data: {
        designerId,
        leadId: me.id!,
        matrixVersionId: matrix.id,
        cycle,
        status: 'draft',
      },
      include: { scores: true },
    });
  }

  return NextResponse.json(assessment);
}

/**
 * POST /api/assessments — batch save scores (auto-save) и/или
 * обновление поля leadComment (мнение дизайн-лида).
 *
 * Полезная нагрузка: { assessmentId, scores?, leadComment? }.
 * Хотя бы одно из {scores, leadComment} должно присутствовать.
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (
    !me ||
    (me.role !== 'lead' && me.role !== 'admin' && me.role !== 'stardiz')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { assessmentId, scores, leadComment } = body as {
    assessmentId: number;
    scores?: { skillId: number; masteryLevel: number }[];
    leadComment?: string | null;
  };

  if (!assessmentId) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
  });

  if (!assessment || assessment.status === 'published') {
    return NextResponse.json(
      { error: 'Assessment not found or already published' },
      { status: 400 },
    );
  }

  if (Array.isArray(scores)) {
    for (const s of scores) {
      await prisma.assessmentScore.upsert({
        where: {
          assessmentId_skillId: { assessmentId, skillId: s.skillId },
        },
        create: {
          assessmentId,
          skillId: s.skillId,
          masteryLevel: s.masteryLevel,
        },
        update: {
          masteryLevel: s.masteryLevel,
        },
      });
    }
  }

  if (leadComment !== undefined) {
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { leadComment: leadComment ?? null },
    });
  }

  return NextResponse.json({ ok: true });
}
