export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { GRADE_NAMES } from '@/lib/types';
import type { BuildCode, GradeCode } from '@/lib/types';
import { currentCycle } from '@/lib/cycle';
import AssessmentForm from './AssessmentForm';

export default async function AssessPage({
  searchParams,
}: {
  searchParams: { id?: string; new?: string };
}) {
  const user = await getCurrentUser();
  if (!user?.id) redirect('/auth/signin');

  const designerId = parseInt(searchParams.id ?? '', 10);
  if (isNaN(designerId)) redirect('/admin/users');

  const designer = await prisma.user.findUnique({
    where: { id: designerId },
    include: { build: true },
  });

  if (!designer || !designer.build) redirect('/admin/users');

  const buildCode = designer.build.code as BuildCode;

  const matrix = await prisma.matrixVersion.findFirst({ where: { isCurrent: true } });
  if (!matrix) redirect('/admin/users');

  // Логика выбора оценки:
  // 1. Если есть незавершённый draft — открываем его (продолжаем).
  // 2. Если ?new=1 — принудительно создаём новый draft (для «новой оценки» поверх опубликованной).
  // 3. Иначе — новый draft, если совсем ничего не было.
  const forceNew = searchParams.new === '1';

  let assessment = forceNew
    ? null
    : await prisma.assessment.findFirst({
        where: { designerId, status: 'draft' },
        orderBy: { createdAt: 'desc' },
        include: { scores: true },
      });

  if (!assessment) {
    // Если есть последняя опубликованная — копируем scores как стартовую точку.
    const lastPublished = await prisma.assessment.findFirst({
      where: { designerId, status: 'published' },
      orderBy: { publishedAt: 'desc' },
      include: { scores: true },
    });

    assessment = await prisma.assessment.create({
      data: {
        designerId,
        leadId: user.id,
        matrixVersionId: matrix.id,
        cycle: currentCycle(),
        status: 'draft',
        scores: lastPublished
          ? {
              create: lastPublished.scores.map((s) => ({
                skillId: s.skillId,
                masteryLevel: s.masteryLevel,
              })),
            }
          : undefined,
      },
      include: { scores: true },
    });
  }

  // Skills + grade levels параллельно
  const [skills, gradeLevels] = await Promise.all([
    prisma.skill.findMany({
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
    }),
    prisma.gradeLevel.findMany({
      where: { matrixVersionId: matrix.id },
      include: { gates: { where: { buildId: designer.buildId! } } },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

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
        avatarUrl: designer.avatarUrl,
        buildCode,
        buildName: designer.build.name,
        department: designer.department,
        gradeFloor: designer.gradeFloor as GradeCode | null,
        hiredAt: designer.hiredAt?.toISOString() ?? null,
      }}
      cycle={assessment.cycle}
      skills={skillsData}
      grades={gradesData}
      existingScores={existingScores}
      maxXp={maxXp}
    />
  );
}
