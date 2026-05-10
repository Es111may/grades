export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { GRADE_NAMES } from '@/lib/types';
import type { GradeCode } from '@/lib/types';

export default async function DesignerHistoryPage() {
  const user = await getCurrentUser();
  if (!user?.id) return null;

  const assessments = await prisma.assessment.findMany({
    where: { designerId: user.id, status: 'published' },
    orderBy: { publishedAt: 'desc' },
    include: { lead: true },
  });

  return (
    <main className="max-w-[1100px] mx-auto px-8 pt-12 pb-16">
      <div className="mb-6">
        <h1 className="font-display text-4xl font-semibold tracking-tight">
          История оценок
        </h1>
      </div>

      {assessments.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-stone">Опубликованных оценок пока нет.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assessments.map((a, idx) => {
            const prev = assessments[idx + 1];
            const xpDelta = prev ? (a.totalXp ?? 0) - (prev.totalXp ?? 0) : null;
            return (
              <div key={a.id} className="card-hover p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-widest text-stone mb-1">
                      {a.publishedAt
                        ? new Date(a.publishedAt).toLocaleDateString('ru-RU', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })
                        : '—'}
                    </div>
                    <div className="font-display text-xl font-semibold tracking-tight mb-0.5">
                      {GRADE_NAMES[(a.effectiveGrade ?? 'junior') as GradeCode]}
                    </div>
                    <div className="text-xs text-stone">
                      Оценил: {a.lead?.fullName ?? '—'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-2xl font-semibold tabular-nums">
                      {a.totalXp ?? 0}
                    </div>
                    <div className="text-[11px] uppercase tracking-widest text-stone">
                      XP
                    </div>
                    {xpDelta !== null && xpDelta !== 0 && (
                      <div
                        className={`text-xs mt-1 font-medium tabular-nums ${
                          xpDelta > 0 ? 'text-emerald' : 'text-blaze'
                        }`}
                      >
                        {xpDelta > 0 ? '+' : ''}
                        {xpDelta}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
