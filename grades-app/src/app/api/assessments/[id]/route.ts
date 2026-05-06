export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { calcGrade, type SkillSnapshot, type ScoreInput, type GradeThreshold } from '@/lib/grade';
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

  return NextResponse.json({ ok: true, result });
}

/** DELETE /api/assessments/[id] — discard draft */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me || (me.role !== 'lead' && me.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const assessmentId = parseInt(params.id, 10);
  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });

  if (!assessment || assessment.status === 'published') {
    return NextResponse.json({ error: 'Cannot delete published assessment' }, { status: 400 });
  }

  await prisma.assessment.delete({ where: { id: assessmentId } });
  return NextResponse.json({ ok: true });
}
