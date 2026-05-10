export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import { canManageUsers } from '@/lib/permissions';
import UsersClient from './UsersClient';

export default async function AdminUsersPage() {
  const me = await getCurrentUser();
  if (!me || !canManageUsers(me.role)) redirect('/auth/signin');

  const [usersRaw, builds, leadsRaw, stardizesRaw, latestGrades] = await Promise.all([
    prisma.user.findMany({
      include: {
        build: true,
        lead: { select: { id: true, fullName: true } },
        stardiz: { select: { id: true, fullName: true } },
      },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
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
    // Последний effectiveGrade каждого дизайнера — одним SQL-запросом через DISTINCT ON.
    // Это значительно быстрее чем тащить ВСЕ опубликованные оценки и сворачивать в map.
    prisma.$queryRaw<Array<{ designerId: number; effectiveGrade: string | null }>>`
      SELECT DISTINCT ON ("designerId") "designerId", "effectiveGrade"
      FROM assessments
      WHERE status = 'published' AND "effectiveGrade" IS NOT NULL
      ORDER BY "designerId", "publishedAt" DESC
    `,
  ]);

  const gradeByDesignerId = new Map<number, string>();
  for (const a of latestGrades) {
    if (a.effectiveGrade) gradeByDesignerId.set(a.designerId, a.effectiveGrade);
  }

  const users = usersRaw.map((u) => ({
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
    effectiveGrade: gradeByDesignerId.get(u.id) ?? null,
  }));

  return (
    <UsersClient
      initialUsers={users}
      builds={builds}
      leads={leadsRaw}
      stardizes={stardizesRaw}
      meRole={me.role ?? ''}
    />
  );
}
