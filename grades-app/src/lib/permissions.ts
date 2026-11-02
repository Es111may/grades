/**
 * Централизованная карта прав. Используется и в API, и в UI чтобы не
 * расходиться в проверках.
 *
 * Главные роли:
 *  - admin   — всё, включая назначение админов и сброс паролей (кроме
 *              пароля и входа «под» другим админом — canIssuePassword,
 *              canImpersonateUser)
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
//
// Аккаунт другого админа (решение Pavel 02.11.2026): роль, email,
// активность, удаление и остальные поля карточки — только у зрителя с
// manageAdmins (главный админ, lib/primaryAdmin; ставится скриптом одному
// человеку). Без него админ правит из админов только себя; нет главного —
// чужие админы не правятся никем. Свою карточку каждый правит как раньше.

/** manageAdmins — правит аккаунты других админов (сервер считает в lib/primaryAdmin). */
type Me = { id: number; role: string; manageAdmins?: boolean } | null;
type Target = { id: number; role: string; leadId: number | null };

/** Человек — другой админ, его аккаунт правит только тот, у кого manageAdmins. */
function guardedAdmin(me: NonNullable<Me>, target: { id: number; role: string }): boolean {
  return target.role === 'admin' && target.id !== me.id && me.manageAdmins !== true;
}

/** Может ли править карточку человека (отдел, стардиза, билд и т.п.)? */
export function canEditUser(me: Me, target: Target): boolean {
  if (!me) return false;
  if (me.role === 'admin') return !guardedAdmin(me, target);
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
  if (me.role === 'admin') return canEditUser(me, target);
  if (me.role === 'lead') {
    return canEditUser(me, target) && newLeadId !== null && newLeadId !== me.id;
  }
  return false;
}

/**
 * Может ли деактивировать (уволить) или вернуть. Админ — кого угодно, кроме
 * себя (иначе можно остаться без единого админа) и других админов без
 * manageAdmins. Лид — только своих. Удаление навсегда — canDeleteUser.
 */
export function canDeactivateUser(me: Me, target: Target): boolean {
  if (!me) return false;
  if (me.role === 'admin') return target.id !== me.id && !guardedAdmin(me, target);
  if (me.role === 'lead') return canEditUser(me, target);
  return false;
}

/** Может ли удалить навсегда: только админ, не себя и не других админов без manageAdmins. */
export function canDeleteUser(me: Me, target: { id: number; role: string }): boolean {
  if (!me || me.role !== 'admin') return false;
  return target.id !== me.id && !guardedAdmin(me, target);
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

// ── Доступ человека: пароль, вход «под» ним, приглашение на самооценку ──
//
// Аккаунт админа — только его владельцу: другой админ не входит «под» ним и
// не выдаёт ему пароль. Правило общее для всех админов.

type AccessTarget = {
  id: number;
  role: string;
  leadId: number | null;
  stardizId: number | null;
};

/**
 * Может ли выдать человеку пароль для входа (POST /api/users/[id]/password —
 * сервер проверяет этим же хелпером; модалка «Изменить» и меню «⋯» поп-апа
 * 360 показывают по нему пункты):
 *  - admin — любому, кроме других админов (свой пароль — сам себе);
 *  - lead — дизайнеру или стардизу, у которого он лид или стардиз;
 *  - stardiz — дизайнеру, у которого он стардиз или лид.
 * Лидам, админам и самим себе лид и стардиз пароль не выдают — иначе это
 * эскалация привилегий.
 */
export function canIssuePassword(me: Me, target: AccessTarget): boolean {
  if (!me) return false;
  if (me.role === 'admin') return target.role !== 'admin' || target.id === me.id;
  const mine = target.leadId === me.id || target.stardizId === me.id;
  if (me.role === 'lead') {
    return mine && (target.role === 'designer' || target.role === 'stardiz');
  }
  if (me.role === 'stardiz') return mine && target.role === 'designer';
  return false;
}

/**
 * Может ли войти «под» человеком (меню «⋯» поп-апа 360 → «Войти как»;
 * сервер — провайдер impersonate в lib/auth проверяет этим же хелпером по
 * роли из БД). Только админ, только под активным, не под собой и не под
 * другим админом. Возврат «под» исходного админа после входа — отдельный
 * путь в lib/auth (по impersonatorId из токена), этим хелпером не решается.
 */
export function canImpersonateUser(
  me: Me,
  target: { id: number; role: string; active: boolean },
): boolean {
  if (!me || me.role !== 'admin') return false;
  return target.active && target.id !== me.id && target.role !== 'admin';
}

/**
 * Решение провайдера impersonate (lib/auth): можно ли из текущей сессии
 * перейти в аккаунт target. Возврат в исходный аккаунт (target —
 * impersonatorId сессии) — всегда, если он активен: это выход из «Войти как».
 * Иначе — canImpersonateUser для того, кто сейчас в сессии (actor — его
 * строка из БД). Поэтому из-под дизайнера или лида дальше не войти ни к
 * кому, а к админу — ни из-под кого.
 */
export function canSwitchToUser(
  session: { impersonatorId: number | null },
  actor: { id: number; role: string; active: boolean } | null,
  target: { id: number; role: string; active: boolean },
): boolean {
  if (!target.active) return false;
  if (session.impersonatorId !== null && session.impersonatorId === target.id) return true;
  return !!actor?.active && canImpersonateUser(actor, target);
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
