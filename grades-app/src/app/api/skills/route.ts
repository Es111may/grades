export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

const PostSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  type: z.enum(['CORE', 'SEC']),
  maxMasteryLevel: z.number().int().min(1).max(10),
  groupId: z.number().int().positive(),
  /** map buildId → weight (0..100) */
  weights: z.record(z.string(), z.number().min(0).max(100)),
  /** Optional: mastery level titles, by level. If omitted → empty placeholders. */
  masteryTitles: z.array(z.string()).optional(),
});

/**
 * POST /api/skills — admin only.
 * Creates a skill in the current matrix version with weights for each build
 * and N mastery-level placeholders (level 1..maxMasteryLevel, blank text).
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const matrix = await prisma.matrixVersion.findFirst({ where: { isCurrent: true } });
  if (!matrix) {
    return NextResponse.json({ error: 'No active matrix' }, { status: 400 });
  }

  const { name, description, type, maxMasteryLevel, groupId, weights, masteryTitles } =
    parsed.data;

  // Verify group belongs to current matrix... actually SkillGroup is global
  // (no matrixVersionId on SkillGroup), so we just check it exists.
  const group = await prisma.skillGroup.findUnique({ where: { id: groupId } });
  if (!group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 400 });
  }

  const skill = await prisma.$transaction(async (tx) => {
    const created = await tx.skill.create({
      data: {
        matrixVersionId: matrix.id,
        groupId,
        name,
        description,
        type,
        maxMasteryLevel,
        active: true,
      },
    });

    // Weights
    for (const [buildIdStr, weight] of Object.entries(weights)) {
      const buildId = parseInt(buildIdStr, 10);
      if (isNaN(buildId)) continue;
      await tx.skillWeight.create({
        data: {
          matrixVersionId: matrix.id,
          skillId: created.id,
          buildId,
          weight,
        },
      });
    }

    // Mastery level placeholders
    for (let level = 1; level <= maxMasteryLevel; level++) {
      const title = masteryTitles?.[level - 1]?.trim() || `Уровень ${level}`;
      await tx.masteryLevel.create({
        data: {
          matrixVersionId: matrix.id,
          skillId: created.id,
          level,
          title,
          criteria: '',
        },
      });
    }

    return created;
  });

  return NextResponse.json({ ok: true, skill });
}
