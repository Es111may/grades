export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { forgetSessionUser } from '@/lib/auth';
import { z } from 'zod';
import {
  canAssignAdminRole,
  canChangeLead,
  canDeactivateUser,
  canEditOwnProfile,
  canEditUser,
  canManageUsers,
} from '@/lib/permissions';
import { canSetGradingDate } from '@/lib/gradingPlan';
import { canSetEmploymentType, nonGradingBuildNote } from '@/lib/employment';
import { DISMISSAL_TYPES, canEditDismissal } from '@/lib/dismissal';
import { userForViewer } from '@/lib/userResponse';
import { parseAvatarInput } from '@/lib/avatarShared';
import { AUDIT_ACTIONS } from '@/lib/audit';
import {
  canHaveGradingDate,
  gradingDateChange,
  mentorError,
  needsDismissalDate,
  selfEditLockedFields,
  todayMoscowDate,
} from '@/lib/userUpdate';

/** Связи в ответе PATCH/DELETE — те же, что в строке списка. */
const USER_RESPONSE_INCLUDE = {
  build: true,
  lead: { select: { id: true, fullName: true } },
  stardiz: { select: { id: true, fullName: true } },
  nextGradingSetBy: { select: { id: true, fullName: true } },
} as const;

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
  // data URL новой картинки или null — удалить. Прочие строки (ссылка
  // /api/avatar из строки списка) не сохраняем — см. parseAvatarInput.
  avatarUrl: z.string().nullable().optional(),
  // Phase 23.2 — дата ближайшего грейдирования. Права на неё свои (см. ниже):
  // стардиз тоже ставит дату своим, но карточку править не может — для него
  // отдельный PUT /api/users/[id]/grading-date.
  nextGradingAt: z.string().nullable().optional(),
  // Phase 23.4 — почасовщик: не грейдируется, не входит в таланты.
  employmentType: z.enum(['staff', 'hourly']).optional(),
  // Phase 23.4 — увольнение: дата, тип, причина. Ставит только админ.
  dismissedAt: z.string().nullable().optional(),
  dismissalType: z.enum(DISMISSAL_TYPES).nullable().optional(),
  dismissalReason: z.string().trim().max(300).nullable().optional(),
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

  const body = await req.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // ── Права и проверки. Все — до любых записей: отказ не должен оставлять
  // следов в журнале. Сравниваем с текущими значениями, а не с присутствием
  // поля: модалка шлёт карточку целиком, и неизменённые поля права не требуют.
  const viewer = { id: me.id, role: me.role };
  const isAdmin = me.role === 'admin';

  // Лид правит только своих дизайнеров и стардизов (решение Pavel). Свою
  // карточку — только имя и аватар: остальное в ней меняет админ.
  const canEdit = canEditUser(viewer, existing);
  const selfEdit = !canEdit && canEditOwnProfile(viewer, existing);
  if (!canEdit && !selfEdit) {
    return NextResponse.json(
      { error: 'Править можно только своих дизайнеров и стардизов' },
      { status: 403 },
    );
  }
  if (selfEdit && selfEditLockedFields(input, existing).length > 0) {
    return NextResponse.json(
      { error: 'У себя можно поменять только имя и аватар — остальное меняет админ' },
      { status: 403 },
    );
  }
  // При правке себя дальше идут только имя и аватар: остальные поля совпали
  // с текущими, и переписывать их (даже тем же значением) незачем.
  const data: typeof input = selfEdit
    ? { fullName: input.fullName, avatarUrl: input.avatarUrl }
    : input;

  const avatar = parseAvatarInput(data.avatarUrl);
  if (avatar.kind === 'error') {
    return NextResponse.json({ error: avatar.error }, { status: 400 });
  }

  const roleChanged = data.role !== undefined && data.role !== existing.role;
  if (roleChanged && !isAdmin) {
    return NextResponse.json({ error: 'Роль может менять только админ' }, { status: 403 });
  }
  const role = data.role ?? existing.role;

  const email = data.email?.toLowerCase();
  const emailChanged = email !== undefined && email !== existing.email;
  if (emailChanged && !isAdmin) {
    return NextResponse.json({ error: 'Email может менять только админ' }, { status: 403 });
  }

  // Лид: только передать своего человека другому лиду. Перекладывать между
  // чужими командами и снимать лида — админ.
  const leadChanged = data.leadId !== undefined && data.leadId !== existing.leadId;
  if (leadChanged && !canChangeLead(viewer, existing, data.leadId ?? null)) {
    return NextResponse.json(
      { error: 'Лид может только передать своего человека другому лиду' },
      { status: 403 },
    );
  }
  if (leadChanged && data.leadId != null) {
    const err = mentorError('lead', await findMentor(data.leadId), userId);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  // Стардиза лид ставит своим людям — это уже покрыто canEditUser.
  const stardizChanged = data.stardizId !== undefined && data.stardizId !== existing.stardizId;
  if (stardizChanged && data.stardizId != null) {
    const err = mentorError('stardiz', await findMentor(data.stardizId), userId);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  const activeChanged = data.active !== undefined && data.active !== existing.active;
  if (activeChanged && !canDeactivateUser(viewer, existing)) {
    return NextResponse.json(
      {
        error:
          userId === me.id
            ? 'Нельзя деактивировать себя'
            : 'Деактивировать можно только своих дизайнеров и стардизов',
      },
      { status: 403 },
    );
  }

  const hiredAt =
    data.hiredAt === undefined ? undefined : data.hiredAt ? new Date(data.hiredAt) : null;
  if (hiredAt && Number.isNaN(hiredAt.getTime())) {
    return NextResponse.json({ error: 'Некорректная дата найма' }, { status: 400 });
  }

  // Увольнение: тип и причина — чувствительные, поэтому 403 уже на само
  // присутствие полей, а не только на реальную смену. Модалка лида их не шлёт.
  const dismissalProvided =
    data.dismissedAt !== undefined ||
    data.dismissalType !== undefined ||
    data.dismissalReason !== undefined;
  if (dismissalProvided && !canEditDismissal(me)) {
    return NextResponse.json(
      { error: 'Данные об увольнении может менять только админ' },
      { status: 403 },
    );
  }
  const dismissedAtInput = data.dismissedAt ? new Date(data.dismissedAt) : null;
  if (dismissedAtInput && Number.isNaN(dismissedAtInput.getTime())) {
    return NextResponse.json({ error: 'Некорректная дата увольнения' }, { status: 400 });
  }

  // Формат занятости: почасовщик — только дизайнер. При любой другой итоговой
  // роли формат — штат: стардиз из почасовщиков перестаёт быть почасовщиком.
  if (role !== 'designer' && data.employmentType === 'hourly') {
    return NextResponse.json(
      { error: 'Почасовщиком может быть только дизайнер' },
      { status: 400 },
    );
  }
  const employmentType =
    role === 'designer' ? data.employmentType ?? existing.employmentType : 'staff';
  const employmentChanged = employmentType !== existing.employmentType;
  // Права — только на явную смену у дизайнера: сброс в штат при смене роли
  // идёт вместе со сменой роли, а её уже проверили (только админ).
  if (
    employmentChanged &&
    role === 'designer' &&
    !canSetEmploymentType(viewer, { role, leadId: existing.leadId })
  ) {
    return NextResponse.json(
      { error: 'Сделать почасовщиком может админ или лид этого дизайнера' },
      { status: 403 },
    );
  }

  // Дата грейдирования: своя область прав — админ всем, лид/стардиз своим.
  // Сравнение по дню — в gradingDateChange (lib/userUpdate).
  let grading: { changed: false } | { changed: true; nextGradingAt: Date | null } = {
    changed: false,
  };
  if (data.nextGradingAt !== undefined) {
    const r = gradingDateChange(existing.nextGradingAt, data.nextGradingAt);
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
    grading = r;
  }
  if (grading.changed && !canSetGradingDate(viewer, existing)) {
    return NextResponse.json(
      { error: 'Дату грейдирования можно ставить только своим подопечным' },
      { status: 403 },
    );
  }
  if (grading.changed && grading.nextGradingAt) {
    // Билд — итоговый, после правки: у билда без грейдов даты не бывает
    const buildId = data.buildId !== undefined ? data.buildId : existing.buildId;
    const build = buildId
      ? await prisma.build.findUnique({ where: { id: buildId }, select: { code: true } })
      : null;
    const target = { role, employmentType, build };
    if (!canHaveGradingDate(target)) {
      return NextResponse.json(
        {
          error:
            nonGradingBuildNote(target) ??
            'Дату грейдирования ставят только штатным дизайнерам и стардизам',
        },
        { status: 400 },
      );
    }
  }

  // Пустая причина — то же, что её нет
  const dismissalReason =
    data.dismissalReason === undefined ? undefined : data.dismissalReason || null;
  let dismissedAt = data.dismissedAt !== undefined ? dismissedAtInput : existing.dismissedAt;
  // Деактивация сама ставит дату увольнения, если её нет или она осталась
  // от прошлого трудоустройства (раньше найма) — решение Pavel.
  const autoDismissal =
    activeChanged &&
    data.active === false &&
    needsDismissalDate({
      dismissedAt,
      hiredAt: hiredAt !== undefined ? hiredAt : existing.hiredAt,
    });
  if (autoDismissal) dismissedAt = todayMoscowDate();
  const dismissalDateChanged = dayKey(existing.dismissedAt) !== dayKey(dismissedAt);
  const dismissalTypeChanged =
    data.dismissalType !== undefined && data.dismissalType !== existing.dismissalType;
  const dismissalReasonChanged =
    dismissalReason !== undefined && dismissalReason !== existing.dismissalReason;

  const floorChanged =
    data.gradeFloor !== undefined && data.gradeFloor !== existing.gradeFloor;
  const floorLowered = floorChanged && isFloorLowered(existing.gradeFloor, data.gradeFloor);
  const floorRemoved = floorChanged && existing.gradeFloor && !data.gradeFloor;

  // ── Журнал. Собираем заранее, пишем в одной транзакции с правкой: упавший
  // update не оставит записей. Денег здесь нет — только id и значения полей.
  const audits: Array<{ action: string; details: Prisma.InputJsonValue }> = [];
  if (roleChanged) {
    audits.push({
      action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
      details: { before: existing.role, after: role },
    });
  }
  if (emailChanged) {
    audits.push({
      action: AUDIT_ACTIONS.USER_EMAIL_CHANGED,
      details: { before: existing.email, after: email },
    });
  }
  if (leadChanged) {
    audits.push({
      action: AUDIT_ACTIONS.USER_LEAD_CHANGED,
      details: { before: existing.leadId, after: data.leadId ?? null },
    });
  }
  if (stardizChanged) {
    audits.push({
      action: AUDIT_ACTIONS.USER_STARDIZ_CHANGED,
      details: { before: existing.stardizId, after: data.stardizId ?? null },
    });
  }
  if (activeChanged) {
    audits.push({
      action: data.active ? AUDIT_ACTIONS.USER_ACTIVATED : AUDIT_ACTIONS.USER_DEACTIVATED,
      details: { before: existing.active, after: data.active! },
    });
  }
  if (grading.changed) {
    audits.push({
      action: grading.nextGradingAt
        ? AUDIT_ACTIONS.GRADING_DATE_SET
        : AUDIT_ACTIONS.GRADING_DATE_CLEARED,
      details: {
        before: existing.nextGradingAt?.toISOString() ?? null,
        after: grading.nextGradingAt?.toISOString() ?? null,
      },
    });
  }
  if (employmentChanged) {
    audits.push({
      action: AUDIT_ACTIONS.EMPLOYMENT_TYPE_CHANGED,
      details: { before: existing.employmentType, after: employmentType },
    });
  }
  if (dismissalDateChanged || dismissalTypeChanged || dismissalReasonChanged) {
    // «Действия» видит и лид, поэтому тип и причину в лог не пишем — только
    // дату и признаки, что они менялись.
    audits.push({
      action: AUDIT_ACTIONS.DISMISSAL_UPDATED,
      details: {
        before: dayKey(existing.dismissedAt),
        after: dayKey(dismissedAt),
        typeChanged: dismissalTypeChanged,
        reasonChanged: dismissalReasonChanged,
        ...(autoDismissal && { auto: true }),
      },
    });
  }
  if (floorLowered || floorRemoved) {
    audits.push({
      action: floorRemoved ? 'grade_floor_removed' : 'grade_floor_lowered',
      details: {
        before: existing.gradeFloor,
        after: data.gradeFloor ?? null,
        reason: data.gradeFloorReason ?? existing.gradeFloorReason ?? '',
      },
    });
  } else if (floorChanged) {
    audits.push({
      action: 'grade_floor_changed',
      details: {
        before: existing.gradeFloor,
        after: data.gradeFloor ?? null,
        reason: data.gradeFloorReason ?? '',
      },
    });
  }

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          ...(data.fullName !== undefined && { fullName: data.fullName }),
          ...(emailChanged && { email }),
          ...(roleChanged && { role }),
          // buildId сохраняем как пришёл — и у стардиза тоже: он грейдируется
          // по билду, как дизайнер.
          ...(data.buildId !== undefined && { buildId: data.buildId }),
          ...(data.department !== undefined && { department: data.department }),
          ...(leadChanged && { leadId: data.leadId ?? null }),
          ...(stardizChanged && { stardizId: data.stardizId ?? null }),
          ...(hiredAt !== undefined && { hiredAt }),
          ...(activeChanged && { active: data.active }),
          // Отметку «кто и когда поставил» пишем только при реальной смене даты —
          // от неё зависит определение «проведено» (см. lib/gradingPlan).
          ...(grading.changed && {
            nextGradingAt: grading.nextGradingAt,
            nextGradingSetById: grading.nextGradingAt ? me.id : null,
            nextGradingSetAt: grading.nextGradingAt ? new Date() : null,
          }),
          ...(employmentChanged && { employmentType }),
          ...(dismissalDateChanged && { dismissedAt }),
          ...(dismissalTypeChanged && { dismissalType: data.dismissalType }),
          ...(dismissalReasonChanged && { dismissalReason }),
          ...(data.gradeFloor !== undefined && { gradeFloor: data.gradeFloor }),
          ...(data.gradeFloorReason !== undefined && {
            gradeFloorReason: data.gradeFloorReason,
          }),
          ...(avatar.kind === 'set' && { avatarUrl: avatar.value }),
        },
        include: USER_RESPONSE_INCLUDE,
      });
      if (audits.length > 0) {
        await tx.auditLog.createMany({
          data: audits.map((a) => ({
            actorId: me.id,
            action: a.action,
            targetType: 'user',
            targetId: userId,
            details: a.details,
          })),
        });
      }
      return updated;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Этот email уже занят' }, { status: 409 });
    }
    throw e;
  }
  // Новая роль или деактивация — не ждать, пока истечёт кеш сессий (lib/auth).
  if (roleChanged || activeChanged) forgetSessionUser(userId);

  // Ответ сливается в строку списка на клиенте — отдаём только то, что
  // этому зрителю можно видеть (увольнение, плановый пересмотр, без хэша).
  return NextResponse.json(userForViewer(user, viewer));
}

/** Кандидат в лиды/стардизы — для mentorError. */
function findMentor(id: number) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, active: true },
  });
}

/** YYYY-MM-DD по UTC или null — сравнение дат по дню. */
function dayKey(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/**
 * DELETE /api/users/[id]
 *   ?hard=true — навсегда (только admin, и только если нет FK-зависимостей).
 *   иначе       — soft-delete (active=false) по canDeactivateUser: лид —
 *                 только своих дизайнеров и стардизов. Заодно ставится дата
 *                 увольнения, если её нет (см. needsDismissalDate).
 *                 Ответ: { ok, user } — строка через userForViewer, чтобы
 *                 клиент увидел поставленную сервером дату; dismissedAt
 *                 дублируем на верхнем уровне для старого клиента
 *                 (UserCard360 читает его оттуда).
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
    forgetSessionUser(userId);
    return NextResponse.json({ ok: true, hard: true });
  }

  // Деактивация: лид — только своих дизайнеров и стардизов, админ — любого.
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, leadId: true, active: true, hiredAt: true, dismissedAt: true },
  });
  if (!target) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const viewer = { id: me.id, role: me.role };
  if (!canDeactivateUser(viewer, target)) {
    return NextResponse.json(
      { error: 'Деактивировать можно только своих дизайнеров и стардизов' },
      { status: 403 },
    );
  }
  if (!target.active) {
    const current = await prisma.user.findUnique({
      where: { id: userId },
      include: USER_RESPONSE_INCLUDE,
    });
    return deactivatedResponse(current, viewer);
  }

  // Деактивация сама ставит дату увольнения — сегодня по Москве, если даты
  // нет или она осталась от прошлого трудоустройства (раньше найма).
  const autoDismissal = needsDismissalDate(target);
  const dismissedAt = autoDismissal ? todayMoscowDate() : target.dismissedAt;

  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { active: false, ...(autoDismissal && { dismissedAt }) },
      include: USER_RESPONSE_INCLUDE,
    }),
    prisma.auditLog.create({
      data: {
        actorId: me.id,
        action: AUDIT_ACTIONS.USER_DEACTIVATED,
        targetType: 'user',
        targetId: userId,
        details: { before: true, after: false },
      },
    }),
    // Как в PATCH: в журнал — только дата, без типа и причины.
    ...(autoDismissal
      ? [
          prisma.auditLog.create({
            data: {
              actorId: me.id,
              action: AUDIT_ACTIONS.DISMISSAL_UPDATED,
              targetType: 'user',
              targetId: userId,
              details: {
                before: dayKey(target.dismissedAt),
                after: dayKey(dismissedAt),
                typeChanged: false,
                reasonChanged: false,
                auto: true,
              },
            },
          }),
        ]
      : []),
  ]);
  forgetSessionUser(userId);

  return deactivatedResponse(updated, viewer);
}

/** Ответ деактивации: строка под зрителя + дата увольнения, если её можно видеть. */
function deactivatedResponse<T extends { id: number; leadId: number | null }>(
  user: T | null,
  viewer: { id: number; role: string },
) {
  if (!user) return NextResponse.json({ ok: true });
  const row = userForViewer(user, viewer) as Partial<T> & { dismissedAt?: Date | null };
  return NextResponse.json({
    ok: true,
    user: row,
    ...(row.dismissedAt !== undefined && { dismissedAt: row.dismissedAt }),
  });
}

const GRADE_ORDER = ['junior', 'junior_plus', 'premiddle', 'middle', 'middle_plus', 'senior'];

function isFloorLowered(before: string | null, after: string | null | undefined): boolean {
  if (!before || !after) return false;
  const beforeIdx = GRADE_ORDER.indexOf(before);
  const afterIdx = GRADE_ORDER.indexOf(after);
  if (beforeIdx === -1 || afterIdx === -1) return false;
  return afterIdx < beforeIdx;
}
