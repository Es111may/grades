/**
 * GET /api/users/[id]/compensation — ставка, вилка, история пересмотров,
 * премии и плановый пересмотр (Phase 23.4).
 *
 * Права — на сервере (lib/compPermissions): админ — всех, лид — своих.
 * Стардиз и дизайнер получают 403, суммы им не уходят вообще.
 * Ставки и журнал — из HR-портала; если он недоступен, остальное
 * (премии, плановый пересмотр) всё равно отдаём.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import {
  canEditBonuses,
  canEditPlannedRaise,
  canViewCompensation,
} from '@/lib/compPermissions';
import { buildCompensation, plannedRaiseState } from '@/lib/compensation';
import { fetchHrCompensation } from '@/lib/hrSalary';
import { isHourly } from '@/lib/employment';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  const id = parseInt(params.id, 10);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      role: true,
      leadId: true,
      active: true,
      employmentType: true,
      plannedRaiseSetAt: true,
      plannedRaiseAt: true,
      plannedRaiseSalary: true,
      plannedRaiseNote: true,
      plannedRaiseSetBy: { select: { fullName: true } },
      bonuses: { orderBy: { paidAt: 'desc' } },
    },
  });
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const viewer = me?.id ? { id: me.id, role: me.role } : null;
  if (!canViewCompensation(viewer, target)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Грейд для вилки — из последней опубликованной оценки (уже с учётом floor)
  const lastAssessment = await prisma.assessment.findFirst({
    where: { designerId: id, status: 'published' },
    orderBy: { publishedAt: 'desc' },
    select: { effectiveGrade: true },
  });

  const bonuses = target.bonuses.map((b) => ({
    id: b.id,
    amount: b.amount,
    paidAt: b.paidAt.toISOString(),
    note: b.note,
  }));
  const today = new Date().toISOString().slice(0, 10);

  let hr: Awaited<ReturnType<typeof fetchHrCompensation>> | null = null;
  try {
    hr = await fetchHrCompensation(target.email);
  } catch (err) {
    console.error('[compensation] HR unavailable:', err);
  }

  const view = hr
    ? buildCompensation({
        hr: hr.hr,
        log: hr.log,
        bonuses,
        role: target.role,
        grade: lastAssessment?.effectiveGrade ?? null,
        employmentType: target.employmentType,
        activeInGrades: target.active,
        today,
      })
    : { state: 'hr_unavailable' as const };

  const planned = {
    state: plannedRaiseState(
      { setAt: target.plannedRaiseSetAt?.toISOString() ?? null },
      hr?.log ?? [],
      hr?.hr?.hiredAt ?? null,
    ),
    setAt: target.plannedRaiseSetAt?.toISOString() ?? null,
    at: target.plannedRaiseAt?.toISOString() ?? null,
    salary: target.plannedRaiseSalary,
    note: target.plannedRaiseNote,
    setBy: target.plannedRaiseSetBy?.fullName ?? null,
  };

  return NextResponse.json({
    view,
    // Почасовщик в HR числится уволенным — это норма, а не сбой учёта:
    // блоку нужно знать, чтобы не советовать «оформить возвращение».
    hourly: isHourly(target),
    // Без HR «выполнен» определить нельзя — показываем статус как есть
    planned: hr ? planned : { ...planned, state: planned.setAt ? 'active' : 'none' },
    can: {
      editPlanned: canEditPlannedRaise(viewer, target),
      editBonuses: canEditBonuses(viewer),
    },
  });
}
