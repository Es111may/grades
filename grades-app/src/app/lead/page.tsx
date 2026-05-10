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
  // Фильтр зависит от роли:
  //  - admin → все активные дизайнеры (можно грейдировать кого угодно)
  //  - lead  → дизайнеры с leadId === me.id
  //  - stardiz → дизайнеры с stardizId === me.id ИЛИ leadId === me.id
  const where: Record<string, unknown> = { role: 'designer', active: true };
  if (user.role === 'lead') {
    where.leadId = user.id;
  } else if (user.role === 'stardiz') {
    where.OR = [{ stardizId: user.id }, { leadId: user.id }];
  }
  // admin → без фильтра по lead/stardiz

  const myDesigners = await prisma.user.findMany({
    where,
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
    <main className="max-w-[1300px] mx-auto px-8 pt-10 pb-16">
      <div className="mb-8">
        <h1 className="font-display text-4xl font-semibold tracking-tight mb-2">
          {user.role === 'admin' ? 'Все дизайнеры' : 'Мои дизайнеры'}
        </h1>
        <p className="text-stone leading-relaxed max-w-xl">
          {stats.total}{' '}
          {user.role === 'admin'
            ? 'активных дизайнеров. '
            : 'дизайнеров под твоим наставничеством. '}
          {stats.published > 0 && `${stats.published} оценено`}
          {stats.draft > 0 && `, ${stats.draft} в черновике`}
          {stats.notStarted > 0 && `, ${stats.notStarted} ещё не оценено`}.
        </p>
      </div>

      {cards.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-stone">К тебе ещё не привязали дизайнеров. Попроси админа.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {cards.map((d) => {
            const primaryHref = d.draft
              ? `/lead/assess?id=${d.id}`
              : d.published
                ? `/lead/portrait?id=${d.id}`
                : `/lead/assess?id=${d.id}`;
            const statusChip = d.draft
              ? 'chip-warn'
              : d.published
                ? 'chip-accent'
                : 'chip-neutral';
            const statusLabel = d.draft ? 'Черновик' : d.published ? 'Оценено' : 'Не оценено';
            return (
              <Link key={d.id} href={primaryHref} className="card-hover p-6 block">
                <div className="flex items-start justify-between mb-5 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-pill bg-cloud flex items-center justify-center text-sm font-semibold tracking-tight shrink-0">
                      {d.initials}
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-lg font-semibold tracking-tight truncate">
                        {d.fullName}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-stone mt-0.5 flex-wrap">
                        {d.buildCode && (
                          <>
                            <span className="flex items-center gap-1">
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{
                                  background:
                                    d.buildCode === 'creator'
                                      ? '#00ca48'
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
                        <span>{d.department ?? '—'}</span>
                        {d.gradeFloor && (
                          <>
                            <span className="text-ash">·</span>
                            <span className="text-sunset">
                              floor {GRADE_NAMES[d.gradeFloor] ?? d.gradeFloor}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className={statusChip}>{statusLabel}</span>
                </div>

                {d.published && (
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-cloud">
                    <div>
                      <div className="text-[11px] uppercase tracking-widest text-stone mb-1">
                        {d.gradeFloor ? 'Эфф. грейд' : 'Грейд'}
                      </div>
                      <div className="font-display text-2xl font-semibold tracking-tight">
                        {GRADE_NAMES[(d.published.effectiveGrade ?? 'junior') as GradeCode]}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-widest text-stone mb-1">
                        XP
                      </div>
                      <div className="font-display text-2xl font-semibold tracking-tight">
                        {d.published.totalXp ?? 0}
                      </div>
                    </div>
                    <div className="text-right text-xs text-stone self-end">
                      {d.published.publishedAt &&
                        new Date(d.published.publishedAt).toLocaleDateString('ru-RU', {
                          day: 'numeric',
                          month: 'short',
                          year: '2-digit',
                        })}
                      {d.draft && <div className="text-sunset mt-0.5">+ черновик</div>}
                    </div>
                  </div>
                )}

                {!d.published && d.draft && (
                  <div className="pt-4 border-t border-cloud flex items-center justify-between text-xs text-stone">
                    <span>
                      Черновик от{' '}
                      {new Date(d.draft.createdAt).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                    <span className="text-ink">Продолжить →</span>
                  </div>
                )}

                {!d.published && !d.draft && (
                  <div className="pt-4 border-t border-cloud flex items-center justify-end">
                    <span className="btn-accent btn-sm">Начать оценку</span>
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
