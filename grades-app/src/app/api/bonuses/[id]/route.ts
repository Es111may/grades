/**
 * DELETE /api/bonuses/[id] — удалить премию (Phase 23.4). Только админ.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { canEditBonuses } from '@/lib/compPermissions';
import { AUDIT_ACTIONS, writeAudit } from '@/lib/audit';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me?.id || !canEditBonuses({ id: me.id, role: me.role })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const bonus = await prisma.bonus.findUnique({ where: { id } });
  if (!bonus) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.bonus.delete({ where: { id } });
  await writeAudit({
    actorId: me.id,
    action: AUDIT_ACTIONS.BONUS_DELETED,
    targetType: 'user',
    targetId: bonus.userId,
    before: { amount: bonus.amount, paidAt: bonus.paidAt.toISOString() },
  });
  return NextResponse.json({ ok: true });
}
