export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import AssessmentsClient, {
  type AssessmentRow,
  type DraftRow,
} from './AssessmentsClient';

export default async function LeadAssessmentsPage() {
  const me = await getCurrentUser();
  if (!me?.id) return null;

  // Scope для published — оригинальный.
  let publishedWhere: Record<string, unknown> = {};
  // Scope для draft — частично совпадает, но логика мягче:
  // - lead видит свои draft'ы (где он автор) + draft'ы своих подопечных
  //   (вдруг другой лид/стардиз/админ начал черновик его дизайнеру)
  // - stardiz видит draft'ы подопечных
  // - admin видит всё
  let draftWhere: Record<string, unknown> = {};

  if (me.role === 'lead') {
    publishedWhere = { lead: { id: me.id } };
    draftWhere = {
      OR: [
        { leadId: me.id },
        { designer: { OR: [{ leadId: me.id }, { stardizId: me.id }] } },
      ],
    };
  } else if (me.role === 'stardiz') {
    publishedWhere = {
      designer: { OR: [{ stardizId: me.id }, { leadId: me.id }] },
    };
    draftWhere = {
      designer: { OR: [{ stardizId: me.id }, { leadId: me.id }] },
    };
  }
  // admin → все

  const [assessments, drafts] = await Promise.all([
    prisma.assessment.findMany({
      where: { ...publishedWhere, status: 'published' },
      orderBy: { publishedAt: 'desc' },
      include: {
        designer: { include: { build: true } },
        lead: true,
      },
    }),
    prisma.assessment.findMany({
      where: { ...draftWhere, status: 'draft' },
      orderBy: { updatedAt: 'desc' },
      include: {
        designer: { include: { build: true } },
        lead: true,
      },
    }),
  ]);

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

  const draftRows: DraftRow[] = drafts.map((a) => ({
    id: a.id,
    designerId: a.designerId,
    designerName: a.designer.fullName,
    designerEmail: a.designer.email,
    designerAvatarUrl: a.designer.avatarUrl,
    buildCode: a.designer.build?.code ?? null,
    buildName: a.designer.build?.name ?? null,
    leadName: a.lead?.fullName ?? null,
    leadId: a.leadId,
    /** Когда последний раз кто-то трогал черновик — важнее даты создания. */
    updatedAt: a.updatedAt.toISOString(),
    createdAt: a.createdAt.toISOString(),
  }));

  return (
    <AssessmentsClient
      rows={rows}
      drafts={draftRows}
      meRole={me.role ?? ''}
      meId={me.id ?? null}
    />
  );
}
