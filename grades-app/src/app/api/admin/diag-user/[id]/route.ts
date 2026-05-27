/**
 * GET /api/admin/diag-user/[id]
 *
 * Диагностический endpoint для админа — возвращает сырые данные по
 * пользователю + ВСЕ его оценки (включая drafts и archived), чтобы можно
 * было быстро понять «почему оценка не отображается».
 *
 * Только admin. Никаких мутаций.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getCurrentUser();
  if (!me?.id || me.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = parseInt(params.id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      build: { select: { id: true, code: true, name: true } },
      lead: { select: { id: true, fullName: true } },
      stardiz: { select: { id: true, fullName: true } },
    },
  });
  if (!user) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // ВСЕ оценки — без фильтра по статусу
  const assessments = await prisma.assessment.findMany({
    where: { designerId: userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      cycle: true,
      createdAt: true,
      updatedAt: true,
      publishedAt: true,
      totalXp: true,
      calculatedGrade: true,
      effectiveGrade: true,
      leadId: true,
      lead: { select: { id: true, fullName: true } },
    },
  });

  // Также имитируем тот же SELECT DISTINCT ON, что делает /admin/users
  const latestPublished = await prisma.$queryRaw<
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
    WHERE "designerId" = ${userId}
      AND status = 'published'
      AND "effectiveGrade" IS NOT NULL
    ORDER BY "designerId", "publishedAt" DESC
  `;

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      active: user.active,
      buildId: user.buildId,
      build: user.build,
      leadId: user.leadId,
      lead: user.lead,
      stardizId: user.stardizId,
      stardiz: user.stardiz,
      gradeFloor: user.gradeFloor,
    },
    assessmentsCount: assessments.length,
    assessments,
    // Что бы попало в `latestGrades` на /admin/users:
    latestPublishedForLeaderboard: latestPublished[0] ?? null,
    note:
      latestPublished.length === 0
        ? 'Нет published-оценок с effectiveGrade — поэтому в лидерборде грейд = «—».'
        : 'Оценка есть. Если в лидерборде всё равно не видна — копай скоп-фильтр.',
  });
}
