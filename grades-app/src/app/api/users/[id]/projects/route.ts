export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

/**
 * GET /api/users/[id]/projects — список проектов пользователя.
 * Любой залогиненный (admin/lead/stardiz/designer) — список открыт.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = parseInt(params.id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const rows = await prisma.userProject.findMany({
    where: { userId },
    include: {
      project: { select: { id: true, name: true, category: true } },
    },
    orderBy: [
      { project: { category: 'asc' } },
      { project: { sortOrder: 'asc' } },
      { project: { name: 'asc' } },
    ],
  });

  return NextResponse.json({
    projects: rows.map((r) => r.project),
  });
}

const putSchema = z.object({
  projectIds: z.array(z.number().int().positive()),
});

/**
 * PUT /api/users/[id]/projects — заменить набор проектов пользователя.
 * Body: { projectIds: number[] }.
 *
 * Право редактирования:
 *   - сам пользователь (всегда)
 *   - admin (всегда)
 *
 * Лиды/стардизы не правят чужие списки — каждый ведёт свои сам.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getCurrentUser();
  if (!me || !me.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = parseInt(params.id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const isSelf = userId === me.id;
  const isAdmin = me.role === 'admin';
  if (!isSelf && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Атомарно заменяем набор UserProject: убираем всё лишнее, добавляем
  // новое. createMany с skipDuplicates, чтобы повторные клики были
  // идемпотентны.
  await prisma.$transaction(async (tx) => {
    await tx.userProject.deleteMany({
      where: {
        userId,
        ...(parsed.data.projectIds.length > 0 && {
          projectId: { notIn: parsed.data.projectIds },
        }),
      },
    });
    if (parsed.data.projectIds.length > 0) {
      await tx.userProject.createMany({
        data: parsed.data.projectIds.map((projectId) => ({
          userId,
          projectId,
        })),
        skipDuplicates: true,
      });
    }
  });

  return NextResponse.json({ ok: true });
}
