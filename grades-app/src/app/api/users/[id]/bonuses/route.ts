/**
 * POST /api/users/[id]/bonuses — внести разовую премию (Phase 23.4).
 * Только админ. В HR-портале премий нет, поэтому ведём их в Грейдах.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { canEditBonuses } from '@/lib/compPermissions';
import { AUDIT_ACTIONS, writeAudit } from '@/lib/audit';

const bodySchema = z.object({
  amount: z.number().int().positive().max(10_000_000), // ₽ на руки
  paidAt: z.string(),
  note: z.string().max(300).nullable().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me?.id || !canEditBonuses({ id: me.id, role: me.role })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const userId = parseInt(params.id, 10);
  if (isNaN(userId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const paidAt = new Date(parsed.data.paidAt);
  if (Number.isNaN(paidAt.getTime())) {
    return NextResponse.json({ error: 'Некорректная дата премии' }, { status: 400 });
  }
  const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const bonus = await prisma.bonus.create({
    data: {
      userId,
      amount: parsed.data.amount,
      paidAt,
      note: parsed.data.note?.trim() || null,
      createdById: me.id,
    },
  });
  await writeAudit({
    actorId: me.id,
    action: AUDIT_ACTIONS.BONUS_CREATED,
    targetType: 'user',
    targetId: userId,
    after: { amount: bonus.amount, paidAt: bonus.paidAt.toISOString() },
  });
  return NextResponse.json(
    { id: bonus.id, amount: bonus.amount, paidAt: bonus.paidAt.toISOString(), note: bonus.note },
    { status: 201 },
  );
}
