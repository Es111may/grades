export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import AssessmentForm from './AssessmentForm';
import type { BuildCode, GradeCode } from '@/lib/types';

function currentCycle() {
  const now = new Date();
  const month = now.getMonth() + 1;
  return month <= 6 ? `${now.getFullYear()}-04` : `${now.getFullYear()}-10`;
}

export default async function AssessPage({
  params,
}: {
  params: { designerId: string };
}) {
  const me = await getCurrentUser();
  if (!me || (me.role !== 'lead' && me.role !== 'admin')) redirect('/auth/signin');

  const designerId = parseInt(params.designerId, 10);
  const cycle = currentCycle();

  const designer = await prisma.user.findUnique({
    where: { id: designerId },
    include: { build: true, lead: true },
  });
  if (!designer || !designer.buildId) redirect('/lead');

  // Get or create assessment
  let assessment = await prisma.assessment.findFirst({
    where: { designerId, cycle },
    include: { scores: true },
  });

  const matrix = await prisma.matrixVersion.findFirst({ where: { isCurrent: true } });
  if (!matrix) redirect('/lead');

  if (!assessment) {
    assessment = await prisma.assessment.create({
      data: {
        designerId,
        leadId: me.id!,
        matrixVersionId: matrix.id,
        cycle,
        status: 'draft',
      },
      include: { scores: true },
    });
  }

  // Load all skills for this matrix + build weights
  const skills = await prisma.skill.findMany({
    where: { matrixVersionId: matrix.id, active: true },
    include: {
      weights: { where: { buildId: designer.buildId } },
      masteries: {
        where: { matrixVersionId: matrix.id },
        orderBy: { level: 'asc' },
      },
      group: { include: { taxonomy: true } },
    },
    orderBy: [
      { group: { taxonomy: { sortOrder: 'asc' } } },
      { group: { sortOrder: 'asc' } },
    ],
  });

  // Load grade thresholds
  const gradeLevels = await prisma.gradeLevel.findMany({
    where: { matrixVersionId: matrix.id },
    include: { gates: { where: { buildId: designer.buildId } } },
    orderBy: { sortOrder: 'asc' },
  });

  // Serialize for client
  const buildCode = designer.build!.code as BuildCode;

  const serializedSkills = skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    type: s.type,
    maxMasteryLevel: s.maxMasteryLevel,
    replaceableNote: s.replaceableNote,
    weight: s.weights[0]?.weight ?? 0,
    taxonomyCode: s.group.taxonomy.code,
    taxonomyName: s.group.taxonomy.name,
    groupName: s.group.name,
    levels: s.masteries.map((m) => ({
      level: m.level,
      title: m.title,
      criteria: m.criteria,
    })),
  }));

  const serializedGrades = gradeLevels.map((g) => ({
    code: g.code as GradeCode,
    name: g.name,
    threshold: (g.xpThresholds as Record<string, number>)[buildCode] ?? 0,
    gates: g.gates.map((gate) => ({
      skillId: gate.skillId,
      requiredMastery: gate.requiredMastery,
    })),
  }));

  const existingScores: Record<number, number> = {};
  assessment.scores.forEach((sc) => {
    existingScores[sc.skillId] = sc.masteryLevel;
  });

  // Compute max XP for this build
  const maxXp = serializedSkills.reduce((sum, s) => sum + s.maxMasteryLevel * s.weight, 0);

  return (
    <AssessmentForm
      assessmentId={assessment.id}
      assessmentStatus={assessment.status}
      designer={{
        id: designer.id,
        fullName: designer.fullName,
        buildCode,
        buildName: designer.build!.name,
        department: designer.department,
        gradeFloor: designer.gradeFloor as GradeCode | null,
        hiredAt: designer.hiredAt?.toISOString() ?? null,
      }}
      cycle={cycle}
      skills={serializedSkills}
      grades={serializedGrades}
      existingScores={existingScores}
      maxXp={maxXp}
    />
  );
}
