/**
 * Структурная миграция грейдов: одноразовые шаги, которые нельзя сделать
 * через UI.
 *   — удаляет старый «intern», переносит ссылки на «junior»
 *   — добавляет «premiddle» (Пре-мидл), если совсем не было
 *
 * Что НЕ делает: не переустанавливает xpThresholds / name / sortOrder
 * у существующих грейдов. Это намеренно — Pavel правит пороги через
 * /admin/grades, и любая «целевая» переустановка при деплое откатывала
 * бы его ручные правки.
 *
 * Полностью идемпотентный: после первого срабатывания intern уже нет,
 * premiddle уже есть — миграция становится no-op.
 *
 * Запускается из scripts/start.ts на каждом деплое.
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// Дефолтный порог для свежесозданного premiddle (если БД создаётся с нуля
// или поднимается старая, где этого грейда не было). Дальше Pavel правит
// через UI, и эти значения уже не трогаются.
const PREMIDDLE_DEFAULT_THRESHOLD = 105;

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

    if (!hasIntern && hasPremiddle) {
      console.log('    ✓ structural migration already done');
      continue;
    }

    await prisma.$transaction(async (tx) => {
      // 1. Если есть intern — переводим зависимые данные на junior, потом удаляем
      if (hasIntern) {
        const intern = byCode.get('intern')!;
        console.log(`    → migrating intern → junior in assessments / users…`);

        const updAss1 = await tx.assessment.updateMany({
          where: { calculatedGrade: 'intern' },
          data: { calculatedGrade: 'junior' },
        });
        const updAss2 = await tx.assessment.updateMany({
          where: { effectiveGrade: 'intern' },
          data: { effectiveGrade: 'junior' },
        });
        const updUsr = await tx.user.updateMany({
          where: { gradeFloor: 'intern' },
          data: { gradeFloor: null },
        });
        console.log(
          `      assessments calc=${updAss1.count} eff=${updAss2.count} users floor cleared=${updUsr.count}`,
        );

        await tx.skillGate.deleteMany({ where: { gradeLevelId: intern.id } });
        await tx.gradeLevel.delete({ where: { id: intern.id } });
        console.log('      ✓ intern grade level removed');
      }

      // 2. Создаём premiddle если нет
      if (!hasPremiddle) {
        const xp: Record<string, number> = {};
        for (const bc of buildCodes) xp[bc] = PREMIDDLE_DEFAULT_THRESHOLD;
        await tx.gradeLevel.create({
          data: {
            matrixVersionId: matrix.id,
            code: 'premiddle',
            name: 'Пре-мидл',
            sortOrder: 2,
            xpThresholds: xp as unknown as Prisma.InputJsonValue,
          },
        });
        console.log('    ✓ premiddle grade level created (default thresholds)');
      }
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
