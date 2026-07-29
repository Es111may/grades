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

// ============================================================
// Словарь action'ов
// ============================================================

/**
 * Все возможные значения `AuditLog.action` — собраны в одном месте,
 * чтобы не плодить опечатки и легко составить словарь labels.
 */
export const AUDIT_ACTIONS = {
  // --- Users ---
  USER_UPDATED: 'user_updated',
  USER_DEACTIVATED: 'user_deactivated',
  USER_ACTIVATED: 'user_activated',
  USER_DELETED: 'user_deleted',
  USER_PASSWORD_CHANGED: 'user_password_changed',
  GRADE_FLOOR_CHANGED: 'grade_floor_changed',
  GRADING_DATE_SET: 'grading_date_set',
  GRADING_DATE_CLEARED: 'grading_date_cleared',
  // --- Assessments ---
  ASSESSMENT_PUBLISHED: 'assessment_published',
  ASSESSMENT_REOPENED: 'assessment_reopened',
  ASSESSMENT_DELETED: 'assessment_deleted',
  // --- Lead reviews ---
  LEAD_REVIEW_IMPORTED: 'lead_review_imported',
  LEAD_REVIEW_UPDATED: 'lead_review_updated',
  LEAD_REVIEW_DELETED: 'lead_review_deleted',
  // --- Checklists / ИПР ---
  CHECKLIST_CREATED: 'checklist_created',
  CHECKLIST_UPDATED: 'checklist_updated',
  CHECKLIST_DELETED: 'checklist_deleted',
  // --- Projects ---
  PROJECT_CREATED: 'project_created',
  PROJECT_UPDATED: 'project_updated',
  PROJECT_DELETED: 'project_deleted',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** Human-readable label для UI. Пополняй по мере появления новых action'ов. */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  user_updated: 'Профиль обновлён',
  user_deactivated: 'Деактивирован',
  user_activated: 'Активирован',
  user_deleted: 'Удалён',
  user_password_changed: 'Пароль изменён',
  grade_floor_changed: 'Зафиксированный грейд изменён',
  // Эти два писались в лог, но подписи не имели — в аудите выводились
  // без названия. Добавлены 29.07.2026.
  grade_floor_lowered: 'Зафиксированный грейд понижен',
  grade_floor_removed: 'Зафиксированный грейд снят',
  grading_date_set: 'Дата грейдирования назначена',
  grading_date_cleared: 'Дата грейдирования снята',
  assessment_published: 'Оценка опубликована',
  assessment_reopened: 'Оценка возвращена в черновик',
  assessment_deleted: 'Оценка удалена',
  lead_review_imported: '360-опрос импортирован',
  lead_review_updated: '360-опрос обновлён',
  lead_review_deleted: '360-опрос удалён',
  checklist_created: 'ИПР: чек-лист создан',
  checklist_updated: 'ИПР: чек-лист обновлён',
  checklist_deleted: 'ИПР: чек-лист удалён',
  impersonation_started: 'Вход под пользователем',
  impersonation_ended: 'Выход из имперсонации',
  project_created: 'Проект создан',
  project_updated: 'Проект обновлён',
  project_deleted: 'Проект удалён',
};

/** Тип target'а. Помогает в UI рендерить ссылку («перейти к объекту»). */
export const AUDIT_TARGET_TYPE_LABEL: Record<string, string> = {
  user: 'Пользователь',
  assessment: 'Оценка',
  lead_review: '360-опрос',
  checklist: 'Чек-лист',
  project: 'Проект',
  skill: 'Навык',
  matrix: 'Матрица',
};

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
