export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import Link from 'next/link';
import { GRADE_NAMES, BUILD_NAMES } from '@/lib/types';
import type { BuildCode, GradeCode } from '@/lib/types';

function currentCycle() {
  const now = new Date();
  const month = now.getMonth() + 1;
  return month <= 6
    ? `${now.getFullYear()}-04`
    : `${now.getFullYear()}-10`;
}

function cycleName(cycle: string) {
  const [y, m] = cycle.split('-');
  return m === '04' ? `апрель ${y}` : `октябрь ${y}`;
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export default async function LeadDashboard() {
  const user = await getCurrentUser();
  if (!user?.id) return null;

  const cycle = currentCycle();

  const myDesigners = await prisma.user.findMany({
    where: { leadId: user.id, role: 'designer', active: true },
    include: {
      build: true,
      assessmentsAsDesigner: {
        where: { cycle, status: { not: 'archived' } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { fullName: 'asc' },
  });

  const stats = {
    total: myDesigners.length,
    published: 0,
    draft: 0,
    notStarted: 0,
  };

  const cards = myDesigners.map((d) => {
    const assessment = d.assessmentsAsDesigner[0] ?? null;
    const status = assessment?.status ?? 'not_started';
    if (status === 'published') stats.published++;
    else if (status === 'draft') stats.draft++;
    else stats.notStarted++;

    return {
      id: d.id,
      fullName: d.fullName,
      email: d.email,
      initials: initials(d.fullName),
      buildCode: d.build?.code as BuildCode | undefined,
      buildName: d.build?.name ?? '—',
      department: d.department,
      gradeFloor: d.gradeFloor as GradeCode | null,
      status,
      assessment: assessment
        ? {
            id: assessment.id,
            totalXp: assessment.totalXp,
            calculatedGrade: assessment.calculatedGrade as GradeCode | null,
            effectiveGrade: assessment.effectiveGrade as GradeCode | null,
            publishedAt: assessment.publishedAt?.toISOString() ?? null,
            createdAt: assessment.createdAt.toISOString(),
          }
        : null,
    };
  });

  return (
    <main className="max-w-[1300px] mx-auto px-8 pt-12 pb-16">
      <div className="mb-10">
        <div className="text-xs uppercase tracking-widest text-stone mb-2">
          Цикл {cycleName(cycle)}
        </div>
        <h1 className="font-display text-5xl font-light tracking-tight mb-3">
          Мои дизайнеры
        </h1>
        <p className="text-stone leading-relaxed max-w-xl">
          {stats.total} дизайнеров под твоим лидерством.{' '}
          {stats.published > 0 && `${stats.published} опубликовано`}
          {stats.draft > 0 && `, ${stats.draft} в черновике`}
          {stats.notStarted > 0 && `, ${stats.notStarted} ещё не начато`}.
        </p>
      </div>

      {cards.length === 0 ? (
        <div className="bg-white border border-cloud rounded-card p-8 text-center shadow-soft">
          <p className="text-stone">
            К тебе ещё не привязали дизайнеров. Попроси админа.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {cards.map((d) => (
            <Link
              key={d.id}
              href={
                d.status === 'published'
                  ? `/lead/portrait?id=${d.id}`
                  : `/lead/assess?id=${d.id}`
              }
              className={`block bg-white border rounded-card p-7 shadow-soft hover:shadow-soft-lg transition-shadow ${
                d.status === 'not_started'
                  ? 'border-dashed border-ash'
                  : d.status === 'draft'
                    ? 'border-lime/25'
                    : 'border-cloud'
              }`}
            >
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-pill bg-canvas flex items-center justify-center text-base font-medium">
                    {d.initials}
                  </div>
                  <div>
                    <div className="font-display text-xl tracking-tight">
                      {d.fullName}
                    </div>
                    <div className="flex items-center gap-2 text-xs mt-1">
                      {d.buildCode && (
                        <>
                          <span className="flex items-center gap-1">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{
                                background:
                                  d.buildCode === 'creator'
                                    ? '#ade900'
                                    : d.buildCode === 'visioner'
                                      ? '#7c3aed'
                                      : '#0ea5e9',
                              }}
                            />
                            {d.buildName}
                          </span>
                          <span className="text-ash">·</span>
                        </>
                      )}
                      <span className="text-stone">{d.department ?? '—'}</span>
                      {d.gradeFloor && (
                        <>
                          <span className="text-ash">·</span>
                          <span className="text-sunset font-medium">
                            floor: {GRADE_NAMES[d.gradeFloor] ?? d.gradeFloor}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-pill text-xs font-medium ${
                    d.status === 'published'
                      ? 'bg-lime-light text-graphite border border-lime/30'
                      : d.status === 'draft'
                        ? 'bg-[#fff7e6] text-sunset border border-sunset/25'
                        : 'bg-canvas text-stone border border-cloud'
                  }`}
                >
                  {d.status === 'published'
                    ? 'Опубликовано'
                    : d.status === 'draft'
                      ? 'Черновик'
                      : 'Не начато'}
                </span>
              </div>

              {d.status === 'published' && d.assessment && (
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-cloud">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-stone mb-1">
                      {d.gradeFloor ? 'Эфф. грейд' : 'Грейд'}
                    </div>
                    <div className="font-display text-2xl">
                      {GRADE_NAMES[(d.assessment.effectiveGrade ?? 'intern') as GradeCode]}
                    </div>
                    {d.gradeFloor && (
                      <div className="text-xs text-sunset mt-0.5">зафиксирован</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-stone mb-1">
                      XP
                    </div>
                    <div className="font-display text-2xl">
                      {d.assessment.totalXp ?? 0}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-stone mt-1">
                      {d.assessment.publishedAt &&
                        new Date(d.assessment.publishedAt).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                </div>
              )}

              {d.status === 'draft' && (
                <div className="pt-4 border-t border-cloud flex items-center justify-between">
                  <span className="text-xs text-stone">
                    Черновик создан{' '}
                    {d.assessment?.createdAt &&
                      new Date(d.assessment.createdAt).toLocaleDateString('ru-RU')}
                  </span>
                  <span className="text-xs text-stone hover:text-ink">
                    Продолжить →
                  </span>
                </div>
              )}

              {d.status === 'not_started' && (
                <div className="pt-4 flex items-center justify-end">
                  <span className="bg-lime border border-lime rounded-pill px-4 py-1.5 text-xs font-medium">
                    Начать оценку
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
