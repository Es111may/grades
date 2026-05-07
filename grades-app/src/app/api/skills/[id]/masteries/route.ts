export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

const PutSchema = z.object({
  levels: z.array(
    z.object({
      level: z.number().int().min(1).max(10),
      title: z.string().min(1).max(200),
      criteria: z.string().max(4000).default(''),
    }),
  ),
});

/**
 * PUT /api/skills/[id]/masteries — admin only.
 * Bulk-upsert mastery level rows for the skill. Levels not in the payload are
 * deleted (so user can shrink maxMasteryLevel by removing trailing levels).
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const skillId = parseInt(params.id, 10);
  if (isNaN(skillId)) {
    return NextResponse.json({ error: 'Invalid skill id' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const skill = await prisma.skill.findUnique({ where: { id: skillId } });
  if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 });

  const { levels } = parsed.data;
  const keepLevels = new Set(levels.map((l) => l.level));

  await prisma.$transaction(async (tx) => {
    // Удалить уровни, которых нет в payload
    await tx.masteryLevel.deleteMany({
      where: {
        skillId,
        level: { notIn: Array.from(keepLevels) },
      },
    });
    for (const l of levels) {
      await tx.masteryLevel.upsert({
        where: {
          matrixVersionId_skillId_level: {
            matrixVersionId: skill.matrixVersionId,
            skillId,
            level: l.level,
          },
        },
        create: {
          matrixVersionId: skill.matrixVersionId,
          skillId,
          level: l.level,
          title: l.title,
          criteria: l.criteria,
        },
        update: { title: l.title, criteria: l.criteria },
      });
    }

    // Если максимальный level в payload < skill.maxMasteryLevel, обновить
    const maxLevel = Math.max(...levels.map((l) => l.level));
    if (maxLevel !== skill.maxMasteryLevel) {
      await tx.skill.update({
        where: { id: skillId },
        data: { maxMasteryLevel: maxLevel },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
