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
      <div className="mb-10">
        <div className="text-xs uppercase tracking-widest text-stone mb-2">История оценок</div>
        <h1 className="font-display text-5xl font-light tracking-tight">Все оценки</h1>
      </div>

      {assessments.length === 0 ? (
        <div className="bg-white border border-cloud rounded-card p-10 shadow-soft text-center">
          <p className="text-stone">Опубликованных оценок пока нет.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {assessments.map((a, idx) => {
            const prev = assessments[idx + 1];
            const xpDelta = prev ? (a.totalXp ?? 0) - (prev.totalXp ?? 0) : null;
            return (
              <div
                key={a.id}
                className="bg-white border border-cloud rounded-card p-6 shadow-soft"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-stone mb-1">
                      {a.publishedAt
                        ? new Date(a.publishedAt).toLocaleDateString('ru-RU', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })
                        : '—'}
                    </div>
                    <div className="font-display text-2xl tracking-tight mb-1">
                      {GRADE_NAMES[(a.effectiveGrade ?? 'intern') as GradeCode]}
                    </div>
                    <div className="text-xs text-stone">
                      Оценил: {a.lead?.fullName ?? '—'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-3xl">{a.totalXp ?? 0}</div>
                    <div className="text-xs text-stone">XP</div>
                    {xpDelta !== null && xpDelta !== 0 && (
                      <div
                        className={`text-xs mt-1 ${
                          xpDelta > 0 ? 'text-lime-dark' : 'text-sunset'
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
