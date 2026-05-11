export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

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

  await prisma.leadReview.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
