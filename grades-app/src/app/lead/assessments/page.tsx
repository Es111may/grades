export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { avatarSrc } from '@/lib/avatar';
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

  // Явный select: списку не нужен snapshot оценки (большой JSON на каждую
  // строку) и полные строки людей — у лида свой аватар и хэш пароля.
  // Аватар уходит клиенту ссылкой /api/avatar, а не data URL (lib/avatar).
  const designerSelect = {
    select: {
      id: true,
      fullName: true,
      email: true,
      avatarUrl: true,
      department: true,
      build: { select: { code: true, name: true } },
    },
  } as const;
  const leadSelect = { select: { fullName: true } } as const;

  const [assessments, drafts] = await Promise.all([
    prisma.assessment.findMany({
      where: { ...publishedWhere, status: 'published' },
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        designerId: true,
        publishedAt: true,
        effectiveGrade: true,
        totalXp: true,
        designer: designerSelect,
        lead: leadSelect,
      },
    }),
    prisma.assessment.findMany({
      where: { ...draftWhere, status: 'draft' },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        designerId: true,
        leadId: true,
        updatedAt: true,
        createdAt: true,
        designer: designerSelect,
        lead: leadSelect,
      },
    }),
  ]);

  const rows: AssessmentRow[] = assessments.map((a) => ({
    id: a.id,
    designerId: a.designerId,
    designerName: a.designer.fullName,
    designerEmail: a.designer.email,
    designerAvatarUrl: avatarSrc(a.designer),
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
    designerAvatarUrl: avatarSrc(a.designer),
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
