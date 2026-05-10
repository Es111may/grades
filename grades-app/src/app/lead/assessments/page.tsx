export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import AssessmentsClient, { type AssessmentRow } from './AssessmentsClient';

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

  const rows: AssessmentRow[] = assessments.map((a) => ({
    id: a.id,
    designerId: a.designerId,
    designerName: a.designer.fullName,
    designerEmail: a.designer.email,
    designerAvatarUrl: a.designer.avatarUrl,
    buildCode: a.designer.build?.code ?? null,
    buildName: a.designer.build?.name ?? null,
    department: a.designer.department,
    leadName: a.lead?.fullName ?? null,
    publishedAt: a.publishedAt?.toISOString() ?? null,
    effectiveGrade: a.effectiveGrade,
    totalXp: a.totalXp,
  }));

  return <AssessmentsClient rows={rows} meRole={me.role ?? ''} />;
}
