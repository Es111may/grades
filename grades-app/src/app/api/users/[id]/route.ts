export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { z } from 'zod';
import { canAssignAdminRole, canManageUsers } from '@/lib/permissions';

const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'lead', 'stardiz', 'designer']).optional(),
  buildId: z.number().nullable().optional(),
  department: z.string().nullable().optional(),
  leadId: z.number().nullable().optional(),
  stardizId: z.number().nullable().optional(),
  hiredAt: z.string().nullable().optional(),
  active: z.boolean().optional(),
  gradeFloor: z.string().nullable().optional(),
  gradeFloorReason: z.string().nullable().optional(),
  avatarUrl: z.string().max(300_000).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me || !canManageUsers(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = parseInt(params.id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await req.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Только admin может назначать или снимать роль admin
  const settingAdmin = data.role === 'admin' && existing.role !== 'admin';
  const removingAdmin =
    data.role !== undefined && data.role !== 'admin' && existing.role === 'admin';
  if ((settingAdmin || removingAdmin) && !canAssignAdminRole(me.role)) {
    return NextResponse.json(
      { error: 'Только админ может менять роль admin' },
      { status: 403 },
    );
  }

  // Audit grade_floor changes
  const floorChanged =
    data.gradeFloor !== undefined && data.gradeFloor !== existing.gradeFloor;
  const floorLowered = floorChanged && isFloorLowered(existing.gradeFloor, data.gradeFloor);
  const floorRemoved = floorChanged && existing.gradeFloor && !data.gradeFloor;

  if (floorLowered || floorRemoved) {
    await prisma.auditLog.create({
      data: {
        actorId: me.id!,
        action: floorRemoved ? 'grade_floor_removed' : 'grade_floor_lowered',
        targetType: 'user',
        targetId: userId,
        details: {
          before: existing.gradeFloor,
          after: data.gradeFloor ?? null,
          reason: data.gradeFloorReason ?? existing.gradeFloorReason ?? '',
        },
      },
    });
  } else if (floorChanged) {
    await prisma.auditLog.create({
      data: {
        actorId: me.id!,
        action: 'grade_floor_changed',
        targetType: 'user',
        targetId: userId,
        details: {
          before: existing.gradeFloor,
          after: data.gradeFloor,
          reason: data.gradeFloorReason ?? '',
        },
      },
    });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.fullName !== undefined && { fullName: data.fullName }),
      ...(data.email !== undefined && { email: data.email.toLowerCase() }),
      ...(data.role !== undefined && { role: data.role }),
      ...(data.buildId !== undefined && { buildId: data.buildId }),
      ...(data.department !== undefined && { department: data.department }),
      ...(data.leadId !== undefined && { leadId: data.leadId }),
      ...(data.stardizId !== undefined && { stardizId: data.stardizId }),
      ...(data.hiredAt !== undefined && {
        hiredAt: data.hiredAt ? new Date(data.hiredAt) : null,
      }),
      ...(data.active !== undefined && { active: data.active }),
      ...(data.gradeFloor !== undefined && { gradeFloor: data.gradeFloor }),
      ...(data.gradeFloorReason !== undefined && {
        gradeFloorReason: data.gradeFloorReason,
      }),
      ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
    },
    include: {
      build: true,
      lead: { select: { id: true, fullName: true } },
      stardiz: { select: { id: true, fullName: true } },
    },
  });

  return NextResponse.json(user);
}

/**
 * DELETE /api/users/[id]
 *   ?hard=true — навсегда (только admin, и только если нет FK-зависимостей).
 *   иначе       — soft-delete (active=false).
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me || !canManageUsers(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = parseInt(params.id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  if (userId === me.id) {
    return NextResponse.json({ error: 'Нельзя удалить себя' }, { status: 400 });
  }

  const url = new URL(req.url);
  const hard = url.searchParams.get('hard') === 'true';

  if (hard) {
    if (!canAssignAdminRole(me.role)) {
      return NextResponse.json(
        { error: 'Удалить навсегда может только админ' },
        { status: 403 },
      );
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const reassignToParam = url.searchParams.get('reassignTo');
    const reassignTo = reassignToParam ? parseInt(reassignToParam, 10) : null;

    const isDesigner = target.role === 'designer';
    const isLeadOrStardiz = target.role === 'lead' || target.role === 'stardiz';

    try {
      await prisma.$transaction(async (tx) => {
        // Сохраняем email перед удалением, чтобы внести его в ExcludedEmail
        // — иначе scripts/import-team.ts пересоздаст пользователя на
        // следующем деплое из CSV.
        const emailToBlock = target.email;

        if (isDesigner) {
          // Дизайнер: каскадно убираем всё, что на него завязано.
          // DesignerNote и TeamMatrixCell.userId уже Cascade в схеме —
          // сработают автоматически. AssessmentScore/History тоже Cascade
          // по Assessment. Остаётся Assessment.designer и Assessment.lead.
          await tx.assessment.deleteMany({ where: { designerId: userId } });
          // Если был автором заметок (designer обычно не пишет, но мало ли) —
          // заметки нужно убрать, иначе FK блокнёт удаление.
          await tx.designerNote.deleteMany({ where: { authorId: userId } });
          // Phase 17: чек-листы, которые дизайнер создал себе. Поле
          // `Checklist.createdById` без cascade — нужно явно почистить,
          // иначе FK блокнёт удаление пользователя. Owner-чек-листы уйдут
          // каскадом по ChecklistOwner (схема).
          await tx.checklist.deleteMany({ where: { createdById: userId } });
        } else if (isLeadOrStardiz) {
          if (!reassignTo) {
            throw new Error('NEEDS_REASSIGN');
          }
          if (reassignTo === userId) {
            throw new Error('REASSIGN_SELF');
          }
          // Стардиз сам грейдируется как дизайнер — удаляем его собственные
          // оценки (assessmentsAsDesigner). Для лида тоже — мало ли он
          // когда-то был дизайнером и имеет старые оценки на себя.
          await tx.assessment.deleteMany({ where: { designerId: userId } });
          // Переносим всё, что у лида/стардиза «как у автора».
          await tx.user.updateMany({
            where: { leadId: userId },
            data: { leadId: reassignTo },
          });
          await tx.user.updateMany({
            where: { stardizId: userId },
            data: { stardizId: reassignTo },
          });
          await tx.assessment.updateMany({
            where: { leadId: userId },
            data: { leadId: reassignTo },
          });
          await tx.designerNote.updateMany({
            where: { authorId: userId },
            data: { authorId: reassignTo },
          });
          await tx.auditLog.updateMany({
            where: { actorId: userId },
            data: { actorId: reassignTo },
          });
          await tx.teamMatrixCell.updateMany({
            where: { updatedById: userId },
            data: { updatedById: reassignTo },
          });
          await tx.matrixVersion.updateMany({
            where: { createdBy: userId },
            data: { createdBy: reassignTo },
          });
          // Phase 17/19/24 — три FK с createdById, у которых onDelete не
          // cascade. Если лид/стардиз что-то создавал — без явного reassign
          // FK блокнул бы delete user. Поэтому переносим авторство:
          //   - Checklist.createdById  (ИПР, который он ставил подопечным)
          //   - Project.createdById    (если он создал проект через UI)
          //   - LeadReview.createdById (impose: только admin, но на всякий)
          // Сам owner-чек-листов уходит каскадом по ChecklistOwner — это
          // нормально, ИПР про удалённого человека больше не нужен.
          await tx.checklist.updateMany({
            where: { createdById: userId },
            data: { createdById: reassignTo },
          });
          await tx.project.updateMany({
            where: { createdById: userId },
            data: { createdById: reassignTo },
          });
          await tx.leadReview.updateMany({
            where: { createdById: userId },
            data: { createdById: reassignTo },
          });
        }
        await tx.user.delete({ where: { id: userId } });
        // Заносим email в чёрный список, чтобы автоимпорт его не вернул.
        await tx.excludedEmail.upsert({
          where: { email: emailToBlock },
          update: {},
          create: { email: emailToBlock, reason: 'hard_delete_by_admin' },
        });
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('NEEDS_REASSIGN')) {
        return NextResponse.json(
          {
            error: 'reassign_required',
            message:
              'Для удаления лида или стардиза нужно перенести его подопечных, оценки и заметки на другого.',
          },
          { status: 409 },
        );
      }
      if (msg.includes('REASSIGN_SELF')) {
        return NextResponse.json(
          { error: 'Нельзя переназначить на самого себя' },
          { status: 400 },
        );
      }
      console.error('Hard-delete failed:', msg);
      return NextResponse.json(
        {
          error:
            'Не получилось удалить навсегда. Сообщи Pavel — нужны зависимые правки.',
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, hard: true });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { active: false },
  });

  return NextResponse.json({ ok: true });
}

const GRADE_ORDER = ['junior', 'junior_plus', 'premiddle', 'middle', 'middle_plus', 'senior'];

function isFloorLowered(before: string | null, after: string | null | undefined): boolean {
  if (!before || !after) return false;
  const beforeIdx = GRADE_ORDER.indexOf(before);
  const afterIdx = GRADE_ORDER.indexOf(after);
  if (beforeIdx === -1 || afterIdx === -1) return false;
  return afterIdx < beforeIdx;
}
