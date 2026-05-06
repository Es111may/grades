export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import UsersClient from './UsersClient';

export default async function AdminUsersPage() {
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin') redirect('/auth/signin');

  const [usersRaw, builds, leadsRaw] = await Promise.all([
    prisma.user.findMany({
      include: { build: true, lead: { select: { id: true, fullName: true } } },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    }),
    prisma.build.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.user.findMany({
      where: { role: { in: ['lead', 'admin'] }, active: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    }),
  ]);

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
    hiredAt: u.hiredAt?.toISOString() ?? null,
    active: u.active,
    gradeFloor: u.gradeFloor,
    gradeFloorReason: u.gradeFloorReason,
  }));

  return <UsersClient initialUsers={users} builds={builds} leads={leadsRaw} />;
}
