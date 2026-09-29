/**
 * PUT    /api/users/[id]/planned-raise — поставить или уточнить плановый
 *        пересмотр (дата, новая ставка, обоснование — всё по желанию).
 * DELETE /api/users/[id]/planned-raise — снять.
 *
 * Права: админ — всем, лид — своим (lib/compPermissions). Phase 23.4.
 * «Выполнен» здесь не ставится — он выводится из HR-портала.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { canEditPlannedRaise } from '@/lib/compPermissions';
import { AUDIT_ACTIONS, writeAudit } from '@/lib/audit';

const bodySchema = z.object({
  at: z.string().nullable().optional(),
  // ₽/мес на руки
  salary: z.number().int().positive().max(10_000_000).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

async function guard(idParam: string) {
  const me = await getCurrentUser();
  const id = parseInt(idParam, 10);
  if (isNaN(id)) return { error: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) };
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, leadId: true, plannedRaiseSetAt: true, plannedRaiseAt: true, plannedRaiseSalary: true },
  });
  if (!target) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  const viewer = me?.id ? { id: me.id, role: me.role } : null;
  if (!viewer || !canEditPlannedRaise(viewer, target)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { me: viewer, target };
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id);
  if ('error' in g) return g.error;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  const at = data.at ? new Date(data.at) : data.at === null ? null : undefined;
  if (at && Number.isNaN(at.getTime())) {
    return NextResponse.json({ error: 'Некорректная дата пересмотра' }, { status: 400 });
  }

  // Отметку постановки не сдвигаем при уточнении деталей: от неё считается,
  // выполнен ли пересмотр.
  const user = await prisma.user.update({
    where: { id: g.target.id },
    data: {
      plannedRaiseSetAt: g.target.plannedRaiseSetAt ?? new Date(),
      plannedRaiseSetById: g.target.plannedRaiseSetAt ? undefined : g.me.id,
      ...(at !== undefined && { plannedRaiseAt: at }),
      ...(data.salary !== undefined && { plannedRaiseSalary: data.salary }),
      ...(data.note !== undefined && { plannedRaiseNote: data.note?.trim() || null }),
    },
    select: { plannedRaiseSetAt: true, plannedRaiseAt: true, plannedRaiseSalary: true, plannedRaiseNote: true },
  });

  await writeAudit({
    actorId: g.me.id,
    action: AUDIT_ACTIONS.PLANNED_RAISE_SET,
    targetType: 'user',
    targetId: g.target.id,
    before: { at: g.target.plannedRaiseAt?.toISOString() ?? null, salary: g.target.plannedRaiseSalary },
    after: { at: user.plannedRaiseAt?.toISOString() ?? null, salary: user.plannedRaiseSalary },
  });

  return NextResponse.json({
    setAt: user.plannedRaiseSetAt?.toISOString() ?? null,
    at: user.plannedRaiseAt?.toISOString() ?? null,
    salary: user.plannedRaiseSalary,
    note: user.plannedRaiseNote,
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id);
  if ('error' in g) return g.error;
  await prisma.user.update({
    where: { id: g.target.id },
    data: {
      plannedRaiseSetAt: null,
      plannedRaiseAt: null,
      plannedRaiseSalary: null,
      plannedRaiseNote: null,
      plannedRaiseSetById: null,
    },
  });
  await writeAudit({
    actorId: g.me.id,
    action: AUDIT_ACTIONS.PLANNED_RAISE_CLEARED,
    targetType: 'user',
    targetId: g.target.id,
  });
  return NextResponse.json({ ok: true });
}
