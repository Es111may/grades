/**
 * Миграция структуры грейдов:
 * — убирает «intern»
 * — добавляет «premiddle» (Пре-мидл)
 * — обновляет xpThresholds под новые числа
 *
 * Идемпотентный: проверяет состояние и пропускает если уже мигрировано.
 * Запускается из scripts/start.ts на каждом деплое.
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// Целевые пороги XP (одинаковы для всех билдов).
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

const TARGET_SORT_ORDER: Record<string, number> = {
  junior: 0,
  junior_plus: 1,
  premiddle: 2,
  middle: 3,
  middle_plus: 4,
  senior: 5,
};

async function main() {
  console.log('🔧 grades migration check…');

  const matrices = await prisma.matrixVersion.findMany();
  if (matrices.length === 0) {
    console.log('  no matrix versions yet — skip');
    return;
  }

  const builds = await prisma.build.findMany();
  const buildCodes = builds.map((b) => b.code);

  for (const matrix of matrices) {
    console.log(`  matrix #${matrix.number}`);
    const grades = await prisma.gradeLevel.findMany({
      where: { matrixVersionId: matrix.id },
    });

    const byCode = new Map(grades.map((g) => [g.code, g]));
    const hasIntern = byCode.has('intern');
    const hasPremiddle = byCode.has('premiddle');
    const thresholdsCorrect = ['junior', 'junior_plus', 'middle', 'middle_plus', 'senior'].every(
      (code) => {
        const g = byCode.get(code);
        if (!g) return false;
        const t = g.xpThresholds as Record<string, number>;
        const target = TARGET_THRESHOLDS[code as keyof typeof TARGET_THRESHOLDS];
        return buildCodes.every((bc) => t?.[bc] === target);
      },
    );

    if (!hasIntern && hasPremiddle && thresholdsCorrect) {
      console.log('    ✓ already migrated, skip');
      continue;
    }

    await prisma.$transaction(async (tx) => {
      // 1. Если есть intern — переводим зависимые данные на junior, потом удаляем
      if (hasIntern) {
        const intern = byCode.get('intern')!;
        console.log(`    → migrating intern → junior in assessments / users…`);

        // Обновим Assessment.calculatedGrade = 'intern' → 'junior'
        const updAss1 = await tx.assessment.updateMany({
          where: { calculatedGrade: 'intern' },
          data: { calculatedGrade: 'junior' },
        });
        // Assessment.effectiveGrade
        const updAss2 = await tx.assessment.updateMany({
          where: { effectiveGrade: 'intern' },
          data: { effectiveGrade: 'junior' },
        });
        // User.gradeFloor='intern' → null (intern как floor бессмысленно после удаления)
        const updUsr = await tx.user.updateMany({
          where: { gradeFloor: 'intern' },
          data: { gradeFloor: null },
        });
        console.log(
          `      assessments calc=${updAss1.count} eff=${updAss2.count} users floor cleared=${updUsr.count}`,
        );

        // Удалим SkillGate для intern (на всякий случай, обычно их нет)
        await tx.skillGate.deleteMany({ where: { gradeLevelId: intern.id } });
        await tx.gradeLevel.delete({ where: { id: intern.id } });
        console.log('      ✓ intern grade level removed');
      }

      // 2. Создаём premiddle если нет
      if (!hasPremiddle) {
        const xp: Record<string, number> = {};
        for (const bc of buildCodes) xp[bc] = TARGET_THRESHOLDS.premiddle;
        await tx.gradeLevel.create({
          data: {
            matrixVersionId: matrix.id,
            code: 'premiddle',
            name: TARGET_NAMES.premiddle,
            sortOrder: TARGET_SORT_ORDER.premiddle,
            xpThresholds: xp as unknown as Prisma.InputJsonValue,
          },
        });
        console.log('    ✓ premiddle grade level created');
      }

      // 3. Обновляем xpThresholds + sortOrder + name для всех 6 грейдов
      for (const code of Object.keys(TARGET_THRESHOLDS)) {
        const g = await tx.gradeLevel.findFirst({
          where: { matrixVersionId: matrix.id, code },
        });
        if (!g) continue;
        const xp: Record<string, number> = {};
        for (const bc of buildCodes) {
          xp[bc] = TARGET_THRESHOLDS[code as keyof typeof TARGET_THRESHOLDS];
        }
        await tx.gradeLevel.update({
          where: { id: g.id },
          data: {
            xpThresholds: xp as unknown as Prisma.InputJsonValue,
            name: TARGET_NAMES[code],
            sortOrder: TARGET_SORT_ORDER[code],
          },
        });
      }
      console.log('    ✓ thresholds + names + sortOrder updated');
    });
  }

  console.log('✅ grades migration done');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
