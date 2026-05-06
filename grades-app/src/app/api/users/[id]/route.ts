export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { z } from 'zod';

const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'lead', 'designer']).optional(),
  buildId: z.number().nullable().optional(),
  department: z.string().nullable().optional(),
  leadId: z.number().nullable().optional(),
  hiredAt: z.string().nullable().optional(),
  active: z.boolean().optional(),
  gradeFloor: z.string().nullable().optional(),
  gradeFloorReason: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = parseInt(params.id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await req.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Audit grade_floor changes
  const floorChanged =
    data.gradeFloor !== undefined && data.gradeFloor !== existing.gradeFloor;
  const floorLowered = floorChanged && isFloorLowered(existing.gradeFloor, data.gradeFloor);
  const floorRemoved = floorChanged && existing.gradeFloor && !data.gradeFloor;

  if (floorLowered || floorRemoved) {
    await prisma.auditLog.create({
      data: {
        actorId: me.id!,
        action: floorRemoved ? 'grade_floor_removed' : 'grade_floor_lowered',
        targetType: 'user',
        targetId: userId,
        details: {
          before: existing.gradeFloor,
          after: data.gradeFloor ?? null,
          reason: data.gradeFloorReason ?? existing.gradeFloorReason ?? '',
        },
      },
    });
  } else if (floorChanged) {
    await prisma.auditLog.create({
      data: {
        actorId: me.id!,
        action: 'grade_floor_changed',
        targetType: 'user',
        targetId: userId,
        details: {
          before: existing.gradeFloor,
          after: data.gradeFloor,
          reason: data.gradeFloorReason ?? '',
        },
      },
    });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.fullName !== undefined && { fullName: data.fullName }),
      ...(data.email !== undefined && { email: data.email.toLowerCase() }),
      ...(data.role !== undefined && { role: data.role }),
      ...(data.buildId !== undefined && { buildId: data.buildId }),
      ...(data.department !== undefined && { department: data.department }),
      ...(data.leadId !== undefined && { leadId: data.leadId }),
      ...(data.hiredAt !== undefined && {
        hiredAt: data.hiredAt ? new Date(data.hiredAt) : null,
      }),
      ...(data.active !== undefined && { active: data.active }),
      ...(data.gradeFloor !== undefined && { gradeFloor: data.gradeFloor }),
      ...(data.gradeFloorReason !== undefined && {
        gradeFloorReason: data.gradeFloorReason,
      }),
    },
    include: { build: true, lead: { select: { id: true, fullName: true } } },
  });

  return NextResponse.json(user);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = parseInt(params.id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  if (userId === me.id) {
    return NextResponse.json({ error: 'Нельзя удалить себя' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { active: false },
  });

  return NextResponse.json({ ok: true });
}

const GRADE_ORDER = ['intern', 'junior', 'junior_plus', 'middle', 'middle_plus', 'senior'];

function isFloorLowered(before: string | null, after: string | null | undefined): boolean {
  if (!before || !after) return false;
  const beforeIdx = GRADE_ORDER.indexOf(before);
  const afterIdx = GRADE_ORDER.indexOf(after);
  if (beforeIdx === -1 || afterIdx === -1) return false;
  return afterIdx < beforeIdx;
}
