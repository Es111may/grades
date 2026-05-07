export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

const PatchSchema = z.object({
  requiredMastery: z.number().int().min(1).max(10),
});

/** PATCH /api/gates/[gateId] — change required mastery, admin only */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { gateId: string } },
) {
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const gateId = parseInt(params.gateId, 10);
  if (isNaN(gateId)) {
    return NextResponse.json({ error: 'Invalid gate id' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await prisma.skillGate.update({
    where: { id: gateId },
    data: { requiredMastery: parsed.data.requiredMastery },
  });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/gates/[gateId] — remove gate, admin only */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { gateId: string } },
) {
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const gateId = parseInt(params.gateId, 10);
  if (isNaN(gateId)) {
    return NextResponse.json({ error: 'Invalid gate id' }, { status: 400 });
  }

  await prisma.skillGate.delete({ where: { id: gateId } });
  return NextResponse.json({ ok: true });
}
