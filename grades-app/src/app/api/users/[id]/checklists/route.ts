/**
 * GET  /api/users/[id]/checklists  — список чек-листов owner'а с items.
 * POST /api/users/[id]/checklists  — создать чек-лист на портрете owner'а.
 *
 * Права — см. src/lib/checklistPermissions.ts.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import {
  canCreateChecklistFor,
  canViewChecklists,
} from '@/lib/checklistPermissions';
import { writeAudit, AUDIT_ACTIONS } from '@/lib/audit';

const CreateSchema = z.object({
  title: z.string().min(1).max(500),
  items: z
    .array(
      z.object({
        text: z.string().min(1).max(1000),
      }),
    )
    .max(50)
    .optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getCurrentUser();
  if (!me?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = parseInt(params.id, 10);
  if (isNaN(ownerId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, role: true, leadId: true, stardizId: true },
  });
  if (!owner) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!canViewChecklists({ id: me.id, role: me.role ?? '' }, owner)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Безопасно: если таблицы ещё нет (не докатился prisma db push на старте) —
  // возвращаем пустой массив, чтобы портрет не сломался.
  try {
    const checklists = await prisma.checklist.findMany({
      where: { ownerId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        createdBy: { select: { id: true, fullName: true } },
        items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    return NextResponse.json({ checklists });
  } catch (err) {
    console.error('[/api/users/[id]/checklists GET] failed:', err);
    return NextResponse.json({ checklists: [] });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getCurrentUser();
  if (!me?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = parseInt(params.id, 10);
  if (isNaN(ownerId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, role: true, leadId: true, stardizId: true },
  });
  if (!owner) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (
    !canCreateChecklistFor({ id: me.id, role: me.role ?? '' }, owner)
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // sortOrder нового чек-листа — последний.
  const maxSort = await prisma.checklist.findFirst({
    where: { ownerId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  const sortOrder = (maxSort?.sortOrder ?? -1) + 1;

  const created = await prisma.checklist.create({
    data: {
      ownerId,
      createdById: me.id,
      createdByRole: me.role ?? 'designer',
      title: parsed.data.title,
      sortOrder,
      items: parsed.data.items
        ? {
            create: parsed.data.items.map((it, i) => ({
              text: it.text,
              sortOrder: i,
            })),
          }
        : undefined,
    },
    include: {
      createdBy: { select: { id: true, fullName: true } },
      items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
    },
  });

  await writeAudit({
    actorId: me.id,
    action: AUDIT_ACTIONS.CHECKLIST_CREATED,
    targetType: 'checklist',
    targetId: created.id,
    extra: {
      ownerId,
      title: created.title,
      itemsCount: created.items.length,
    },
  });

  return NextResponse.json({ checklist: created }, { status: 201 });
}
