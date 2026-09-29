export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { z } from 'zod';
import {
  canAssignAdminRole,
  canManageUsers,
} from '@/lib/permissions';
import { canSetEmploymentType } from '@/lib/employment';
import { DISMISSAL_TYPES, canEditDismissal } from '@/lib/dismissal';
import { userForViewer } from '@/lib/userResponse';

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
  // Phase 23.4 — почасовщик. Права — отдельно, см. canSetEmploymentType.
  employmentType: z.enum(['staff', 'hourly']).optional(),
  // Phase 23.4 — увольнение (например, почасовщик, выведенный из штата).
  // Только админ, см. lib/dismissal.
  dismissedAt: z.string().nullable().optional(),
  dismissalType: z.enum(DISMISSAL_TYPES).nullable().optional(),
  dismissalReason: z.string().trim().max(300).nullable().optional(),
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

  // Записи целиком — вырезаем то, что зрителю видеть нельзя (увольнение,
  // плановый пересмотр чужих людей, хэш пароля), см. lib/userResponse.
  const viewer = { id: me.id!, role: me.role };
  return NextResponse.json(users.map((u) => userForViewer(u, viewer)));
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

  const hourly = data.employmentType === 'hourly';
  if (
    hourly &&
    !canSetEmploymentType(me as { id: number; role: string }, {
      role: data.role,
      leadId: data.leadId ?? null,
    })
  ) {
    return NextResponse.json(
      { error: 'Сделать почасовщиком может админ или лид этого дизайнера' },
      { status: 403 },
    );
  }

  const dismissalProvided =
    data.dismissedAt !== undefined ||
    data.dismissalType !== undefined ||
    data.dismissalReason !== undefined;
  if (dismissalProvided && !canEditDismissal(me)) {
    return NextResponse.json(
      { error: 'Данные об увольнении может менять только админ' },
      { status: 403 },
    );
  }
  const dismissedAt = data.dismissedAt ? new Date(data.dismissedAt) : null;
  if (dismissedAt && Number.isNaN(dismissedAt.getTime())) {
    return NextResponse.json({ error: 'Некорректная дата увольнения' }, { status: 400 });
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
      employmentType: hourly ? 'hourly' : 'staff',
      dismissedAt,
      dismissalType: data.dismissalType ?? null,
      dismissalReason: data.dismissalReason || null,
    },
    include: {
      build: true,
      lead: { select: { id: true, fullName: true } },
      stardiz: { select: { id: true, fullName: true } },
    },
  });

  return NextResponse.json(userForViewer(user, { id: me.id!, role: me.role }), {
    status: 201,
  });
}
