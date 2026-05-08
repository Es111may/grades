export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { canEditMatrix } from '@/lib/permissions';

const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  type: z.enum(['CORE', 'SEC']).optional(),
  rationale: z.string().max(2000).nullable().optional(),
  replaceableNote: z.string().max(500).nullable().optional(),
  maxMasteryLevel: z.number().int().min(1).max(10).optional(),
  active: z.boolean().optional(),
  /** Map buildId -> weight (0..N). Если ключ передан — апсертит. */
  weights: z.record(z.string(), z.number().min(0).max(100)).optional(),
});

/** PATCH /api/skills/[id] — admin edit */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me || !canEditMatrix(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const skillId = parseInt(params.id, 10);
  if (isNaN(skillId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { weights, active, ...skillFields } = parsed.data;

  // Need matrixVersionId for SkillWeight upsert (composite unique key includes it)
  const skill = await prisma.skill.findUnique({ where: { id: skillId } });
  if (!skill) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const matrixVersionId = skill.matrixVersionId;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(skillFields).length > 0 || active !== undefined) {
      await tx.skill.update({
        where: { id: skillId },
        data: {
          ...skillFields,
          ...(active !== undefined
            ? { active, archivedAt: active ? null : new Date() }
            : {}),
        },
      });
    }

    if (weights) {
      for (const [buildIdStr, weight] of Object.entries(weights)) {
        const buildId = parseInt(buildIdStr, 10);
        if (isNaN(buildId)) continue;
        await tx.skillWeight.upsert({
          where: {
            matrixVersionId_skillId_buildId: { matrixVersionId, skillId, buildId },
          },
          create: { matrixVersionId, skillId, buildId, weight },
          update: { weight },
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
