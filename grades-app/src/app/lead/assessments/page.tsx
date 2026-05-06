export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { GRADE_NAMES } from '@/lib/types';
import type { GradeCode } from '@/lib/types';

function cycleName(cycle: string) {
  const [y, m] = cycle.split('-');
  return m === '04' ? `апрель ${y}` : `октябрь ${y}`;
}

export default async function LeadAssessmentsPage() {
  const me = await getCurrentUser();
  if (!me?.id) return null;

  const where = me.role === 'admin' ? {} : { lead: { id: me.id } };

  const assessments = await prisma.assessment.findMany({
    where: { ...where, status: 'published' },
    orderBy: { publishedAt: 'desc' },
    include: { designer: true, lead: true },
  });

  return (
    <main className="max-w-[1200px] mx-auto px-8 pt-12 pb-16">
      <div className="mb-10">
        <div className="text-xs uppercase tracking-widest text-stone mb-2">
          {me.role === 'admin' ? 'Все опубликованные оценки' : 'Опубликованные оценки моих дизайнеров'}
        </div>
        <h1 className="font-display text-5xl font-light tracking-tight">Оценки</h1>
      </div>

      {assessments.length === 0 ? (
        <div className="bg-white border border-cloud rounded-card p-10 shadow-soft text-center">
          <p className="text-stone">Опубликованных оценок пока нет.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assessments.map((a) => (
            <Link
              key={a.id}
              href={`/lead/portrait?id=${a.designerId}`}
              className="flex items-center justify-between bg-white border border-cloud rounded-card px-6 py-4 shadow-soft hover:shadow-soft-lg transition-shadow"
            >
              <div className="flex-1">
                <div className="font-display text-lg">{a.designer.fullName}</div>
                <div className="text-xs text-stone mt-0.5">
                  {cycleName(a.cycle)}
                  {a.publishedAt && (
                    <> · {new Date(a.publishedAt).toLocaleDateString('ru-RU')}</>
                  )}
                  {me.role === 'admin' && a.lead && <> · лид: {a.lead.fullName}</>}
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="font-display text-xl">
                    {GRADE_NAMES[(a.effectiveGrade ?? 'intern') as GradeCode]}
                  </div>
                  <div className="text-xs text-stone">{a.totalXp ?? 0} XP</div>
                </div>
                <span className="text-stone">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
