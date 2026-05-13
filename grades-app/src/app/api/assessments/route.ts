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
 * POST /api/assessments — частичное обновление оценки.
 *
 * Поддерживает два независимых набора полей:
 *   - `scores` — массив { skillId, masteryLevel }, batch-апдейт. Доступно
 *     только для draft-оценки. Используется автосейвом формы.
 *   - `leadComment` — markdown-мнение лида/стардиза. Доступно и для
 *     published — на странице портрета можно дописать или поправить
 *     мнение позже без снятия публикации. Право проверяется отдельно:
 *     admin всегда, lead — если ведёт дизайнера, stardiz — если он лид
 *     или стардиз этого дизайнера.
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (
    !me ||
    !me.id ||
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
    select: { id: true, status: true, designerId: true },
  });

  if (!assessment) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
  }

  const wantsScoresUpdate = Array.isArray(scores);
  const wantsLeadCommentUpdate = leadComment !== undefined;

  // scores — только для draft
  if (wantsScoresUpdate && assessment.status === 'published') {
    return NextResponse.json(
      { error: 'Нельзя менять оценки в опубликованной оценке' },
      { status: 400 },
    );
  }

  // leadComment — отдельная проверка прав на этого конкретного дизайнера
  if (wantsLeadCommentUpdate) {
    const designer = await prisma.user.findUnique({
      where: { id: assessment.designerId },
      select: { leadId: true, stardizId: true },
    });
    const canEditLeadComment =
      me.role === 'admin' ||
      (me.role === 'lead' && designer?.leadId === me.id) ||
      (me.role === 'stardiz' &&
        (designer?.stardizId === me.id || designer?.leadId === me.id));
    if (!canEditLeadComment) {
      return NextResponse.json(
        { error: 'Только лид/стардиз этого дизайнера может писать мнение' },
        { status: 403 },
      );
    }
  }

  if (wantsScoresUpdate && scores) {
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

  if (wantsLeadCommentUpdate) {
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { leadComment: leadComment ?? null },
    });
  }

  return NextResponse.json({ ok: true });
}
