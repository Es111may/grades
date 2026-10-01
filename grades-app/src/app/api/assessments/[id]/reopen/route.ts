export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { currentCycle } from '@/lib/cycle';
import { writeAudit, AUDIT_ACTIONS } from '@/lib/audit';
import { canGradeDesigner } from '@/lib/permissions';
import { isGradable, notGradableError } from '@/lib/employment';

/**
 * POST /api/assessments/[id]/reopen
 *
 * Создаёт новый пустой черновик для дизайнера, не трогая старые
 * опубликованные оценки — они остаются в истории. Если у дизайнера
 * уже есть активный черновик — возвращаем его (не создаём дубль).
 *
 * Параметр [id] здесь — ID любой опубликованной оценки этого дизайнера
 * (используем для определения designerId и проверки прав).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getCurrentUser();
  if (!me || (me.role !== 'lead' && me.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const refId = parseInt(params.id, 10);
  if (isNaN(refId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const ref = await prisma.assessment.findUnique({
    where: { id: refId },
    include: {
      designer: {
        select: {
          leadId: true,
          stardizId: true,
          role: true,
          active: true,
          employmentType: true,
          build: { select: { code: true } },
        },
      },
    },
  });
  if (!ref) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Права — те же, что на оценку (canGradeDesigner); новый черновик —
  // только тем, кого грейдируют (не почасовщикам, не неактивным и не билду
  // без грейдов).
  if (!canGradeDesigner(me, ref.designer)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!isGradable(ref.designer)) {
    return NextResponse.json({ error: notGradableError(ref.designer) }, { status: 400 });
  }

  // Если активный draft уже есть — возвращаем его
  const existingDraft = await prisma.assessment.findFirst({
    where: { designerId: ref.designerId, status: 'draft' },
    orderBy: { createdAt: 'desc' },
  });
  if (existingDraft) {
    return NextResponse.json({ ok: true, newAssessmentId: existingDraft.id });
  }

  // Берём scores из последней опубликованной оценки этого дизайнера —
  // новая оценка обычно инкрементальная, начинать с нуля неудобно.
  const lastPublished = await prisma.assessment.findFirst({
    where: { designerId: ref.designerId, status: 'published' },
    orderBy: { publishedAt: 'desc' },
    include: { scores: true },
  });

  const newDraft = await prisma.assessment.create({
    data: {
      designerId: ref.designerId,
      leadId: me.id!,
      matrixVersionId: ref.matrixVersionId,
      cycle: currentCycle(),
      status: 'draft',
      scores: lastPublished
        ? {
            create: lastPublished.scores.map((s) => ({
              skillId: s.skillId,
              masteryLevel: s.masteryLevel,
            })),
          }
        : undefined,
    },
  });

  await writeAudit({
    actorId: me.id!,
    action: AUDIT_ACTIONS.ASSESSMENT_REOPENED,
    targetType: 'assessment',
    targetId: newDraft.id,
    extra: { designerId: ref.designerId, refAssessmentId: refId },
  });

  return NextResponse.json({ ok: true, newAssessmentId: newDraft.id });
}
