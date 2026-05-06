export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import Link from 'next/link';
import { GRADE_NAMES } from '@/lib/types';
import type { BuildCode, GradeCode } from '@/lib/types';

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export default async function LeadDashboard() {
  const user = await getCurrentUser();
  if (!user?.id) return null;

  // Загружаем дизайнеров + до 1 черновика + последнюю опубликованную оценку.
  // Циклы больше не привязаны к датам — просто история всех публикаций + текущий draft.
  const myDesigners = await prisma.user.findMany({
    where: { leadId: user.id, role: 'designer', active: true },
    include: {
      build: true,
      assessmentsAsDesigner: {
        where: { status: { in: ['draft', 'published'] } },
        orderBy: [{ status: 'asc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
      },
    },
    orderBy: { fullName: 'asc' },
  });

  const stats = { total: myDesigners.length, published: 0, draft: 0, notStarted: 0 };

  const cards = myDesigners.map((d) => {
    const draft = d.assessmentsAsDesigner.find((a) => a.status === 'draft') ?? null;
    const lastPublished =
      d.assessmentsAsDesigner.find((a) => a.status === 'published') ?? null;

    if (draft) stats.draft++;
    else if (lastPublished) stats.published++;
    else stats.notStarted++;

    return {
      id: d.id,
      fullName: d.fullName,
      initials: initials(d.fullName),
      buildCode: d.build?.code as BuildCode | undefined,
      buildName: d.build?.name ?? '—',
      department: d.department,
      gradeFloor: d.gradeFloor as GradeCode | null,
      draft: draft
        ? {
            id: draft.id,
            createdAt: draft.createdAt.toISOString(),
          }
        : null,
      published: lastPublished
        ? {
            id: lastPublished.id,
            totalXp: lastPublished.totalXp,
            effectiveGrade: lastPublished.effectiveGrade as GradeCode | null,
            publishedAt: lastPublished.publishedAt?.toISOString() ?? null,
          }
        : null,
    };
  });

  return (
    <main className="max-w-[1300px] mx-auto px-8 pt-12 pb-16">
      <div className="mb-10">
        <h1 className="font-display text-5xl font-light tracking-tight mb-3">
          Мои дизайнеры
        </h1>
        <p className="text-stone leading-relaxed max-w-xl">
          {stats.total} дизайнеров под твоим лидерством.{' '}
          {stats.published > 0 && `${stats.published} оценено`}
          {stats.draft > 0 && `, ${stats.draft} в черновике`}
          {stats.notStarted > 0 && `, ${stats.notStarted} ещё не оценено`}.
        </p>
      </div>

      {cards.length === 0 ? (
        <div className="bg-white border border-cloud rounded-card p-8 text-center shadow-soft">
          <p className="text-stone">К тебе ещё не привязали дизайнеров. Попроси админа.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {cards.map((d) => {
            const primaryHref = d.draft
              ? `/lead/assess?id=${d.id}`
              : d.published
                ? `/lead/portrait?id=${d.id}`
                : `/lead/assess?id=${d.id}`;
            const statusLabel = d.draft
              ? 'Черновик'
              : d.published
                ? 'Оценено'
                : 'Не оценено';
            const statusClass = d.draft
              ? 'bg-[#fff7e6] text-sunset border border-sunset/25'
              : d.published
                ? 'bg-lime-light text-graphite border border-lime/30'
                : 'bg-canvas text-stone border border-cloud';
            const borderClass = d.draft
              ? 'border-lime/25'
              : d.published
                ? 'border-cloud'
                : 'border-dashed border-ash';
            return (
              <Link
                key={d.id}
                href={primaryHref}
                className={`block bg-white border rounded-card p-7 shadow-soft hover:shadow-soft-lg transition-shadow ${borderClass}`}
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-pill bg-canvas flex items-center justify-center text-base font-medium">
                      {d.initials}
                    </div>
                    <div>
                      <div className="font-display text-xl tracking-tight">{d.fullName}</div>
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
                  <span className={`px-2.5 py-1 rounded-pill text-xs font-medium ${statusClass}`}>
                    {statusLabel}
                  </span>
                </div>

                {d.published && (
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-cloud">
                    <div>
                      <div className="text-xs uppercase tracking-widest text-stone mb-1">
                        {d.gradeFloor ? 'Эфф. грейд' : 'Грейд'}
                      </div>
                      <div className="font-display text-2xl">
                        {GRADE_NAMES[(d.published.effectiveGrade ?? 'intern') as GradeCode]}
                      </div>
                      {d.gradeFloor && (
                        <div className="text-xs text-sunset mt-0.5">зафиксирован</div>
                      )}
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-widest text-stone mb-1">XP</div>
                      <div className="font-display text-2xl">{d.published.totalXp ?? 0}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-stone mt-1">
                        {d.published.publishedAt &&
                          new Date(d.published.publishedAt).toLocaleDateString('ru-RU')}
                      </div>
                      {d.draft && (
                        <div className="text-xs text-sunset mt-1">+ черновик</div>
                      )}
                    </div>
                  </div>
                )}

                {!d.published && d.draft && (
                  <div className="pt-4 border-t border-cloud flex items-center justify-between">
                    <span className="text-xs text-stone">
                      Черновик создан{' '}
                      {new Date(d.draft.createdAt).toLocaleDateString('ru-RU')}
                    </span>
                    <span className="text-xs text-stone hover:text-ink">Продолжить →</span>
                  </div>
                )}

                {!d.published && !d.draft && (
                  <div className="pt-4 flex items-center justify-end">
                    <span className="bg-lime border border-lime rounded-pill px-4 py-1.5 text-xs font-medium">
                      Начать оценку
                    </span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
