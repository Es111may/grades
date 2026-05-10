export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { canManageUsers } from '@/lib/permissions';

export async function GET() {
  const me = await getCurrentUser();
  if (!me || !canManageUsers(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const cells = await prisma.teamMatrixCell.findMany({
    select: {
      userId: true,
      potentialLevel: true,
      performanceLevel: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(cells);
}
