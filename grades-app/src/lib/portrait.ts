/**
 * Загрузчик данных для портрета дизайнера.
 *
 * Используется и в /designer (свой портрет), и в /lead/portrait?id=X (лид смотрит подопечного).
 * Возвращает PortraitData либо null, если опубликованных оценок нет.
 */

import type { Prisma } from '@prisma/client';
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

/**
 * Поля человека, нужные портрету и проверкам прав на странице. Явный select:
 * без passwordHash и полной строки лида (у того свой аватар — data URL).
 * Страница лида берёт человека этим же select'ом для проверки прав и
 * передаёт строку сюда — второй раз в БД за ним не ходим.
 */
export const PORTRAIT_DESIGNER_SELECT = {
  id: true,
  email: true,
  role: true,
  leadId: true,
  stardizId: true,
  fullName: true,
  avatarUrl: true,
  buildId: true,
  department: true,
  gradeFloor: true,
  nextGradingAt: true,
  nextGradingSetAt: true,
  build: { select: { code: true, name: true } },
  lead: { select: { fullName: true } },
} satisfies Prisma.UserSelect;

export type PortraitDesigner = Prisma.UserGetPayload<{
  select: typeof PORTRAIT_DESIGNER_SELECT;
}>;

export function findPortraitDesigner(id: number): Promise<PortraitDesigner | null> {
  return prisma.user.findUnique({ where: { id }, select: PORTRAIT_DESIGNER_SELECT });
}

/** Кто владелец портрета — для прав на странице (ИПР, зарплата). */
export type PortraitTarget = Pick<
  PortraitDesigner,
  'id' | 'email' | 'role' | 'leadId' | 'stardizId'
>;

// Явный select по только тем колонкам, которые точно были в схеме до
// Phase 22.1 — чтобы запрос не падал, если новая колонка leadComment
// ещё не успела добавиться в БД. Из оценок берём только то, что рисует
// портрет: без snapshot (большой JSON) и без комментариев к навыкам.
const ASSESSMENT_SELECT = {
  id: true,
  matrixVersionId: true,
  cycle: true,
  publishedAt: true,
  scores: { select: { skillId: true, masteryLevel: true } },
} satisfies Prisma.AssessmentSelect;

export async function loadPortraitData(
  designerOrId: number | PortraitDesigner,
  assessmentId?: number,
): Promise<
  | {
      kind: 'no_assessment';
      designer: {
        fullName: string;
        gradeFloor: GradeCode | null;
        buildName: string | null;
        department: string | null;
      };
    }
  | { kind: 'ok'; data: PortraitData; target: PortraitTarget }
  | { kind: 'not_found' }
> {
  const designerId = typeof designerOrId === 'number' ? designerOrId : designerOrId.id;
  const published = { designerId, status: 'published' };

  // Человек, список опубликованных оценок и сама оценка зависят только от
  // designerId — параллельно.
  //  - Все опубликованные — для переключателя циклов.
  //  - Если в URL пришёл явный assessmentId — открываем его (если он
  //    принадлежит дизайнеру и опубликован); иначе — последнюю опубликованную.
  const [designer, allPublished, requested] = await Promise.all([
    typeof designerOrId === 'number' ? findPortraitDesigner(designerId) : designerOrId,
    prisma.assessment.findMany({
      where: published,
      orderBy: { publishedAt: 'desc' },
      select: { id: true, publishedAt: true, effectiveGrade: true, totalXp: true },
    }),
    prisma.assessment.findFirst({
      where: assessmentId ? { ...published, id: assessmentId } : published,
      orderBy: { publishedAt: 'desc' },
      select: ASSESSMENT_SELECT,
    }),
  ]);
  if (!designer) return { kind: 'not_found' };

  // Чужой или неопубликованный assessmentId — откатываемся на последнюю
  // опубликованную (она первая в allPublished).
  const assessment =
    requested ??
    (assessmentId && allPublished.length
      ? await prisma.assessment.findUnique({
          where: { id: allPublished[0].id },
          select: ASSESSMENT_SELECT,
        })
      : null);

  if (!assessment) {
    return {
      kind: 'no_assessment',
      designer: {
        fullName: designer.fullName,
        gradeFloor: designer.gradeFloor as GradeCode | null,
        buildName: designer.build?.name ?? null,
        department: designer.department,
      },
    };
  }

  // Load skills + grade levels параллельно — обе зависят только от matrixVersionId/buildId
  const [skills, gradeLevels, leadComment] = await Promise.all([
    prisma.skill.findMany({
      where: { matrixVersionId: assessment.matrixVersionId, active: true },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        active: true,
        maxMasteryLevel: true,
        weights: { where: { buildId: designer.buildId! }, select: { weight: true } },
        group: { select: { name: true, taxonomy: { select: { code: true, name: true } } } },
        masteries: {
          orderBy: { level: 'asc' },
          select: { level: true, title: true, criteria: true },
        },
      },
    }),
    prisma.gradeLevel.findMany({
      where: { matrixVersionId: assessment.matrixVersionId },
      select: {
        code: true,
        xpThresholds: true,
        gates: {
          where: { buildId: designer.buildId! },
          select: { skillId: true, requiredMastery: true },
        },
      },
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
      // Phase 23.2 — план грейдирования (только чтение на портрете)
      nextGradingAt: designer.nextGradingAt?.toISOString() ?? null,
      nextGradingSetAt: designer.nextGradingSetAt?.toISOString() ?? null,
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

  return {
    kind: 'ok',
    data,
    target: {
      id: designer.id,
      email: designer.email,
      role: designer.role,
      leadId: designer.leadId,
      stardizId: designer.stardizId,
    },
  };
}

export function gradeName(code: GradeCode) {
  return GRADE_NAMES[code] ?? code;
}
