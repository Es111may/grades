/**
 * PUT    /api/users/[id]/planned-raise — поставить или уточнить плановый
 *        пересмотр (дата, новая ставка, обоснование — всё по желанию).
 * DELETE /api/users/[id]/planned-raise — снять.
 *
 * Права: админ — всем, лид — своим (lib/compPermissions). Phase 23.4.
 * «Выполнен» здесь не ставится — он выводится из HR-портала. Поэтому PUT
 * поверх выполненного (или с fresh: true) начинает новый статус: иначе он
 * считался бы от старой базы и сразу выглядел бы выполненным.
 * База (`plannedRaiseBaselineAt`) — последнее повышение, которое HR знал при
 * постановке: от неё повышение, внесённое задним числом, тоже закрывает
 * статус (lib/compensation → plannedRaiseState).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { canEditPlannedRaise } from '@/lib/compPermissions';
import { AUDIT_ACTIONS, writeAudit } from '@/lib/audit';
import {
  plannedRaiseBaseline,
  plannedRaiseState,
  shouldRestartPlan,
  type PlannedRaiseState,
} from '@/lib/compensation';
import { fetchHrCompensation, type HrCompensation } from '@/lib/hrSalary';

const bodySchema = z.object({
  at: z.string().nullable().optional(),
  // ₽/мес на руки
  salary: z.number().int().positive().max(10_000_000).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  // Клиент начинает новый статус («Запланировать пересмотр»), а не уточняет
  // текущий. Нужен, когда HR недоступен и сервер сам этого не поймёт.
  fresh: z.boolean().optional(),
});

async function guard(idParam: string) {
  const me = await getCurrentUser();
  const id = parseInt(idParam, 10);
  if (isNaN(id)) return { error: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) };
  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      leadId: true,
      active: true,
      plannedRaiseSetAt: true,
      plannedRaiseBaselineAt: true,
      plannedRaiseAt: true,
      plannedRaiseSalary: true,
    },
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
  // Ушедшим пересмотр не планируют (Phase 23.6a). Снять оставшийся — можно (DELETE).
  if (!g.target.active) {
    return NextResponse.json({ error: 'Человек неактивен — пересмотр не планируют' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  const at = data.at ? new Date(data.at) : data.at === null ? null : undefined;
  if (at && Number.isNaN(at.getTime())) {
    return NextResponse.json({ error: 'Некорректная дата пересмотра' }, { status: 400 });
  }

  // HR — тот же кэш и те же входы, что у GET /compensation: выполнен ли
  // текущий статус и какая база у нового. Недоступен — без него.
  let hr: HrCompensation | null = null;
  try {
    hr = await fetchHrCompensation(g.target.email);
  } catch (err) {
    console.error('[planned-raise] HR unavailable:', err);
  }
  const log = hr?.log ?? [];
  const hiredAt = hr?.hr?.hiredAt ?? null;
  const setAt = g.target.plannedRaiseSetAt;
  const state: PlannedRaiseState | null = !setAt
    ? 'none'
    : hr
      ? plannedRaiseState(
          {
            setAt: setAt.toISOString(),
            baselineAt: g.target.plannedRaiseBaselineAt?.toISOString() ?? null,
          },
          log,
          hiredAt,
        )
      : null;
  const restart = shouldRestartPlan(state, data.fresh === true);
  // База нового статуса — только по данным HR о человеке. HR недоступен или
  // человека там нет — null: статус считается по дате постановки, как старые
  // (иначе, найдись потом в HR прошлые повышения, статус сразу закрылся бы).
  const baseline = hr?.hr ? plannedRaiseBaseline(log, hiredAt) : null;

  // Отметку и базу не сдвигаем при уточнении деталей: от них считается,
  // выполнен ли пересмотр. Новый статус — с новыми отметкой и базой и без
  // деталей прежнего: чего нет в запросе, то пусто.
  const user = await prisma.user.update({
    where: { id: g.target.id },
    data: restart
      ? {
          plannedRaiseSetAt: new Date(),
          plannedRaiseBaselineAt: baseline ? new Date(`${baseline}T00:00:00Z`) : null,
          plannedRaiseSetById: g.me.id,
          plannedRaiseAt: at ?? null,
          plannedRaiseSalary: data.salary ?? null,
          plannedRaiseNote: data.note?.trim() || null,
        }
      : {
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
      plannedRaiseBaselineAt: null,
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
