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
import { isGradingExempt } from './employment';

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

// ── Правка людей (лид — только своих) ────────────────────────────────────
//
// Решение Pavel: лид правит только своих дизайнеров и стардизов и может
// передать их другому лиду; перекладывать людей между чужими командами —
// только админ. Лид не трогает админов и других лидов, даже если формально
// указан у них лидом.

type Me = { id: number; role: string } | null;
type Target = { id: number; role: string; leadId: number | null };

/** Может ли править карточку человека (отдел, стардиза, билд и т.п.)? */
export function canEditUser(me: Me, target: Target): boolean {
  if (!me) return false;
  if (me.role === 'admin') return true;
  if (me.role === 'lead') {
    return (
      target.leadId === me.id && (target.role === 'designer' || target.role === 'stardiz')
    );
  }
  return false;
}

/**
 * Может ли поправить в своей карточке имя и аватар — тем, кто открывает
 * модалку «Изменить» (админ, лид). Админу это и так даёт canEditUser, а лиду
 * свою карточку canEditUser не открывает (он не «свой» сам себе). Какие поля
 * можно менять при такой правке — lib/userUpdate (selfEditLockedFields).
 */
export function canEditOwnProfile(me: Me, target: { id: number }): boolean {
  if (!me) return false;
  return me.id === target.id && (me.role === 'admin' || me.role === 'lead');
}

/**
 * Может ли сменить человеку лида. Лиду — только передача своего человека
 * другому лиду: «снять лида» (null) и «назначить себя» нельзя. Что новый
 * лид существует, активен и в роли lead/admin — проверяет сервер.
 */
export function canChangeLead(me: Me, target: Target, newLeadId: number | null): boolean {
  if (!me) return false;
  if (me.role === 'admin') return true;
  if (me.role === 'lead') {
    return canEditUser(me, target) && newLeadId !== null && newLeadId !== me.id;
  }
  return false;
}

/**
 * Может ли деактивировать (уволить). Админ — кого угодно, кроме себя: иначе
 * можно остаться без единого админа. Лид — только своих. Удаление навсегда —
 * отдельно, только админ.
 */
export function canDeactivateUser(me: Me, target: Target): boolean {
  if (!me) return false;
  if (me.role === 'admin') return target.id !== me.id;
  if (me.role === 'lead') return canEditUser(me, target);
  return false;
}

/**
 * Может ли видеть подробности о человеке (проекты и т.п.) — те же, кто
 * открывает его портрет: сам человек, админ, его лид и стардиз.
 */
export function canViewUserDetails(
  me: Me,
  target: { id: number; leadId: number | null; stardizId: number | null },
): boolean {
  if (!me) return false;
  if (me.role === 'admin' || me.id === target.id) return true;
  return target.leadId === me.id || target.stardizId === me.id;
}

// ── Доступ человека: пароль и приглашение на самооценку ──────────────────

type AccessTarget = {
  role: string;
  leadId: number | null;
  stardizId: number | null;
};

/**
 * Может ли выдать человеку пароль для входа (POST /api/users/[id]/password —
 * сервер проверяет этим же хелпером; модалка «Изменить» и меню «⋯» поп-апа
 * 360 показывают по нему пункты):
 *  - admin — любому;
 *  - lead — дизайнеру или стардизу, у которого он лид или стардиз;
 *  - stardiz — дизайнеру, у которого он стардиз или лид.
 * Лидам, админам и самим себе лид и стардиз пароль не выдают — иначе это
 * эскалация привилегий.
 */
export function canIssuePassword(me: Me, target: AccessTarget): boolean {
  if (!me) return false;
  if (me.role === 'admin') return true;
  const mine = target.leadId === me.id || target.stardizId === me.id;
  if (me.role === 'lead') {
    return mine && (target.role === 'designer' || target.role === 'stardiz');
  }
  if (me.role === 'stardiz') return mine && target.role === 'designer';
  return false;
}

/**
 * Может ли позвать человека на самооценку (пункт меню «⋯» поп-апа 360 —
 * скопировать приглашение со ссылкой /designer?self=1). Права — те же, что
 * на пароль: зовут те, кто человека ведёт. Самооценка есть только у
 * дизайнера (страница /designer, canEditSelfAssessment), активного и
 * грейдируемого: почасовщику и билду без грейдов она ни к чему — у них и
 * сезонного напоминания нет. Есть ли у человека опубликованная оценка (без
 * неё навыков на портрете нет) — решает вызывающий: пункт виден, но выключен.
 */
export function canInviteSelfAssessment(
  me: Me,
  target: AccessTarget & {
    active: boolean;
    employmentType?: string | null;
    build: { code: string } | null;
  },
): boolean {
  return (
    target.role === 'designer' &&
    target.active &&
    !isGradingExempt(target) &&
    canIssuePassword(me, target)
  );
}
