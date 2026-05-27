export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { calcGrade, type SkillSnapshot, type ScoreInput, type GradeThreshold } from '@/lib/grade';
import { writeAudit, AUDIT_ACTIONS } from '@/lib/audit';
import type { BuildCode, GradeCode } from '@/lib/types';

/** POST /api/assessments/[id]/publish */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me || (me.role !== 'lead' && me.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const assessmentId = parseInt(params.id, 10);

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: {
      scores: true,
      designer: { include: { build: true } },
      matrixVersion: true,
    },
  });

  if (!assessment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (assessment.status === 'published') {
    return NextResponse.json({ error: 'Already published' }, { status: 400 });
  }

  const buildCode = assessment.designer.build?.code as BuildCode;
  if (!buildCode) {
    return NextResponse.json({ error: 'Designer has no build assigned' }, { status: 400 });
  }

  // Load skills + weights + grades + gates for calculation
  const skills = await prisma.skill.findMany({
    where: { matrixVersionId: assessment.matrixVersionId, active: true },
    include: {
      weights: { where: { buildId: assessment.designer.buildId! } },
      group: { include: { taxonomy: true } },
    },
  });

  const skillSnapshots: SkillSnapshot[] = skills.map((s) => ({
    skillId: s.id,
    taxonomyCode: s.group.taxonomy.code,
    weight: s.weights[0]?.weight ?? 0,
    active: s.active,
  }));

  const scoreInputs: ScoreInput[] = assessment.scores.map((sc) => ({
    skillId: sc.skillId,
    masteryLevel: sc.masteryLevel,
  }));

  const gradeLevels = await prisma.gradeLevel.findMany({
    where: { matrixVersionId: assessment.matrixVersionId },
    include: { gates: { where: { buildId: assessment.designer.buildId! } } },
  });

  const gradeThresholds: GradeThreshold[] = gradeLevels.map((g) => ({
    code: g.code as GradeCode,
    threshold: (g.xpThresholds as Record<string, number>)[buildCode] ?? 0,
    gates: g.gates.map((gate) => ({
      skillId: gate.skillId,
      requiredMastery: gate.requiredMastery,
    })),
  }));

  const result = calcGrade({
    build: buildCode,
    skills: skillSnapshots,
    scores: scoreInputs,
    grades: gradeThresholds,
    gradeFloor: assessment.designer.gradeFloor as GradeCode | null,
  });

  // Build snapshot
  const snapshot = {
    skills: skillSnapshots,
    scores: scoreInputs,
    grades: gradeThresholds,
    result,
  };

  await prisma.assessment.update({
    where: { id: assessmentId },
    data: {
      status: 'published',
      publishedAt: new Date(),
      totalXp: result.totalXp,
      calculatedGrade: result.calculatedGrade,
      effectiveGrade: result.effectiveGrade,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  });

  await writeAudit({
    actorId: me.id,
    action: AUDIT_ACTIONS.ASSESSMENT_PUBLISHED,
    targetType: 'assessment',
    targetId: assessmentId,
    extra: { designerId: assessment.designerId },
    after: {
      effectiveGrade: result.effectiveGrade,
      calculatedGrade: result.calculatedGrade,
      totalXp: result.totalXp,
    },
  });

  // Сбрасываем кэш страниц, где этот грейд должен появиться. Без этого
  // admin/lead, открыв `/admin/users` после публикации, мог продолжать
  // видеть stale-данные из Router Cache до hard refresh'а.
  revalidatePath('/admin/users');
  revalidatePath('/lead/assessments');
  revalidatePath(`/lead/portrait`);
  revalidatePath(`/designer`);

  return NextResponse.json({ ok: true, result });
}

/**
 * DELETE /api/assessments/[id]
 *
 * - draft → hard-delete (с каскадом удаляются scores)
 * - published → soft-delete (status='archived'). Так оценка пропадает
 *   из истории/дашборда, но FK от снапшотов и матрицы остаются целыми.
 * - archived → 404 (уже удалена)
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me || (me.role !== 'lead' && me.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const assessmentId = parseInt(params.id, 10);
  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });

  if (!assessment || assessment.status === 'archived') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Permission: admin / lead / stardiz of the designer
  if (me.role !== 'admin') {
    const designer = await prisma.user.findUnique({ where: { id: assessment.designerId } });
    const allowed =
      designer && (designer.leadId === me.id || designer.stardizId === me.id);
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const wasPublished = assessment.status === 'published';
  if (wasPublished) {
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: 'archived' },
    });
  } else {
    await prisma.assessment.delete({ where: { id: assessmentId } });
  }

  await writeAudit({
    actorId: me.id,
    action: AUDIT_ACTIONS.ASSESSMENT_DELETED,
    targetType: 'assessment',
    targetId: assessmentId,
    extra: { designerId: assessment.designerId },
    before: {
      status: assessment.status,
      effectiveGrade: assessment.effectiveGrade,
      totalXp: assessment.totalXp,
    },
    reason: wasPublished ? 'soft-delete (archived)' : 'hard-delete (draft)',
  });

  revalidatePath('/admin/users');
  revalidatePath('/lead/assessments');
  revalidatePath(`/lead/portrait`);
  revalidatePath(`/designer`);

  return NextResponse.json({ ok: true });
}
