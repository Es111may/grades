export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import Avatar from '@/components/Avatar';
import Link from 'next/link';

/**
 * /admin/lead-reviews — точка входа в портрет лида/стардиза.
 *   ?userId=X — открыть портрет указанного лида (только admin или сам лид/стардиз).
 *   без параметра — для lead/stardiz открывает свой портрет.
 *
 * Если у этого лида есть LeadReview — редирект на самый свежий /admin/lead-reviews/[id].
 * Если нет — empty state с кнопкой импорта (для админа).
 */
export default async function LeadReviewsLandingPage({
  searchParams,
}: {
  searchParams: { userId?: string };
}) {
  const me = await requireRole(['admin', 'lead', 'stardiz']);

  let targetUserId: number;
  if (searchParams.userId) {
    targetUserId = parseInt(searchParams.userId, 10);
    if (isNaN(targetUserId)) redirect('/admin/users');
  } else if (me.role === 'lead' || me.role === 'stardiz') {
    targetUserId = me.id!;
  } else {
    // Админ без userId — отправляем в список пользователей выбирать
    redirect('/admin/users');
  }

  // Лид/стардиз может смотреть только свой портрет
  if ((me.role === 'lead' || me.role === 'stardiz') && targetUserId !== me.id) {
    redirect('/admin/lead-reviews');
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, fullName: true, role: true, avatarUrl: true, active: true },
  });
  if (!target) redirect('/admin/users');
  if (target.role !== 'lead' && target.role !== 'stardiz') {
    redirect('/admin/users');
  }

  const reviews = await prisma.leadReview.findMany({
    where: { targetUserId },
    orderBy: { importedAt: 'desc' },
    select: { id: true, importedAt: true, period: true, responseCount: true },
  });

  if (reviews.length > 0) {
    redirect(`/admin/lead-reviews/${reviews[0].id}`);
  }

  // Empty state
  const canImport = me.role === 'admin' && target.active;
  return (
    <main className="max-w-[1400px] mx-auto px-8 pt-12 pb-16">
      <div className="text-xs text-stone mb-3">
        <Link href="/admin/users" className="hover:text-ink transition-colors">
          Команда
        </Link>
        <span className="text-ash mx-1.5">/</span>
        <span>{target.fullName}</span>
      </div>

      <div className="flex items-center gap-4 mb-8">
        <Avatar name={target.fullName} avatarUrl={target.avatarUrl} size={64} />
        <div>
          <h1 className="font-display text-4xl font-medium tracking-tight mb-2">
            {target.fullName}
          </h1>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="chip-neutral">
              {target.role === 'lead' ? 'Лид' : 'Стардиз'}
            </span>
            <span className="chip-neutral">Ещё нет 360-оценок</span>
          </div>
        </div>
      </div>

      <div className="card p-10 text-center">
        <div className="font-display text-2xl font-medium tracking-tight mb-2">
          Портрет ещё не сформирован
        </div>
        <p className="text-sm text-stone max-w-md mx-auto mb-6 leading-relaxed">
          Чтобы появился портрет — нужно прогнать 360-опрос через Google Form и
          загрузить CSV-выгрузку. Опросы делает админ.
        </p>
        {canImport && (
          <Link
            href={`/admin/lead-reviews/new?userId=${target.id}`}
            className="btn-accent"
          >
            Импортировать опрос
          </Link>
        )}
        {!canImport && me.role !== 'admin' && (
          <p className="text-xs text-ash italic">
            Дождись первого цикла — Pavel пришлёт ссылку на опрос.
          </p>
        )}
      </div>
    </main>
  );
}
