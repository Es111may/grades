export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { GRADE_NAMES } from '@/lib/types';
import type { BuildCode, GradeCode } from '@/lib/types';
import AssessmentForm from './AssessmentForm';

function currentCycle() {
  const now = new Date();
  const month = now.getMonth() + 1;
  return month <= 6
    ? `${now.getFullYear()}-04`
    : `${now.getFullYear()}-10`;
}

export default async function AssessPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const user = await getCurrentUser();
  if (!user?.id) redirect('/auth/signin');

  const designerId = parseInt(searchParams.id ?? '', 10);
  if (isNaN(designerId)) redirect('/lead');

  // Load designer with build
  const designer = await prisma.user.findUnique({
    where: { id: designerId },
    include: { build: true },
  });

  if (!designer || !designer.build) redirect('/lead');

  const buildCode = designer.build.code as BuildCode;
  const cycle = currentCycle();

  // Get current matrix version
  const matrix = await prisma.matrixVersion.findFirst({ where: { isCurrent: true } });
  if (!matrix) redirect('/lead');

  // Get or create draft assessment
  let assessment = await prisma.assessment.findFirst({
    where: { designerId, cycle, status: { not: 'archived' } },
    orderBy: { createdAt: 'desc' },
    include: { scores: true },
  });

  if (!assessment) {
    assessment = await prisma.assessment.create({
      data: {
        designerId,
        leadId: user.id,
        matrixVersionId: matrix.id,
        cycle,
        status: 'draft',
      },
      include: { scores: true },
    });
  }

  // Load skills with weights for this build + mastery levels
  const skills = await prisma.skill.findMany({
    where: { matrixVersionId: matrix.id, active: true },
    include: {
      weights: { where: { buildId: designer.buildId! } },
      group: { include: { taxonomy: true } },
      masteries: { orderBy: { level: 'asc' } },
    },
    orderBy: [
      { group: { taxonomy: { sortOrder: 'asc' } } },
      { group: { sortOrder: 'asc' } },
      { name: 'asc' },
    ],
  });

  // Load grade levels with gates for this build
  const gradeLevels = await prisma.gradeLevel.findMany({
    where: { matrixVersionId: matrix.id },
    include: { gates: { where: { buildId: designer.buildId! } } },
    orderBy: { sortOrder: 'asc' },
  });

  // Serialize for client
  const skillsData = skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description ?? '',
    type: s.type,
    maxMasteryLevel: s.maxMasteryLevel,
    replaceableNote: s.replaceableNote,
    weight: s.weights[0]?.weight ?? 0,
    taxonomyCode: s.group.taxonomy.code,
    taxonomyName: s.group.taxonomy.name,
    groupName: s.group.name,
    levels: s.masteries.map((ml) => ({
      level: ml.level,
      title: ml.title,
      criteria: ml.criteria ?? '',
    })),
  }));

  const gradesData = gradeLevels.map((g) => ({
    code: g.code as GradeCode,
    name: GRADE_NAMES[g.code as GradeCode] ?? g.code,
    threshold: (g.xpThresholds as Record<string, number>)?.[buildCode] ?? 0,
    gates: g.gates.map((gate) => ({
      skillId: gate.skillId,
      requiredMastery: gate.requiredMastery,
    })),
  }));

  const existingScores: Record<number, number> = {};
  for (const sc of assessment.scores) {
    existingScores[sc.skillId] = sc.masteryLevel;
  }

  // Max possible XP
  const maxXp = skillsData.reduce(
    (sum, s) => sum + s.weight * s.maxMasteryLevel,
    0,
  );

  return (
    <AssessmentForm
      assessmentId={assessment.id}
      assessmentStatus={assessment.status}
      designer={{
        id: designer.id,
        fullName: designer.fullName,
        buildCode,
        buildName: designer.build.name,
        department: designer.department,
        gradeFloor: designer.gradeFloor as GradeCode | null,
        hiredAt: designer.hiredAt?.toISOString() ?? null,
      }}
      cycle={cycle}
      skills={skillsData}
      grades={gradesData}
      existingScores={existingScores}
      maxXp={maxXp}
    />
  );
}
