/**
 * Идемпотентные миграции данных, привязанные к загрузке страниц.
 *
 * Раньше каждый заход на /admin/grades или /admin/matrix запускал кучу
 * findUnique+update и тормозил рендер. Теперь результат кешируется в памяти
 * процесса: первый запрос проверяет состояние, последующие — no-op.
 *
 * Перезапуск контейнера сбрасывает кеш — это нормально, миграции
 * идемпотентные и быстро отрабатывают повторно если что-то изменилось.
 */

import { Prisma } from '@prisma/client';
import { prisma } from './db';

const TAXONOMY_NAMES: Record<string, string> = {
  UI: 'UI · Визуал',
  UX: 'UX · Система',
  PRD: 'PRD · Продукт',
  IND: 'IND · Самостоятельность',
  RES: 'RES · Ответственность',
};

const GROUP_RENAMES: Array<{ from: string; to: string }> = [
  { from: 'Контент-дизайн', to: 'Контент' },
];

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
  junior: 0,
  junior_plus: 1,
  premiddle: 2,
  middle: 3,
  middle_plus: 4,
  senior: 5,
};

// Имена билдов на 13 мая 2026 — после переименования в названия отделов.
// Раньше: Создатель / Визионер / Навигатор. Теперь: Инхаус / Криэйт / Импрув.
const BUILD_NAMES_TARGET: Record<string, string> = {
  creator: 'Инхаус',
  visioner: 'Криэйт',
  navigator: 'Импрув',
};

let taxonomyNamesEnsured = false;
let groupNamesEnsured = false;
let gradesMigrated = false;
let buildNamesEnsured = false;

export async function ensureBuildNames(): Promise<void> {
  if (buildNamesEnsured) return;
  for (const [code, name] of Object.entries(BUILD_NAMES_TARGET)) {
    const b = await prisma.build.findUnique({ where: { code } });
    if (b && b.name !== name) {
      await prisma.build.update({ where: { code }, data: { name } });
    }
  }
  buildNamesEnsured = true;
}

export async function ensureTaxonomyNames(): Promise<void> {
  if (taxonomyNamesEnsured) return;
  for (const [code, name] of Object.entries(TAXONOMY_NAMES)) {
    const t = await prisma.skillTaxonomy.findUnique({ where: { code } });
    if (t && t.name !== name) {
      await prisma.skillTaxonomy.update({ where: { code }, data: { name } });
    }
  }
  taxonomyNamesEnsured = true;
}

export async function ensureGroupNames(): Promise<void> {
  if (groupNamesEnsured) return;
  for (const { from, to } of GROUP_RENAMES) {
    const oldGroups = await prisma.skillGroup.findMany({ where: { name: from } });
    for (const old of oldGroups) {
      const existing = await prisma.skillGroup.findFirst({
        where: { taxonomyId: old.taxonomyId, name: to },
      });
      if (existing) {
        await prisma.skill.updateMany({
          where: { groupId: old.id },
          data: { groupId: existing.id },
        });
        await prisma.skillGroup.delete({ where: { id: old.id } });
      } else {
        await prisma.skillGroup.update({
          where: { id: old.id },
          data: { name: to },
        });
      }
    }
  }
  groupNamesEnsured = true;
}

export async function ensureGradesMigrated(): Promise<void> {
  if (gradesMigrated) return;
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
        where: { calculatedGrade: 'intern' },
        data: { calculatedGrade: 'junior' },
      });
      await prisma.assessment.updateMany({
        where: { effectiveGrade: 'intern' },
        data: { effectiveGrade: 'junior' },
      });
      await prisma.user.updateMany({
        where: { gradeFloor: 'intern' },
        data: { gradeFloor: null },
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
  gradesMigrated = true;
}
