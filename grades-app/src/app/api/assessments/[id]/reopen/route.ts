export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

/**
 * POST /api/assessments/[id]/reopen
 *
 * Архивирует опубликованную оценку и создаёт новый черновик на тот же цикл.
 * Старый снапшот сохраняется (для истории), новый draft пустой — лид
 * заполняет с нуля.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getCurrentUser();
  if (!me || (me.role !== 'lead' && me.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const oldId = parseInt(params.id, 10);
  const old = await prisma.assessment.findUnique({ where: { id: oldId } });
  if (!old) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (old.status !== 'published') {
    return NextResponse.json(
      { error: 'Можно переоткрыть только опубликованную оценку' },
      { status: 400 },
    );
  }

  // Permission: lead of the designer or admin
  if (me.role !== 'admin') {
    const designer = await prisma.user.findUnique({ where: { id: old.designerId } });
    if (!designer || designer.leadId !== me.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Архивируем старую и создаём новый draft на тот же цикл
  const newDraft = await prisma.$transaction(async (tx) => {
    await tx.assessment.update({
      where: { id: oldId },
      data: { status: 'archived' },
    });

    return tx.assessment.create({
      data: {
        designerId: old.designerId,
        leadId: me.id!,
        matrixVersionId: old.matrixVersionId,
        cycle: old.cycle,
        status: 'draft',
      },
    });
  });

  return NextResponse.json({ ok: true, newAssessmentId: newDraft.id });
}
