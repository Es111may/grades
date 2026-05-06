export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export default async function LeadDashboard() {
  const user = await getCurrentUser();
  const myDesigners = user?.id
    ? await prisma.user.findMany({
        where: { leadId: user.id, role: 'designer', active: true },
        include: { build: true },
        orderBy: { fullName: 'asc' },
      })
    : [];

  return (
    <main className="max-w-[1300px] mx-auto px-8 pt-12 pb-16">
      <div className="mb-10">
        <div className="text-xs uppercase tracking-widest text-stone mb-2">Phase 1 — каркас</div>
        <h1 className="font-display text-5xl font-light tracking-tight mb-2">Мои дизайнеры</h1>
        <p className="text-stone leading-relaxed">
          {myDesigners.length} {myDesigners.length === 1 ? 'дизайнер' : 'дизайнеров'} под твоим
          лидерством. На Phase 1 — только список, форма оценки появится в Phase 3.
        </p>
      </div>

      {myDesigners.length === 0 ? (
        <div className="bg-white border border-cloud rounded-card p-8 text-center shadow-soft">
          <p className="text-stone">К тебе ещё не привязали дизайнеров. Попроси админа в `/admin`.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {myDesigners.map((d) => (
            <article key={d.id} className="bg-white border border-cloud rounded-card p-6 shadow-soft">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-pill bg-canvas flex items-center justify-center text-base font-medium">
                  {d.fullName
                    .split(' ')
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <div className="font-medium">{d.fullName}</div>
                  <div className="text-xs text-stone">
                    {d.build?.name ?? '—'} · {d.department ?? '—'}
                  </div>
                </div>
              </div>
              <div className="text-xs text-stone">{d.email}</div>
              {d.gradeFloor && (
                <div className="mt-3 text-xs">
                  <span className="text-sunset font-medium">Grade floor: {d.gradeFloor}</span>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
