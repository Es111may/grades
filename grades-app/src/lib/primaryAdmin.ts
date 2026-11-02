// Главный админ — только сервер (клиенту уходит лишь производное
// manageAdmins у самого главного, см. lib/permissions).
//
// Кто главный — строка таблицы primary_admin (ведёт scripts/primary-admin.ts).
// Права действуют, только пока человек — активный админ и вошёл сам: под
// «Войти как» (impersonatorId в сессии) права главного нет ни у кого.

import { prisma } from './db';

export type PrimaryAdminRow = { primary: boolean; role: string; active: boolean };

/** Правило по строке из БД и сессии — без запроса. */
export function isActingPrimaryAdmin(
  row: PrimaryAdminRow | null,
  session: { impersonatorId: number | null } | null,
): boolean {
  return (
    !!row &&
    !!session &&
    session.impersonatorId === null &&
    row.primary &&
    row.role === 'admin' &&
    row.active
  );
}

/**
 * Правит ли зритель аккаунты других админов (manageAdmins в lib/permissions).
 * Роль и признак — из БД: роль в сессии может отставать до 5 минут.
 */
export async function managesAdmins(
  me: { id: number; impersonatorId: number | null } | null,
): Promise<boolean> {
  if (!me) return false;
  const row = await prisma.user.findUnique({
    where: { id: me.id },
    select: { role: true, active: true, primaryAdmin: { select: { slot: true } } },
  });
  return isActingPrimaryAdmin(
    row ? { primary: !!row.primaryAdmin, role: row.role, active: row.active } : null,
    me,
  );
}
