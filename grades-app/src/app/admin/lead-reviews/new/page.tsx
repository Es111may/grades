export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import NewLeadReviewForm from './NewLeadReviewForm';

/**
 * /admin/lead-reviews/new?userId=X — форма загрузки CSV для создания
 * новой 360-оценки лида/стардиза. Только admin.
 */
export default async function NewLeadReviewPage({
  searchParams,
}: {
  searchParams: { userId?: string };
}) {
  await requireRole('admin');

  const userId = searchParams.userId ? parseInt(searchParams.userId, 10) : NaN;
  if (isNaN(userId)) redirect('/admin/users');

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, role: true, avatarUrl: true, active: true },
  });
  if (!target) redirect('/admin/users');
  if (target.role !== 'lead' && target.role !== 'stardiz') {
    redirect('/admin/users');
  }

  return (
    <NewLeadReviewForm
      target={{
        id: target.id,
        fullName: target.fullName,
        role: target.role,
        avatarUrl: target.avatarUrl,
      }}
    />
  );
}
