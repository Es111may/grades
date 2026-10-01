/**
 * PUT /api/users/[id]/grading-date — поставить или снять дату грейдирования.
 * Body: { nextGradingAt: string | null } — YYYY-MM-DD или ISO; null — снять.
 *
 * Отдельно от PATCH /api/users/[id]: дату ставит и стардиз своим подопечным,
 * а карточку человека он править не может (canManageUsers). Права —
 * canSetGradingDate (админ всем, лид и стардиз своим).
 *
 * Семантика та же, что у PATCH: сравнение по дню, «кто и когда поставил»
 * пишется только при реальной смене — от этой отметки зависит «проведено»
 * (lib/gradingPlan). Ответ:
 *   { nextGradingAt: string|null, nextGradingSetAt: string|null,
 *     nextGradingSetBy: { id, fullName } | null }
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { canSetGradingDate } from '@/lib/gradingPlan';
import { AUDIT_ACTIONS } from '@/lib/audit';
import { canHaveGradingDate, gradingDateChange } from '@/lib/userUpdate';
import { nonGradingBuildNote } from '@/lib/employment';

const putSchema = z.object({
  nextGradingAt: z.string().nullable(),
});

const planSelect = {
  nextGradingAt: true,
  nextGradingSetAt: true,
  nextGradingSetBy: { select: { id: true, fullName: true } },
} as const;

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me?.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = parseInt(params.id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      leadId: true,
      stardizId: true,
      employmentType: true,
      // Билд без грейдов — даты не ставят (canHaveGradingDate)
      build: { select: { code: true } },
      active: true,
      nextGradingAt: true,
    },
  });
  if (!target) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!canSetGradingDate({ id: me.id, role: me.role }, target)) {
    return NextResponse.json(
      { error: 'Дату грейдирования можно ставить только своим подопечным' },
      { status: 403 },
    );
  }

  const change = gradingDateChange(target.nextGradingAt, parsed.data.nextGradingAt);
  if ('error' in change) {
    return NextResponse.json({ error: change.error }, { status: 400 });
  }
  if (change.changed && change.nextGradingAt && !canHaveGradingDate(target)) {
    return NextResponse.json(
      {
        error:
          nonGradingBuildNote(target) ??
          'Дату грейдирования ставят только штатным дизайнерам и стардизам',
      },
      { status: 400 },
    );
  }
  // Неактивного не грейдируют (Phase 23.6a: ушедшие из реестра HR). Снять
  // оставшуюся дату можно — это не «назначить».
  if (change.changed && change.nextGradingAt && !target.active) {
    return NextResponse.json(
      { error: 'Человек неактивен — дату грейдирования не ставят' },
      { status: 400 },
    );
  }

  let plan;
  if (change.changed) {
    const { nextGradingAt } = change;
    // Правка и запись в журнал — вместе: упавший update не оставит следов.
    const [updated] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          nextGradingAt,
          nextGradingSetById: nextGradingAt ? me.id : null,
          nextGradingSetAt: nextGradingAt ? new Date() : null,
        },
        select: planSelect,
      }),
      prisma.auditLog.create({
        data: {
          actorId: me.id,
          action: nextGradingAt
            ? AUDIT_ACTIONS.GRADING_DATE_SET
            : AUDIT_ACTIONS.GRADING_DATE_CLEARED,
          targetType: 'user',
          targetId: userId,
          details: {
            before: target.nextGradingAt?.toISOString() ?? null,
            after: nextGradingAt?.toISOString() ?? null,
          },
        },
      }),
    ]);
    plan = updated;
  } else {
    plan = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: planSelect });
  }

  return NextResponse.json({
    nextGradingAt: plan.nextGradingAt?.toISOString() ?? null,
    nextGradingSetAt: plan.nextGradingSetAt?.toISOString() ?? null,
    nextGradingSetBy: plan.nextGradingSetBy ?? null,
  });
}
