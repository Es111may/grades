export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { GRADE_NAMES } from '@/lib/types';
import type { GradeCode } from '@/lib/types';
import TitleAurora from '@/components/TitleAurora';
import EmptyState from '@/components/EmptyState';
import { CheckIcon } from '@/components/icons';

import { formatDateShort as formatDate } from '@/lib/dates';

export default async function DesignerHistoryPage() {
  const user = await getCurrentUser();
  if (!user?.id) return null;

  const assessments = await prisma.assessment.findMany({
    where: { designerId: user.id, status: 'published' },
    orderBy: { publishedAt: 'desc' },
    include: { lead: true },
  });

  return (
    <main className="max-w-[1240px] mx-auto px-8 pt-[164px] pb-16">
      {/* Заголовок — по центру, с авророй, ритм 164px (как все разделы) */}
      <div className="text-center mb-[164px] animate-fade-up title-halo">
        <TitleAurora />
        <h1 className="font-display text-[64px] leading-none font-medium tracking-[-0.035em]">
          История оценок
        </h1>
      </div>

      {assessments.length === 0 ? (
        <div className="card animate-fade-up">
          <EmptyState
            icon={<CheckIcon className="w-5 h-5" />}
            title="Опубликованных оценок пока нет"
            hint="Первая появится после того, как лид опубликует твою оценку"
            action={
              <Link href="/designer" className="btn-secondary btn-sm">
                Мой портрет
              </Link>
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden animate-fade-up" style={{ animationDelay: '70ms' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink/[0.03] border-b border-cloud">
                <th className="label-mono text-left py-2.5 px-4 text-stone">
                  Опубликовано
                </th>
                <th className="label-mono text-left py-2.5 px-4 text-stone">
                  Оценил
                </th>
                <th className="label-mono text-right py-2.5 px-4 text-stone">
                  Грейд
                </th>
                <th className="label-mono text-right py-2.5 px-4 text-stone">
                  XP
                </th>
                <th className="label-mono text-right py-2.5 px-4 text-stone w-20">
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
