export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { canEditMatrix } from '@/lib/permissions';

const PostSchema = z.object({
  buildId: z.number().int().positive(),
  skillId: z.number().int().positive(),
  requiredMastery: z.number().int().min(1).max(10),
});

/**
 * POST /api/grades/[id]/gates
 * Upsert gate by (gradeLevel, build, skill) — admin only.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getCurrentUser();
  if (!me || !canEditMatrix(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const gradeLevelId = parseInt(params.id, 10);
  if (isNaN(gradeLevelId)) {
    return NextResponse.json({ error: 'Invalid grade id' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const grade = await prisma.gradeLevel.findUnique({ where: { id: gradeLevelId } });
  if (!grade) return NextResponse.json({ error: 'Grade not found' }, { status: 404 });

  const { buildId, skillId, requiredMastery } = parsed.data;

  const gate = await prisma.skillGate.upsert({
    where: {
      matrixVersionId_gradeLevelId_buildId_skillId: {
        matrixVersionId: grade.matrixVersionId,
        gradeLevelId,
        buildId,
        skillId,
      },
    },
    create: {
      matrixVersionId: grade.matrixVersionId,
      gradeLevelId,
      buildId,
      skillId,
      requiredMastery,
    },
    update: { requiredMastery },
  });

  return NextResponse.json({ ok: true, gate });
}
