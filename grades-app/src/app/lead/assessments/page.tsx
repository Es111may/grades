export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { GRADE_NAMES } from '@/lib/types';
import type { GradeCode } from '@/lib/types';
import Avatar from '@/components/Avatar';
import DeleteButton from './DeleteButton';

const buildColor = (code: string) =>
  code === 'creator' ? '#00ca48' : code === 'visioner' ? '#7c3aed' : '#0ea5e9';

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
    include: {
      designer: { include: { build: true } },
      lead: true,
    },
  });

  return (
    <main className="max-w-[1400px] mx-auto px-8 pt-10 pb-16">
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
                className="flex-1 grid items-center gap-5 px-5 py-4 min-w-0"
                style={{
                  gridTemplateColumns:
                    'minmax(220px, 1.4fr) 130px 130px minmax(120px, 1fr) auto auto',
                }}
              >
                {/* Колонка 1 — аватар + имя + email */}
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar
                    name={a.designer.fullName}
                    avatarUrl={a.designer.avatarUrl}
                    size={36}
                  />
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate leading-tight">
                      {a.designer.fullName}
                    </div>
                    <div className="text-xs text-stone truncate leading-tight mt-0.5">
                      {a.designer.email}
                    </div>
                  </div>
                </div>

                {/* Колонка 2 — дата публикации */}
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-stone mb-0.5">
                    Опубликовано
                  </div>
                  <div className="text-sm text-graphite tabular-nums">
                    {a.publishedAt
                      ? new Date(a.publishedAt).toLocaleDateString('ru-RU', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—'}
                  </div>
                </div>

                {/* Колонка 3 — билд */}
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-stone mb-0.5">
                    Билд
                  </div>
                  {a.designer.build ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-pill border border-cloud bg-canvas text-xs font-medium text-stone">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: buildColor(a.designer.build.code) }}
                      />
                      {a.designer.build.name}
                    </span>
                  ) : (
                    <span className="text-ash text-sm">—</span>
                  )}
                </div>

                {/* Колонка 4 — лид (для admin) или отдел */}
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-stone mb-0.5">
                    {me.role === 'admin' ? 'Лид' : 'Отдел'}
                  </div>
                  <div className="text-sm text-graphite truncate">
                    {me.role === 'admin'
                      ? a.lead?.fullName ?? '—'
                      : a.designer.department ?? '—'}
                  </div>
                </div>

                {/* Колонка 5 — грейд + XP */}
                <div className="text-right">
                  <div className="font-display text-base font-semibold tracking-tight leading-tight">
                    {GRADE_NAMES[(a.effectiveGrade ?? 'junior') as GradeCode]}
                  </div>
                  <div className="text-[11px] text-stone tabular-nums leading-tight mt-0.5">
                    {a.totalXp ?? 0} XP
                  </div>
                </div>

                <span className="text-ash">→</span>
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
