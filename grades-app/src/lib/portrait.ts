/**
 * Загрузчик данных для портрета дизайнера.
 *
 * Используется и в /designer (свой портрет), и в /lead/portrait?id=X (лид смотрит подопечного).
 * Возвращает PortraitData либо null, если опубликованных оценок нет.
 */

import { prisma } from '@/lib/db';
import { calcGrade, type SkillSnapshot, type ScoreInput, type GradeThreshold } from '@/lib/grade';
import { GRADE_NAMES } from '@/lib/types';
import type { BuildCode, GradeCode } from '@/lib/types';
import type { PortraitData } from '@/app/designer/Portrait';

/**
 * Безопасно читаем `Assessment.leadComment` отдельным запросом.
 *
 * Field был добавлен в Phase 22.1; если миграция (`prisma db push` в
 * start.ts) ещё не применилась на инстансе, прямой SELECT упадёт
 * с ошибкой «column does not exist». Поэтому пробуем — если не вышло,
 * молча возвращаем null. На функциональность портрета это не влияет.
 */
async function safeReadLeadComment(assessmentId: number): Promise<string | null> {
  try {
    const row = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { leadComment: true },
    });
    return row?.leadComment ?? null;
  } catch (e) {
    console.warn('[portrait] leadComment read failed (column missing?):', e);
    return null;
  }
}

export async function loadPortraitData(
  designerId: number,
  assessmentId?: number,
): Promise<
  | { kind: 'no_assessment'; designer: { fullName: string; gradeFloor: GradeCode | null } }
  | { kind: 'ok'; data: PortraitData }
  | { kind: 'not_found' }
> {
  const designer = await prisma.user.findUnique({
    where: { id: designerId },
    include: { build: true, lead: true },
  });
  if (!designer) return { kind: 'not_found' };

  // Все опубликованные оценки этого дизайнера — для переключателя циклов.
  // Явный select по только тем колонкам, которые точно были в схеме до
  // Phase 22.1 — чтобы запрос не падал, если новая колонка leadComment
  // ещё не успела добавиться в БД.
  const allPublished = await prisma.assessment.findMany({
    where: { designerId, status: 'published' },
    orderBy: { publishedAt: 'desc' },
    select: { id: true, publishedAt: true, effectiveGrade: true, totalXp: true },
  });

  // Если в URL пришёл явный assessmentId — открываем его (если он принадлежит
  // дизайнеру и опубликован); иначе — последнюю опубликованную.
  // Используем явный select без leadComment — чтобы запрос не падал, если
  // новая колонка (Phase 22.1) ещё не успела добавиться в БД.
  const assessmentSelect = {
    id: true,
    designerId: true,
    leadId: true,
    matrixVersionId: true,
    cycle: true,
    status: true,
    publishedAt: true,
    totalXp: true,
    calculatedGrade: true,
    effectiveGrade: true,
    scores: true,
  };

  let assessment = assessmentId
    ? await prisma.assessment.findFirst({
        where: { id: assessmentId, designerId, status: 'published' },
        select: assessmentSelect,
      })
    : null;
  if (!assessment) {
    assessment = await prisma.assessment.findFirst({
      where: { designerId, status: 'published' },
      orderBy: { publishedAt: 'desc' },
      select: assessmentSelect,
    });
  }

  if (!assessment) {
    return {
      kind: 'no_assessment',
      designer: {
        fullName: designer.fullName,
        gradeFloor: designer.gradeFloor as GradeCode | null,
      },
    };
  }

  // Load skills + grade levels параллельно — обе зависят только от matrixVersionId/buildId
  const [skills, gradeLevels, leadComment] = await Promise.all([
    prisma.skill.findMany({
      where: { matrixVersionId: assessment.matrixVersionId, active: true },
      include: {
        weights: { where: { buildId: designer.buildId! } },
        group: { include: { taxonomy: true } },
        masteries: { orderBy: { level: 'asc' } },
      },
    }),
    prisma.gradeLevel.findMany({
      where: { matrixVersionId: assessment.matrixVersionId },
      include: { gates: { where: { buildId: designer.buildId! } } },
      orderBy: { sortOrder: 'asc' },
    }),
    safeReadLeadComment(assessment.id),
  ]);

  const buildCode = (designer.build?.code as BuildCode) ?? 'creator';

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

  const gradeThresholds: GradeThreshold[] = gradeLevels.map((g) => ({
    code: g.code as GradeCode,
    threshold: (g.xpThresholds as Record<string, number>)?.[buildCode] ?? 0,
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
    gradeFloor: designer.gradeFloor as GradeCode | null,
  });

  // Build skill list for display
  const scoreMap = new Map<number, number>();
  for (const sc of assessment.scores) scoreMap.set(sc.skillId, sc.masteryLevel);

  const skillsForDisplay = skills.map((s) => {
    const masteryLevel = scoreMap.get(s.id) ?? 0;
    const levelTitle =
      masteryLevel > 0
        ? s.masteries.find((ml) => ml.level === masteryLevel)?.title ?? null
        : null;
    return {
      id: s.id,
      name: s.name,
      type: s.type,
      description: s.description ?? '',
      taxonomyCode: s.group.taxonomy.code,
      taxonomyName: s.group.taxonomy.name,
      groupName: s.group.name,
      weight: s.weights[0]?.weight ?? 0,
      masteryLevel,
      maxMasteryLevel: s.maxMasteryLevel,
      levelTitle,
      levels: s.masteries.map((ml) => ({
        level: ml.level,
        title: ml.title,
        criteria: ml.criteria ?? '',
      })),
    };
  });

  // Max XP per taxonomy + total + groups breakdown
  const maxXpByTaxonomy: Record<string, number> = {};
  const xpByGroup: Record<string, Record<string, { current: number; max: number }>> = {};
  let maxXp = 0;
  for (const s of skillsForDisplay) {
    const m = s.weight * s.maxMasteryLevel;
    const c = s.weight * s.masteryLevel;
    maxXp += m;
    maxXpByTaxonomy[s.taxonomyCode] = (maxXpByTaxonomy[s.taxonomyCode] ?? 0) + m;

    if (!xpByGroup[s.taxonomyCode]) xpByGroup[s.taxonomyCode] = {};
    if (!xpByGroup[s.taxonomyCode][s.groupName]) {
      xpByGroup[s.taxonomyCode][s.groupName] = { current: 0, max: 0 };
    }
    xpByGroup[s.taxonomyCode][s.groupName].current += c;
    xpByGroup[s.taxonomyCode][s.groupName].max += m;
  }

  // Resolve gate skill names for failedGates
  const skillNameMap = new Map<number, string>();
  for (const s of skills) skillNameMap.set(s.id, s.name);

  const nextGrade = result.nextGrade
    ? {
        code: result.nextGrade.code,
        xpNeeded: result.nextGrade.xpNeeded,
        failedGates: result.nextGrade.failedGates.map((g) => ({
          skillId: g.skillId,
          skillName: skillNameMap.get(g.skillId) ?? `#${g.skillId}`,
          requiredMastery: g.requiredMastery,
          currentMastery: g.currentMastery,
        })),
      }
    : null;

  const data: PortraitData = {
    assessmentId: assessment.id,
    designer: {
      fullName: designer.fullName,
      avatarUrl: designer.avatarUrl,
      buildCode: (designer.build?.code as BuildCode) ?? null,
      buildName: designer.build?.name ?? '—',
      department: designer.department,
      leadName: designer.lead?.fullName ?? null,
      gradeFloor: designer.gradeFloor as GradeCode | null,
    },
    cycle: assessment.cycle,
    publishedAt: assessment.publishedAt?.toISOString() ?? null,
    effectiveGrade: result.effectiveGrade,
    calculatedGrade: result.calculatedGrade,
    totalXp: result.totalXp,
    maxXp,
    xpByTaxonomy: result.xpByTaxonomy,
    maxXpByTaxonomy,
    xpByGroup,
    nextGrade,
    skills: skillsForDisplay,
    leadComment,
    siblings: allPublished.map((a) => ({
      id: a.id,
      publishedAt: a.publishedAt?.toISOString() ?? null,
      effectiveGrade: (a.effectiveGrade as GradeCode | null) ?? null,
      totalXp: a.totalXp ?? null,
    })),
  };

  return { kind: 'ok', data };
}

export function gradeName(code: GradeCode) {
  return GRADE_NAMES[code] ?? code;
}
