export const dynamic = 'force-dynamic';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import GradesClient from './GradesClient';

const TARGET_THRESHOLDS = {
  junior: 0,
  junior_plus: 75,
  premiddle: 105,
  middle: 135,
  middle_plus: 180,
  senior: 230,
} as const;
const TARGET_NAMES: Record<string, string> = {
  junior: 'Джун',
  junior_plus: 'Джун+',
  premiddle: 'Пре-мидл',
  middle: 'Мидл',
  middle_plus: 'Мидл+',
  senior: 'Синьор',
};
const TARGET_SORT: Record<string, number> = {
  junior: 0, junior_plus: 1, premiddle: 2, middle: 3, middle_plus: 4, senior: 5,
};

const TAXONOMY_NAMES: Record<string, string> = {
  UI: 'UI · Визуал',
  UX: 'UX · Система',
  PRD: 'PRD · Продукт',
  IND: 'IND · Самостоятельность',
  RES: 'RES · Ответственность',
};

/** Обновить русские названия таксономий (UI/UX/PRD/IND/RES) до текущих. */
async function ensureTaxonomyNames() {
  for (const [code, name] of Object.entries(TAXONOMY_NAMES)) {
    const t = await prisma.skillTaxonomy.findUnique({ where: { code } });
    if (t && t.name !== name) {
      await prisma.skillTaxonomy.update({ where: { code }, data: { name } });
    }
  }
}

/** Идемпотентная миграция: убрать intern, добавить premiddle, выставить пороги. */
async function ensureGradesMigrated() {
  const matrices = await prisma.matrixVersion.findMany();
  const builds = await prisma.build.findMany();
  const buildCodes = builds.map((b) => b.code);
  for (const matrix of matrices) {
    const grades = await prisma.gradeLevel.findMany({
      where: { matrixVersionId: matrix.id },
    });
    const byCode = new Map(grades.map((g) => [g.code, g]));
    const intern = byCode.get('intern');
    const hasPremiddle = byCode.has('premiddle');

    if (intern) {
      await prisma.assessment.updateMany({
        where: { calculatedGrade: 'intern' }, data: { calculatedGrade: 'junior' },
      });
      await prisma.assessment.updateMany({
        where: { effectiveGrade: 'intern' }, data: { effectiveGrade: 'junior' },
      });
      await prisma.user.updateMany({
        where: { gradeFloor: 'intern' }, data: { gradeFloor: null },
      });
      await prisma.skillGate.deleteMany({ where: { gradeLevelId: intern.id } });
      await prisma.gradeLevel.delete({ where: { id: intern.id } });
    }

    if (!hasPremiddle) {
      const xp: Record<string, number> = {};
      for (const bc of buildCodes) xp[bc] = TARGET_THRESHOLDS.premiddle;
      await prisma.gradeLevel.create({
        data: {
          matrixVersionId: matrix.id,
          code: 'premiddle',
          name: TARGET_NAMES.premiddle,
          sortOrder: TARGET_SORT.premiddle,
          xpThresholds: xp as unknown as Prisma.InputJsonValue,
        },
      });
    }

    for (const code of Object.keys(TARGET_THRESHOLDS)) {
      const g = await prisma.gradeLevel.findFirst({
        where: { matrixVersionId: matrix.id, code },
      });
      if (!g) continue;
      const xp: Record<string, number> = {};
      for (const bc of buildCodes) {
        xp[bc] = TARGET_THRESHOLDS[code as keyof typeof TARGET_THRESHOLDS];
      }
      const t = g.xpThresholds as Record<string, number>;
      const target = TARGET_THRESHOLDS[code as keyof typeof TARGET_THRESHOLDS];
      const needsUpdate =
        g.name !== TARGET_NAMES[code] ||
        g.sortOrder !== TARGET_SORT[code] ||
        !buildCodes.every((bc) => t?.[bc] === target);
      if (needsUpdate) {
        await prisma.gradeLevel.update({
          where: { id: g.id },
          data: {
            xpThresholds: xp as unknown as Prisma.InputJsonValue,
            name: TARGET_NAMES[code],
            sortOrder: TARGET_SORT[code],
          },
        });
      }
    }
  }
}

export default async function AdminGradesPage() {
  // Прогоняем миграции при каждом открытии страницы — идемпотентно.
  // Это гарантирует фикс даже если автозапуск из start.ts не отработал.
  await ensureGradesMigrated();
  await ensureTaxonomyNames();

  const matrix = await prisma.matrixVersion.findFirst({ where: { isCurrent: true } });
  if (!matrix) {
    return (
      <main className="max-w-[800px] mx-auto px-8 pt-12">
        <p className="text-stone">Активная матрица не найдена.</p>
      </main>
    );
  }

  const builds = await prisma.build.findMany({ orderBy: { sortOrder: 'asc' } });

  const grades = await prisma.gradeLevel.findMany({
    where: { matrixVersionId: matrix.id },
    include: {
      gates: {
        include: { skill: true, build: true },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  // Skill list — for building gate-skill name lookup
  const skills = await prisma.skill.findMany({
    where: { matrixVersionId: matrix.id, active: true },
    select: {
      id: true,
      name: true,
      group: { select: { taxonomy: { select: { code: true } } } },
    },
    orderBy: { name: 'asc' },
  });

  return (
    <GradesClient
      matrixNumber={matrix.number}
      builds={builds.map((b) => ({ id: b.id, code: b.code, name: b.name }))}
      grades={grades.map((g) => ({
        id: g.id,
        code: g.code,
        name: g.name,
        sortOrder: g.sortOrder,
        xpThresholds: (g.xpThresholds as Record<string, number>) ?? {},
        gates: g.gates.map((gate) => ({
          id: gate.id,
          buildId: gate.buildId,
          buildCode: gate.build.code,
          skillId: gate.skillId,
          skillName: gate.skill.name,
          requiredMastery: gate.requiredMastery,
        })),
      }))}
      skills={skills.map((s) => ({
        id: s.id,
        name: s.name,
        taxonomyCode: s.group.taxonomy.code,
      }))}
    />
  );
}
