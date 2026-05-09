export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { loadPortraitData } from '@/lib/portrait';
import { GRADE_NAMES } from '@/lib/types';
import type { GradeCode } from '@/lib/types';
import Portrait from './Portrait';

export default async function DesignerPortraitPage() {
  const user = await getCurrentUser();
  if (!user?.id) return null;

  const result = await loadPortraitData(user.id);

  if (result.kind === 'not_found') {
    return (
      <main className="max-w-[800px] mx-auto px-8 pt-12 pb-16">
        <div className="bg-white border border-cloud rounded-card p-8 shadow-soft text-center">
          <p className="text-stone">Профиль не найден.</p>
        </div>
      </main>
    );
  }

  if (result.kind === 'no_assessment') {
    const me = await prisma.user.findUnique({
      where: { id: user.id },
      include: { build: true, lead: true },
    });
    return (
      <main className="max-w-[1000px] mx-auto px-8 pt-12 pb-16">
        <div className="mb-10">
          <h1 className="font-display text-4xl font-semibold tracking-tight mb-3">
            {me?.fullName}
          </h1>
          <p className="text-stone">
            {me?.build?.name ?? '— билд не назначен'} · {me?.department ?? '—'}
          </p>
        </div>

        <div className="bg-white border border-cloud rounded-card p-10 shadow-soft text-center mb-6">
          <div className="font-display text-3xl mb-3">Оценка ещё не проводилась</div>
          <p className="text-stone leading-relaxed max-w-md mx-auto">
            Когда лид опубликует первую оценку — здесь появится твой грейд, XP, радар-диаграмма
            и список навыков.
          </p>
        </div>

        {me?.gradeFloor && (
          <div className="bg-lime-light border border-lime rounded-card p-6">
            <div className="text-xs uppercase tracking-widest text-graphite mb-2">
              Зафиксированный грейд
            </div>
            <p className="text-sm text-graphite leading-relaxed">
              При переходе с прежней системы за тобой закреплён грейд{' '}
              <strong>{GRADE_NAMES[me.gradeFloor as GradeCode] ?? me.gradeFloor}</strong>.
              Если расчёт по новой матрице даст ниже — всё равно показывается этот.
            </p>
          </div>
        )}
      </main>
    );
  }

  return <Portrait data={result.data} />;
}
