export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  role: z.enum(['admin', 'lead', 'designer']),
  buildId: z.number().nullable().optional(),
  department: z.string().nullable().optional(),
  leadId: z.number().nullable().optional(),
  hiredAt: z.string().nullable().optional(),
  active: z.boolean().optional(),
  gradeFloor: z.string().nullable().optional(),
  gradeFloorReason: z.string().nullable().optional(),
});

export async function GET() {
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    include: { build: true, lead: { select: { id: true, fullName: true } } },
    orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
  });

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
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
      hiredAt: data.hiredAt ? new Date(data.hiredAt) : null,
      active: data.active ?? true,
      gradeFloor: data.gradeFloor ?? null,
      gradeFloorReason: data.gradeFloorReason ?? null,
    },
    include: { build: true, lead: { select: { id: true, fullName: true } } },
  });

  return NextResponse.json(user, { status: 201 });
}
