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
      fullName: true,
      role: true,
      active: true,
      leadId: true,
      stardizId: true,
    },
    orderBy: [{ active: 'desc' }, { fullName: 'asc' }],
  });

  const rows = designers.map((d) => {
    const g = gradeByDesignerId.get(d.id);
    return {
      id: d.id,
      fullName: d.fullName,
      role: d.role,
      active: d.active,
      leadId: d.leadId,
      stardizId: d.stardizId,
      hasPublishedGrade: !!g,
      effectiveGrade: g?.effectiveGrade ?? null,
      totalXp: g?.totalXp ?? null,
      publishedAt: g?.publishedAt?.toISOString() ?? null,
    };
  });

  return NextResponse.json({
    session: { id: me.id, role: me.role },
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
