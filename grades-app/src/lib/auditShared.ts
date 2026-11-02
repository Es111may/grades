// Словари аудит-лога (action'ы и подписи) — без Prisma, для клиента и
// сервера. Клиентский код берёт их отсюда, а не из lib/audit: тот тянет
// lib/db, и в бандл попадала бы браузерная заглушка @prisma/client со всей
// схемой (названия моделей и полей). Запись событий — lib/audit.

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
  USER_ROLE_CHANGED: 'user_role_changed',
  USER_EMAIL_CHANGED: 'user_email_changed',
  USER_LEAD_CHANGED: 'user_lead_changed',
  USER_STARDIZ_CHANGED: 'user_stardiz_changed',
  GRADE_FLOOR_CHANGED: 'grade_floor_changed',
  GRADING_DATE_SET: 'grading_date_set',
  GRADING_DATE_CLEARED: 'grading_date_cleared',
  EMPLOYMENT_TYPE_CHANGED: 'employment_type_changed',
  DISMISSAL_UPDATED: 'dismissal_updated',
  PLANNED_RAISE_SET: 'planned_raise_set',
  PLANNED_RAISE_CLEARED: 'planned_raise_cleared',
  BONUS_CREATED: 'bonus_created',
  BONUS_DELETED: 'bonus_deleted',
  // Phase 23.6a — реестр из HR-портала (scripts/sync-hr-registry.ts):
  // карточка заведена по HR и пустые даты дозаполнены из HR. В details —
  // роль и даты, без денег, типа и причины ухода (журнал видит лид).
  USER_IMPORTED_FROM_HR: 'user_imported_from_hr',
  USER_DATES_FROM_HR: 'user_dates_from_hr',
  // Phase 23.6b — настройки «Экономики» (ориентир ФОТ, налоговая нагрузка, потолок)
  SETTINGS_UPDATED: 'settings_updated',
  // --- Assessments ---
  ASSESSMENT_PUBLISHED: 'assessment_published',
  ASSESSMENT_REOPENED: 'assessment_reopened',
  ASSESSMENT_DELETED: 'assessment_deleted',
  // Phase 24 — пересчёт сохранённого грейда скриптом (scripts/recalc-grades.ts)
  ASSESSMENT_RECALCULATED: 'assessment_recalculated',
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
  user_role_changed: 'Сменена роль',
  user_email_changed: 'Сменён email',
  user_lead_changed: 'Сменён лид',
  user_stardiz_changed: 'Сменён стардиз',
  grade_floor_changed: 'Зафиксированный грейд изменён',
  // Эти два писались в лог, но подписи не имели — в аудите выводились
  // без названия. Добавлены 29.07.2026.
  grade_floor_lowered: 'Зафиксированный грейд понижен',
  grade_floor_removed: 'Зафиксированный грейд снят',
  grading_date_set: 'Дата грейдирования назначена',
  grading_date_cleared: 'Дата грейдирования снята',
  employment_type_changed: 'Формат занятости изменён',
  dismissal_updated: 'Изменено увольнение',
  planned_raise_set: 'Плановый пересмотр з/п',
  planned_raise_cleared: 'Плановый пересмотр снят',
  bonus_created: 'Премия внесена',
  bonus_deleted: 'Премия удалена',
  user_imported_from_hr: 'Добавлен из HR',
  user_dates_from_hr: 'Даты дозаполнены из HR',
  settings_updated: 'Настройки изменены',
  assessment_published: 'Оценка опубликована',
  assessment_reopened: 'Оценка возвращена в черновик',
  assessment_deleted: 'Оценка удалена',
  assessment_recalculated: 'Грейд пересчитан',
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
  settings: 'Настройки',
};
