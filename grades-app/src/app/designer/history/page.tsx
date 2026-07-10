export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { GRADE_NAMES } from '@/lib/types';
import type { GradeCode } from '@/lib/types';

function formatDate(iso: Date | null) {
  if (!iso) return '—';
  return iso.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default async function DesignerHistoryPage() {
  const user = await getCurrentUser();
  if (!user?.id) return null;

  const assessments = await prisma.assessment.findMany({
    where: { designerId: user.id, status: 'published' },
    orderBy: { publishedAt: 'desc' },
    include: { lead: true },
  });

  return (
    <main className="max-w-[1240px] mx-auto px-8 pt-10 pb-16">
      <div className="mb-6">
        <h1 className="font-display text-4xl font-medium tracking-tight">
          История оценок
        </h1>
      </div>

      {assessments.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-stone">Опубликованных оценок пока нет.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="label-mono bg-canvas border-b border-cloud">
                <th className="text-left py-2.5 px-4 font-medium text-stone">
                  Опубликовано
                </th>
                <th className="text-left py-2.5 px-4 font-medium text-stone">
                  Оценил
                </th>
                <th className="text-right py-2.5 px-4 font-medium text-stone">
                  Грейд
                </th>
                <th className="text-right py-2.5 px-4 font-medium text-stone">
                  XP
                </th>
                <th className="text-right py-2.5 px-4 font-medium text-stone w-20">
                  Δ XP
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cloud">
              {assessments.map((a, idx) => {
                const prev = assessments[idx + 1];
                const xpDelta =
                  prev && a.totalXp !== null && prev.totalXp !== null
                    ? a.totalXp - prev.totalXp
                    : null;
                return (
                  <tr key={a.id} className="hover:bg-canvas/60 transition-colors">
                    <td className="py-3 px-4 text-stone tabular-nums whitespace-nowrap">
                      {formatDate(a.publishedAt)}
                    </td>
                    <td className="py-3 px-4 text-stone">
                      {a.lead?.fullName ?? '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="font-display text-base font-medium tracking-tight">
                        {GRADE_NAMES[(a.effectiveGrade ?? 'junior') as GradeCode] ??
                          a.effectiveGrade ??
                          '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-stone tabular-nums">
                      {a.totalXp ?? 0}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      {xpDelta === null ? (
                        <span className="text-ash">—</span>
                      ) : xpDelta === 0 ? (
                        <span className="text-stone">0</span>
                      ) : (
                        <span
                          className={`font-medium ${
                            xpDelta > 0 ? 'text-emerald' : 'text-blaze'
                          }`}
                        >
                          {xpDelta > 0 ? '+' : ''}
                          {xpDelta}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
