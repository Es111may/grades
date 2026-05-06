export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import UsersClient from './UsersClient';

export default async function AdminUsersPage() {
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin') redirect('/auth/signin');

  const [users, builds, leads] = await Promise.all([
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

  return <UsersClient initialUsers={users} builds={builds} leads={leads} />;
}
