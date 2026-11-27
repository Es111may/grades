// Деактивация человека — что пишется в карточку и в «Действия». Одна
// функция на два пути: «Деактивировать» в интерфейсе (DELETE
// /api/users/[id]) и сверка состава с HR (scripts/sync-hr-registry.ts).
// Права проверяет вызывающий (canDeactivateUser); здесь — только записи.
//
// Правила (решение владельца): active = false; дата увольнения ставится сама,
// если её нет или она осталась от прошлого трудоустройства (раньше найма,
// needsDismissalDate). Интерфейс ставит сегодняшнюю по Москве; сверка с HR —
// дату увольнения из HR, если она не раньше найма и не в будущем, иначе тоже
// сегодняшнюю. В «Действия» — USER_DEACTIVATED и, если дату поставили,
// DISMISSAL_UPDATED с auto: true — без типа и причины ухода (журнал видит лид).

import type { Prisma } from '@prisma/client';
import { AUDIT_ACTIONS } from './auditShared';
import { needsDismissalDate } from './userUpdate';

export type DeactivationTarget = { id: number; hiredAt: Date | null; dismissedAt: Date | null };

export type DeactivationWrites = {
  /** Поля пользователя. */
  data: { active: false; dismissedAt?: Date };
  /** Записи «Действий» — в той же транзакции, что и update. */
  audits: Prisma.AuditLogCreateManyInput[];
};

const dayKey = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export function deactivationWrites(
  target: DeactivationTarget,
  opts: {
    actorId: number;
    /** Сегодня по Москве, полночь UTC (todayMoscowDate). */
    today: Date;
    /** Дата увольнения из HR — для сверки с HR. */
    hrDismissedAt?: Date | null;
    /** Пометка в обе записи «Действий»: например, { reason: 'Сверка с HR', hrId }. */
    note?: Record<string, string>;
  },
): DeactivationWrites {
  const auto = needsDismissalDate(target);
  let dismissedAt = target.dismissedAt;
  if (auto) {
    const hr = opts.hrDismissedAt ?? null;
    const hrFits =
      !!hr &&
      hr.getTime() <= opts.today.getTime() &&
      !(target.hiredAt && hr.getTime() < target.hiredAt.getTime());
    dismissedAt = hrFits ? hr : opts.today;
  }
  const entry = (action: string, details: Prisma.InputJsonObject): Prisma.AuditLogCreateManyInput => ({
    actorId: opts.actorId,
    action,
    targetType: 'user',
    targetId: target.id,
    details,
  });
  const audits = [entry(AUDIT_ACTIONS.USER_DEACTIVATED, { before: true, after: false, ...opts.note })];
  if (auto) {
    audits.push(
      entry(AUDIT_ACTIONS.DISMISSAL_UPDATED, {
        before: dayKey(target.dismissedAt),
        after: dayKey(dismissedAt),
        typeChanged: false,
        reasonChanged: false,
        auto: true,
        ...opts.note,
      }),
    );
  }
  return { data: { active: false, ...(auto && dismissedAt ? { dismissedAt } : {}) }, audits };
}
