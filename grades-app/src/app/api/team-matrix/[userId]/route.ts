export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { canManageUsers } from '@/lib/permissions';
import { z } from 'zod';

const placementSchema = z.object({
  potentialLevel: z.enum(['low', 'mid', 'high']),
  performanceLevel: z.enum(['low', 'mid', 'high']),
});

export async function PUT(req: NextRequest, { params }: { params: { userId: string } }) {
  const me = await getCurrentUser();
  if (!me || !canManageUsers(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = parseInt(params.userId, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, active: true },
  });
  if (!target) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (target.role !== 'designer' && target.role !== 'stardiz') {
    return NextResponse.json(
      { error: 'В матрице только дизайнеры и стардизы' },
      { status: 400 },
    );
  }

  const body = await req.json();
  const parsed = placementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { potentialLevel, performanceLevel } = parsed.data;
  const cell = await prisma.teamMatrixCell.upsert({
    where: { userId },
    update: { potentialLevel, performanceLevel, updatedById: me.id! },
    create: { userId, potentialLevel, performanceLevel, updatedById: me.id! },
    select: {
      userId: true,
      potentialLevel: true,
      performanceLevel: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(cell);
}

export async function DELETE(_req: NextRequest, { params }: { params: { userId: string } }) {
  const me = await getCurrentUser();
  if (!me || !canManageUsers(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = parseInt(params.userId, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  await prisma.teamMatrixCell.deleteMany({ where: { userId } });
  return NextResponse.json({ ok: true });
}
