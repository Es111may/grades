export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { currentCycle } from '@/lib/cycle';

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
  const ref = await prisma.assessment.findUnique({ where: { id: refId } });
  if (!ref) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Permission: admin / lead / stardiz of the designer
  if (me.role !== 'admin') {
    const designer = await prisma.user.findUnique({ where: { id: ref.designerId } });
    const allowed =
      designer && (designer.leadId === me.id || designer.stardizId === me.id);
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
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

  return NextResponse.json({ ok: true, newAssessmentId: newDraft.id });
}
