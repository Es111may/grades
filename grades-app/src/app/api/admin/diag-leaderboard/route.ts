/**
 * GET /api/admin/diag-leaderboard
 *
 * Диагностика: почему в лидерборде у дизайнеров «—» вместо грейдов.
 * Запускается под текущей сессией и возвращает РОВНО ту же выборку
 * published-грейдов, что использует /admin/users, плюс сводку по статусам
 * оценок и список дизайнеров с признаком «есть ли опубликованный грейд».
 *
 * Только admin. Никаких мутаций.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { fetchOnTimeStatsByEmail } from '@/lib/clickhousePerfBatch';

export async function GET() {
  const me = await getCurrentUser();
  if (!me?.id || me.role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden', yourRole: me?.role ?? null },
      { status: 403 },
    );
  }

  // 1:1 тот же запрос, что собирает грейды на /admin/users.
  const latestGrades = await prisma.$queryRaw<
    Array<{
      designerId: number;
      effectiveGrade: string | null;
      publishedAt: Date | null;
      totalXp: number | null;
    }>
  >`
    SELECT DISTINCT ON ("designerId")
      "designerId",
      "effectiveGrade",
      "publishedAt",
      "totalXp"
    FROM assessments
    WHERE status = 'published' AND "effectiveGrade" IS NOT NULL
    ORDER BY "designerId", "publishedAt" DESC
  `;
  const gradeByDesignerId = new Map(latestGrades.map((g) => [g.designerId, g]));

  // Сводка по всем оценкам: сколько draft / published / archived.
  const byStatus = await prisma.assessment.groupBy({
    by: ['status'],
    _count: { _all: true },
  });

  // Все дизайнеры/стардизы — с признаком наличия опубликованного грейда.
  const designers = await prisma.user.findMany({
    where: { role: { in: ['designer', 'stardiz'] } },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      active: true,
      leadId: true,
      stardizId: true,
      build: { select: { code: true, name: true } },
    },
    orderBy: [{ active: 'desc' }, { fullName: 'asc' }],
  });

  // Перформанс тем же путём, что лидерборд (кэш+SQL прод-кода) — чтобы
  // сверить с сырыми данными ClickHouse при расследовании аномалий.
  let onTime = new Map<string, { onTimePercent: number | null; totalTasks: number }>();
  let onTimeError: string | null = null;
  try {
    onTime = await fetchOnTimeStatsByEmail(
      designers.filter((d) => d.active && d.email).map((d) => d.email),
    );
  } catch (e) {
    onTimeError = (e as Error).message;
  }

  // По каждому дизайнеру — ещё и статусы его оценок (draft/published/...),
  // чтобы сразу видеть: грейд не виден, потому что оценка не опубликована.
  const allAssessments = await prisma.assessment.findMany({
    select: { designerId: true, status: true, effectiveGrade: true },
  });
  const statusesByDesigner = new Map<number, string[]>();
  for (const a of allAssessments) {
    const arr = statusesByDesigner.get(a.designerId) ?? [];
    arr.push(a.effectiveGrade ? `${a.status}(${a.effectiveGrade})` : a.status);
    statusesByDesigner.set(a.designerId, arr);
  }

  const rows = designers.map((d) => {
    const g = gradeByDesignerId.get(d.id);
    const perf = d.email ? onTime.get(d.email.toLowerCase()) : undefined;
    return {
      id: d.id,
      fullName: d.fullName,
      onTimePercent: perf?.onTimePercent ?? null,
      onTimeTotalTasks: perf?.totalTasks ?? 0,
      role: d.role,
      active: d.active,
      build: d.build?.name ?? null,
      buildCode: d.build?.code ?? null,
      leadId: d.leadId,
      stardizId: d.stardizId,
      hasPublishedGrade: !!g,
      effectiveGrade: g?.effectiveGrade ?? null,
      totalXp: g?.totalXp ?? null,
      publishedAt: g?.publishedAt?.toISOString() ?? null,
      allAssessmentStatuses: statusesByDesigner.get(d.id) ?? [],
    };
  });

  return NextResponse.json({
    session: { id: me.id, role: me.role },
    onTimeError,
    publishedGradesCount: latestGrades.length,
    assessmentsByStatus: byStatus.map((b) => ({
      status: b.status,
      count: b._count._all,
    })),
    designers: rows,
    note:
      latestGrades.length === 0
        ? 'Глобально нет ни одной published-оценки с грейдом. Если у лида грейды видны — значит он смотрит черновик в форме оценки, а не лидерборд.'
        : `Глобально найдено ${latestGrades.length} опубликованных грейдов. Они должны быть видны и админу. Если в UI их нет — это кэш клиента (жёсткий refresh) или фильтр «Мои».`,
  });
}
