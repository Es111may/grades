/**
 * Аудит-лог: единая точка записи событий + словарь action'ов.
 *
 * Сценарий использования — в API-роутах, после успешной мутации:
 *
 *     await writeAudit({
 *       actorId: me.id,
 *       action: AUDIT_ACTIONS.ASSESSMENT_PUBLISHED,
 *       targetType: 'assessment',
 *       targetId: assessment.id,
 *       after: { effectiveGrade, totalXp },
 *       reason: 'publish from form',
 *     });
 *
 * Запись в лог НЕ должна валить основной запрос — если у нас проблема
 * с записью, лучше вернуть пользователю успех (мутация прошла), а в
 * консоль написать ошибку. Иначе админ потеряет ценное изменение
 * из-за чего-то побочного.
 */

import { prisma } from './db';

// Словари — в lib/auditShared (клиенту — оттуда же, без Prisma)
import type { AuditAction } from './auditShared';
export { AUDIT_ACTIONS, AUDIT_ACTION_LABEL, AUDIT_TARGET_TYPE_LABEL } from './auditShared';
export type { AuditAction } from './auditShared';

// ============================================================
// Запись события
// ============================================================

export interface AuditPayload {
  actorId: number;
  action: AuditAction | string;
  targetType: string;
  /** id целевого объекта; null если событие глобальное. */
  targetId?: number | null;
  /** Состояние до изменения. Удобно для diff в UI. */
  before?: unknown;
  /** Состояние после. */
  after?: unknown;
  /** Свободный комментарий, например причина действия. */
  reason?: string;
  /** Любые доп. поля, которые попадут в `details` рядом с before/after/reason. */
  extra?: Record<string, unknown>;
}

/**
 * Записывает событие в `AuditLog`. Не валит вызывающий код при ошибке —
 * пишет в console.error и идёт дальше.
 */
export async function writeAudit(payload: AuditPayload): Promise<void> {
  try {
    const details: Record<string, unknown> = {};
    if (payload.before !== undefined) details.before = payload.before;
    if (payload.after !== undefined) details.after = payload.after;
    if (payload.reason !== undefined) details.reason = payload.reason;
    if (payload.extra) Object.assign(details, payload.extra);

    await prisma.auditLog.create({
      data: {
        actorId: payload.actorId,
        action: payload.action,
        targetType: payload.targetType,
        targetId: payload.targetId ?? null,
        details: details as object,
      },
    });
  } catch (err) {
    console.error('[audit] failed to write log entry:', err, payload);
  }
}
