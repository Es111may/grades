export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { GRADE_NAMES } from '@/lib/types';
import type { GradeCode } from '@/lib/types';
import DeleteButton from './DeleteButton';

export default async function LeadAssessmentsPage() {
  const me = await getCurrentUser();
  if (!me?.id) return null;

  let where: Record<string, unknown> = {};
  if (me.role === 'lead') {
    where = { lead: { id: me.id } };
  } else if (me.role === 'stardiz') {
    where = {
      designer: {
        OR: [{ stardizId: me.id }, { leadId: me.id }],
      },
    };
  }
  // admin → все

  const assessments = await prisma.assessment.findMany({
    where: { ...where, status: 'published' },
    orderBy: { publishedAt: 'desc' },
    include: { designer: true, lead: true },
  });

  return (
    <main className="max-w-[1400px] mx-auto px-8 pt-8 pb-16">
      <div className="mb-6">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Оценки</h1>
      </div>

      {assessments.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-stone">Опубликованных оценок пока нет.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {assessments.map((a) => (
            <div key={a.id} className="card-hover flex items-center">
              <Link
                href={`/lead/portrait?id=${a.designerId}`}
                className="flex-1 flex items-center justify-between px-5 py-4 min-w-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {a.designer.fullName}
                  </div>
                  <div className="text-xs text-stone mt-0.5">
                    {a.publishedAt &&
                      new Date(a.publishedAt).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    {me.role === 'admin' && a.lead && <> · лид: {a.lead.fullName}</>}
                  </div>
                </div>
                <div className="flex items-center gap-5 shrink-0">
                  <div className="text-right">
                    <div className="font-display text-base font-semibold tracking-tight">
                      {GRADE_NAMES[(a.effectiveGrade ?? 'junior') as GradeCode]}
                    </div>
                    <div className="text-[11px] text-stone tabular-nums">
                      {a.totalXp ?? 0} XP
                    </div>
                  </div>
                  <span className="text-ash">→</span>
                </div>
              </Link>
              <div className="pr-3">
                <DeleteButton assessmentId={a.id} designerName={a.designer.fullName} />
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
