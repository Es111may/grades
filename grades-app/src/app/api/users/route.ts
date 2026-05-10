export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { z } from 'zod';
import {
  canAssignAdminRole,
  canManageUsers,
} from '@/lib/permissions';

const createUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  role: z.enum(['admin', 'lead', 'stardiz', 'designer']),
  buildId: z.number().nullable().optional(),
  department: z.string().nullable().optional(),
  leadId: z.number().nullable().optional(),
  stardizId: z.number().nullable().optional(),
  hiredAt: z.string().nullable().optional(),
  active: z.boolean().optional(),
  gradeFloor: z.string().nullable().optional(),
  gradeFloorReason: z.string().nullable().optional(),
  // Аватар как data URL — ресайзим на клиенте до 256×256, ограничение ~200KB.
  avatarUrl: z.string().max(300_000).nullable().optional(),
});

export async function GET() {
  const me = await getCurrentUser();
  if (!me || !canManageUsers(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    include: {
      build: true,
      lead: { select: { id: true, fullName: true } },
      stardiz: { select: { id: true, fullName: true } },
    },
    orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
  });

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me || !canManageUsers(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // Только admin может создавать админов
  if (data.role === 'admin' && !canAssignAdminRole(me.role)) {
    return NextResponse.json(
      { error: 'Только админ может назначать роль admin' },
      { status: 403 },
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email: data.email.toLowerCase() },
  });
  if (existing) {
    return NextResponse.json({ error: 'Email уже занят' }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      email: data.email.toLowerCase(),
      fullName: data.fullName,
      role: data.role,
      buildId: data.buildId ?? null,
      department: data.department ?? null,
      leadId: data.leadId ?? null,
      stardizId: data.stardizId ?? null,
      hiredAt: data.hiredAt ? new Date(data.hiredAt) : null,
      active: data.active ?? true,
      gradeFloor: data.gradeFloor ?? null,
      gradeFloorReason: data.gradeFloorReason ?? null,
      avatarUrl: data.avatarUrl ?? null,
    },
    include: {
      build: true,
      lead: { select: { id: true, fullName: true } },
      stardiz: { select: { id: true, fullName: true } },
    },
  });

  return NextResponse.json(user, { status: 201 });
}
