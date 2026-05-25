/**
 * PATCH  /api/checklists/[id] — обновить структуру (title и/или items).
 * DELETE /api/checklists/[id] — удалить чек-лист.
 *
 * Права структурного редактирования — `canEditChecklist`. Это автор +
 * любая роль строго старше `createdByRole`. См. checklistPermissions.ts.
 *
 * PATCH принимает:
 *   - title?: string — переименование
 *   - items?: Array<{ id?: number, text: string, checked?: boolean }>
 *       заменяет items целиком. id есть — апдейт; id нет — создание;
 *       items без id, которых нет в массиве, удаляются (это «синхронизация
 *       состояния» из UI).
 *
 * Атомарность — через prisma.$transaction.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { canEditChecklist } from '@/lib/checklistPermissions';
import { writeAudit, AUDIT_ACTIONS } from '@/lib/audit';

const PatchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  items: z
    .array(
      z.object({
        id: z.number().int().optional(),
        text: z.string().min(1).max(1000),
        checked: z.boolean().optional(),
      }),
    )
    .max(100)
    .optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getCurrentUser();
  if (!me?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const checklistId = parseInt(params.id, 10);
  if (isNaN(checklistId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const checklist = await prisma.checklist.findUnique({
    where: { id: checklistId },
    select: { id: true, ownerId: true, createdById: true, createdByRole: true },
  });
  if (!checklist) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!canEditChecklist({ id: me.id, role: me.role ?? '' }, checklist)) {
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
  const { title, items } = parsed.data;

  await prisma.$transaction(async (tx) => {
    if (title !== undefined) {
      await tx.checklist.update({
        where: { id: checklistId },
        data: { title },
      });
    }

    if (items !== undefined) {
      // Удаляем то, чего нет в новом списке.
      const keepIds = items.map((i) => i.id).filter((id): id is number => !!id);
      await tx.checklistItem.deleteMany({
        where: { checklistId, id: { notIn: keepIds.length > 0 ? keepIds : [-1] } },
      });

      // Апдейтим существующие, создаём новые. Параллельно обновляем sortOrder.
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.id) {
          await tx.checklistItem.update({
            where: { id: it.id },
            data: {
              text: it.text,
              sortOrder: i,
              ...(it.checked !== undefined ? { checked: it.checked } : {}),
            },
          });
        } else {
          await tx.checklistItem.create({
            data: {
              checklistId,
              text: it.text,
              sortOrder: i,
              checked: it.checked ?? false,
            },
          });
        }
      }
    }
  });

  const fresh = await prisma.checklist.findUnique({
    where: { id: checklistId },
    include: {
      createdBy: { select: { id: true, fullName: true } },
      items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
    },
  });

  await writeAudit({
    actorId: me.id,
    action: AUDIT_ACTIONS.CHECKLIST_UPDATED,
    targetType: 'checklist',
    targetId: checklistId,
    extra: {
      ownerId: checklist.ownerId,
      // Не пишем полный set items — много шума. Только список полей-изменений.
      changedFields: [
        ...(title !== undefined ? ['title'] : []),
        ...(items !== undefined ? ['items'] : []),
      ],
    },
  });

  return NextResponse.json({ checklist: fresh });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getCurrentUser();
  if (!me?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const checklistId = parseInt(params.id, 10);
  if (isNaN(checklistId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const checklist = await prisma.checklist.findUnique({
    where: { id: checklistId },
    select: { id: true, ownerId: true, createdById: true, createdByRole: true },
  });
  if (!checklist) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!canEditChecklist({ id: me.id, role: me.role ?? '' }, checklist)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Сохраняем title до удаления — для аудита.
  const full = await prisma.checklist.findUnique({
    where: { id: checklistId },
    select: { id: true, ownerId: true, title: true },
  });
  await prisma.checklist.delete({ where: { id: checklistId } });

  if (full) {
    await writeAudit({
      actorId: me.id,
      action: AUDIT_ACTIONS.CHECKLIST_DELETED,
      targetType: 'checklist',
      targetId: checklistId,
      extra: { ownerId: full.ownerId, title: full.title },
    });
  }

  return NextResponse.json({ ok: true });
}
