export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

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

/**
 * POST /api/admin/migrate-grades — admin-only, idempotent.
 * Запускает миграцию структуры грейдов вручную, если автозапуск из start.ts
 * не отработал. Возвращает подробный лог изменений.
 */
export async function POST() {
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const log: string[] = [];
  const matrices = await prisma.matrixVersion.findMany();
  if (matrices.length === 0) {
    return NextResponse.json({ ok: true, log: ['no matrices'] });
  }

  const builds = await prisma.build.findMany();
  const buildCodes = builds.map((b) => b.code);

  for (const matrix of matrices) {
    log.push(`matrix #${matrix.number}`);
    const grades = await prisma.gradeLevel.findMany({
      where: { matrixVersionId: matrix.id },
    });
    const byCode = new Map(grades.map((g) => [g.code, g]));
    const hasIntern = byCode.has('intern');
    const hasPremiddle = byCode.has('premiddle');

    await prisma.$transaction(async (tx) => {
      if (hasIntern) {
        const intern = byCode.get('intern')!;
        const upd1 = await tx.assessment.updateMany({
          where: { calculatedGrade: 'intern' },
          data: { calculatedGrade: 'junior' },
        });
        const upd2 = await tx.assessment.updateMany({
          where: { effectiveGrade: 'intern' },
          data: { effectiveGrade: 'junior' },
        });
        const upd3 = await tx.user.updateMany({
          where: { gradeFloor: 'intern' },
          data: { gradeFloor: null },
        });
        log.push(
          `  remapped intern: assessments calc=${upd1.count} eff=${upd2.count} users floor=${upd3.count}`,
        );
        await tx.skillGate.deleteMany({ where: { gradeLevelId: intern.id } });
        await tx.gradeLevel.delete({ where: { id: intern.id } });
        log.push('  deleted intern grade level');
      }

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
        log.push('  created premiddle grade level');
      }

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
      log.push('  updated thresholds + names + sortOrder for all grades');
    });
  }

  return NextResponse.json({ ok: true, log });
}
