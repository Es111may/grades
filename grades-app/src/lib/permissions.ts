/**
 * Централизованная карта прав. Используется и в API, и в UI чтобы не
 * расходиться в проверках.
 *
 * Главные роли:
 *  - admin   — всё, включая назначение админов и сброс паролей
 *  - lead    — всё что админ, кроме: назначения роли admin и сброса паролей
 *  - stardiz — senior-дизайнер с правами лида при грейдировании своих
 *              подопечных; сам грейдируется лидом/админом. Не имеет
 *              доступа к матрице/пользователям.
 *  - designer — только свой портрет
 */

import type { UserRole } from './types';

/** Может ли пользователь открыть админский раздел (матрица, пользователи, грейды, аудит)? */
export function canViewAdmin(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'lead';
}

/** Может ли управлять пользователями (создавать/деактивировать/менять отдел/лида)? */
export function canManageUsers(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'lead';
}

/**
 * Может ли заходить на /admin/users (просмотр канбана/матрицы/popup-карточек)?
 * Phase 10: stardiz получает доступ к списку пользователей, но видит только
 * своих подопечных (фильтр на сервере).
 */
export function canAccessUsers(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'lead' || role === 'stardiz';
}

/** Может ли назначать кому-то роль admin? Только сам admin. */
export function canAssignAdminRole(role: UserRole | undefined): boolean {
  return role === 'admin';
}

/** Может ли сбрасывать/задавать чужой пароль? Только admin. */
export function canResetPassword(role: UserRole | undefined): boolean {
  return role === 'admin';
}

/** Может ли редактировать матрицу скиллов и грейды? */
export function canEditMatrix(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'lead';
}

/** Может ли заходить в /lead раздел (мои дизайнеры / форма оценки)? */
export function canViewLeadArea(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'lead' || role === 'stardiz';
}

/**
 * Может ли конкретный наставник грейдировать конкретного дизайнера?
 *  - admin — кого угодно
 *  - lead   — если у дизайнера leadId === me.id
 *  - stardiz — если у дизайнера stardizId === me.id ИЛИ leadId === me.id
 *    (в редком случае стардиз и формальный лид — один и тот же человек)
 */
export function canGradeDesigner(
  me: { id: number; role: UserRole },
  designer: { leadId: number | null; stardizId: number | null },
): boolean {
  if (me.role === 'admin') return true;
  if (me.role === 'lead' && designer.leadId === me.id) return true;
  if (me.role === 'stardiz' && (designer.stardizId === me.id || designer.leadId === me.id))
    return true;
  return false;
}
