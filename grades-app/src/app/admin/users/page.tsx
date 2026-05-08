export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import { canManageUsers } from '@/lib/permissions';
import UsersClient from './UsersClient';

export default async function AdminUsersPage() {
  const me = await getCurrentUser();
  if (!me || !canManageUsers(me.role)) redirect('/auth/signin');

  const [usersRaw, builds, leadsRaw, stardizesRaw, latestPublished] = await Promise.all([
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
    // Последняя опубликованная оценка каждого дизайнера — для канбана «Уровни»
    prisma.assessment.findMany({
      where: { status: 'published' },
      orderBy: { publishedAt: 'desc' },
      select: { designerId: true, effectiveGrade: true, publishedAt: true },
    }),
  ]);

  // Сворачиваем в map: designerId → effectiveGrade (берём первую = последнюю опубл.)
  const gradeByDesignerId = new Map<number, string>();
  for (const a of latestPublished) {
    if (!gradeByDesignerId.has(a.designerId) && a.effectiveGrade) {
      gradeByDesignerId.set(a.designerId, a.effectiveGrade);
    }
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
