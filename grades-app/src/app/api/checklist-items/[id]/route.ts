/**
 * PATCH /api/checklist-items/[id] — изменить только `checked` у пункта.
 *
 * Отдельный endpoint специально для того, чтобы дать дизайнеру право
 * отмечать выполнение пунктов, которые ему поставил лид/стардиз, но
 * не дать менять при этом текст или структуру.
 *
 * Право проверяется как `canCheckItem` — это все, кто видит портрет
 * owner'а чек-листа.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { canCheckItem } from '@/lib/checklistPermissions';

const PatchSchema = z.object({
  checked: z.boolean(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getCurrentUser();
  if (!me?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const itemId = parseInt(params.id, 10);
  if (isNaN(itemId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const item = await prisma.checklistItem.findUnique({
    where: { id: itemId },
    include: {
      checklist: {
        select: {
          id: true,
          ownerId: true,
          createdById: true,
          createdByRole: true,
          owner: { select: { id: true, role: true, leadId: true, stardizId: true } },
        },
      },
    },
  });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (
    !canCheckItem(
      { id: me.id, role: me.role ?? '' },
      item.checklist,
      item.checklist.owner,
    )
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updated = await prisma.checklistItem.update({
    where: { id: itemId },
    data: { checked: parsed.data.checked },
  });

  return NextResponse.json({ item: updated });
}
