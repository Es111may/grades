export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import { canAccessUsers } from '@/lib/permissions';
import UsersClient from './UsersClient';

export default async function AdminUsersPage() {
  const me = await getCurrentUser();
  if (!me || !canAccessUsers(me.role)) redirect('/auth/signin');

  // Серверный фильтр: stardiz видит только своих подопечных (по stardizId
  // или leadId, если он же формальный лид). Admin/lead видят всех; фильтр
  // «Все/Мои» накладывается на клиенте.
  const userWhere =
    me.role === 'stardiz'
      ? {
          OR: [
            { stardizId: me.id },
            { leadId: me.id },
            { id: me.id }, // самого себя тоже видим в списке
          ],
        }
      : {};

  const [usersRaw, builds, leadsRaw, stardizesRaw, latestGrades] = await Promise.all([
    prisma.user.findMany({
      where: userWhere,
      include: {
        build: true,
        lead: { select: { id: true, fullName: true } },
        stardiz: { select: { id: true, fullName: true } },
      },
      // active desc — активные сверху, деактивированные в конце.
      orderBy: [{ active: 'desc' }, { role: 'asc' }, { fullName: 'asc' }],
    }),
    prisma.build.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.user.findMany({
      where: { role: { in: ['lead', 'admin'] }, active: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    }),
    prisma.user.findMany({
      where: { role: { in: ['stardiz', 'lead', 'admin'] }, active: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    }),
    // Последний effectiveGrade каждого дизайнера + дата публикации — одним SQL-запросом.
    prisma.$queryRaw<Array<{ designerId: number; effectiveGrade: string | null; publishedAt: Date | null }>>`
      SELECT DISTINCT ON ("designerId") "designerId", "effectiveGrade", "publishedAt"
      FROM assessments
      WHERE status = 'published' AND "effectiveGrade" IS NOT NULL
      ORDER BY "designerId", "publishedAt" DESC
    `,
  ]);

  const gradeByDesignerId = new Map<number, { grade: string; publishedAt: string | null }>();
  for (const a of latestGrades) {
    if (a.effectiveGrade) {
      gradeByDesignerId.set(a.designerId, {
        grade: a.effectiveGrade,
        publishedAt: a.publishedAt?.toISOString() ?? null,
      });
    }
  }

  const users = usersRaw.map((u) => {
    const last = gradeByDesignerId.get(u.id);
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      buildId: u.buildId,
      build: u.build ? { id: u.build.id, code: u.build.code, name: u.build.name } : null,
      department: u.department,
      leadId: u.leadId,
      lead: u.lead,
      stardizId: u.stardizId,
      stardiz: u.stardiz,
      hiredAt: u.hiredAt?.toISOString() ?? null,
      active: u.active,
      gradeFloor: u.gradeFloor,
      gradeFloorReason: u.gradeFloorReason,
      avatarUrl: u.avatarUrl,
      effectiveGrade: last?.grade ?? null,
      lastAssessedAt: last?.publishedAt ?? null,
    };
  });

  return (
    <UsersClient
      initialUsers={users}
      builds={builds}
      leads={leadsRaw}
      stardizes={stardizesRaw}
      meId={me.id ?? null}
      meRole={me.role ?? ''}
    />
  );
}
