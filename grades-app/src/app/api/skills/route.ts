export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

const PostSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).default(''),
    type: z.enum(['CORE', 'SEC']),
    maxMasteryLevel: z.number().int().min(1).max(10),
    /** Либо существующая группа… */
    groupId: z.number().int().positive().optional(),
    /** …либо создать новую внутри таксономии */
    newGroup: z
      .object({
        taxonomyId: z.number().int().positive(),
        name: z.string().min(1).max(100),
      })
      .optional(),
    /** map buildId → weight (0..100) */
    weights: z.record(z.string(), z.number().min(0).max(100)),
    /** Optional: mastery level titles, by level. If omitted → empty placeholders. */
    masteryTitles: z.array(z.string()).optional(),
  })
  .refine((d) => !!d.groupId !== !!d.newGroup, {
    message: 'Передай либо groupId, либо newGroup (но не оба)',
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

  const {
    name,
    description,
    type,
    maxMasteryLevel,
    groupId,
    newGroup,
    weights,
    masteryTitles,
  } = parsed.data;

  const skill = await prisma.$transaction(async (tx) => {
    // Resolve group: existing or just-created
    let resolvedGroupId: number;
    if (groupId) {
      const group = await tx.skillGroup.findUnique({ where: { id: groupId } });
      if (!group) throw new Error('Group not found');
      resolvedGroupId = groupId;
    } else if (newGroup) {
      const tax = await tx.skillTaxonomy.findUnique({
        where: { id: newGroup.taxonomyId },
      });
      if (!tax) throw new Error('Taxonomy not found');
      // Если такая группа в таксономии уже есть — переиспользуем
      const existing = await tx.skillGroup.findFirst({
        where: { taxonomyId: newGroup.taxonomyId, name: newGroup.name },
      });
      if (existing) {
        resolvedGroupId = existing.id;
      } else {
        // Берём наибольший sortOrder + 1
        const maxOrder = await tx.skillGroup.aggregate({
          where: { taxonomyId: newGroup.taxonomyId },
          _max: { sortOrder: true },
        });
        const created = await tx.skillGroup.create({
          data: {
            taxonomyId: newGroup.taxonomyId,
            name: newGroup.name,
            sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
          },
        });
        resolvedGroupId = created.id;
      }
    } else {
      throw new Error('No group');
    }

    const created = await tx.skill.create({
      data: {
        matrixVersionId: matrix.id,
        groupId: resolvedGroupId,
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
