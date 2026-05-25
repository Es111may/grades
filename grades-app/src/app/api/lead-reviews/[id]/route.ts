export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { writeAudit, AUDIT_ACTIONS } from '@/lib/audit';

const patchSchema = z.object({
  period: z.string().min(1).max(120).optional(),
  aiSummary: z.string().max(50_000).nullable().optional(),
  cdoSummary: z.string().max(50_000).nullable().optional(),
});

/**
 * PATCH /api/lead-reviews/[id] — редактирование сводных текстовых полей
 * (aiSummary, cdoSummary, period). Только admin.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.leadReview.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.leadReview.update({
    where: { id },
    data: {
      ...(parsed.data.period !== undefined && { period: parsed.data.period }),
      ...(parsed.data.aiSummary !== undefined && { aiSummary: parsed.data.aiSummary }),
      ...(parsed.data.cdoSummary !== undefined && { cdoSummary: parsed.data.cdoSummary }),
    },
  });

  // Логируем какие поля менялись — без полного текста, чтобы лог не пухал.
  const changedFields = Object.keys(parsed.data).filter(
    (k) => parsed.data[k as keyof typeof parsed.data] !== undefined,
  );
  await writeAudit({
    actorId: me.id!,
    action: AUDIT_ACTIONS.LEAD_REVIEW_UPDATED,
    targetType: 'lead_review',
    targetId: id,
    extra: { targetUserId: existing.targetUserId, fields: changedFields },
  });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/lead-reviews/[id] — удаление оценки. Только admin.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const existing = await prisma.leadReview.findUnique({
    where: { id },
    select: { id: true, targetUserId: true, period: true },
  });
  await prisma.leadReview.delete({ where: { id } });

  if (existing) {
    await writeAudit({
      actorId: me.id!,
      action: AUDIT_ACTIONS.LEAD_REVIEW_DELETED,
      targetType: 'lead_review',
      targetId: id,
      extra: { targetUserId: existing.targetUserId, period: existing.period },
    });
  }

  return NextResponse.json({ ok: true });
}
