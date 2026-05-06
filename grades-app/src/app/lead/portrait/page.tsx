export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { loadPortraitData } from '@/lib/portrait';
import { GRADE_NAMES } from '@/lib/types';
import type { GradeCode } from '@/lib/types';
import Portrait from '@/app/designer/Portrait';
import PortraitActions from './PortraitActions';

export default async function LeadPortraitPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const user = await getCurrentUser();
  if (!user?.id) redirect('/auth/signin');

  const designerId = parseInt(searchParams.id ?? '', 10);
  if (isNaN(designerId)) redirect('/lead');

  // Permission: only the designer's lead or admin
  const designer = await prisma.user.findUnique({ where: { id: designerId } });
  if (!designer) redirect('/lead');
  if (user.role !== 'admin' && designer.leadId !== user.id) redirect('/lead');

  const result = await loadPortraitData(designerId);

  if (result.kind === 'not_found') redirect('/lead');

  if (result.kind === 'no_assessment') {
    return (
      <main className="max-w-[1000px] mx-auto px-8 pt-12 pb-16">
        <Link href="/lead" className="text-sm text-stone hover:text-ink mb-4 inline-block">
          ← к списку
        </Link>
        <div className="mb-10">
          <h1 className="font-display text-5xl font-light tracking-tight mb-3">
            {result.designer.fullName}
          </h1>
        </div>
        <div className="bg-white border border-cloud rounded-card p-10 shadow-soft text-center">
          <div className="font-display text-3xl mb-3">Оценка не опубликована</div>
          <p className="text-stone mb-6">
            Чтобы увидеть портрет — заполни и опубликуй первую оценку.
          </p>
          <Link
            href={`/lead/assess?id=${designerId}`}
            className="inline-block bg-lime border border-lime rounded-pill px-6 py-2.5 text-sm font-medium hover:opacity-90"
          >
            К форме оценки →
          </Link>
        </div>
        {result.designer.gradeFloor && (
          <div className="bg-lime-light border border-lime rounded-card p-6 mt-6">
            <div className="text-xs uppercase tracking-widest text-graphite mb-2">
              Зафиксированный грейд
            </div>
            <p className="text-sm text-graphite leading-relaxed">
              За дизайнером закреплён грейд{' '}
              <strong>
                {GRADE_NAMES[result.designer.gradeFloor as GradeCode] ?? result.designer.gradeFloor}
              </strong>
              .
            </p>
          </div>
        )}
      </main>
    );
  }

  const draft = await prisma.assessment.findFirst({
    where: { designerId, status: 'draft' },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <>
      <PortraitActions
        designerId={designerId}
        publishedAssessmentId={result.data.assessmentId}
        hasDraft={!!draft}
      />
      <Portrait data={result.data} />
    </>
  );
}
