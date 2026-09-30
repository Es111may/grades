// Свежесть сессии. Роль и активность лежат в JWT до 8 часов: без перечитки
// деактивированный человек или лид, которого разжаловали, ещё полдня ходил
// бы со старыми правами. Раз в SESSION_REFRESH_MS перечитываем роль,
// активность и имя из БД (см. jwt-колбэк в lib/auth).
//
// Имперсонация: в токене numericId — тот, под кем вошли, impersonatorId —
// админ, который вошёл. Данные берём у первого, а второй должен оставаться
// активным админом — иначе сессия, выданная по админскому праву, живёт
// дольше самого права.

export const SESSION_REFRESH_MS = 5 * 60 * 1000;

export type SessionUserRow = { id: number; role: string; active: boolean; fullName: string };

export type SessionRefresh =
  | { ok: false }
  | { ok: true; role: string; fullName: string };

/** Пора ли перечитывать. Метка из будущего (сбитые часы) — тоже пора. */
export function isRefreshDue(refreshedAt: unknown, now: number): boolean {
  if (typeof refreshedAt !== 'number') return true;
  return now - refreshedAt >= SESSION_REFRESH_MS || refreshedAt > now;
}

/** id, которые надо перечитать для этого токена. */
export function sessionUserIds(token: { numericId: number; impersonatorId?: number | null }): number[] {
  return typeof token.impersonatorId === 'number' && token.impersonatorId !== token.numericId
    ? [token.numericId, token.impersonatorId]
    : [token.numericId];
}

/** Решение по свежим строкам из БД: сессия жива (с новой ролью и именем) или нет. */
export function resolveSessionRefresh(
  token: { numericId: number; impersonatorId?: number | null },
  rows: SessionUserRow[],
): SessionRefresh {
  const self = rows.find((r) => r.id === token.numericId);
  if (!self || !self.active) return { ok: false };
  if (typeof token.impersonatorId === 'number') {
    const admin = rows.find((r) => r.id === token.impersonatorId);
    if (!admin || !admin.active || admin.role !== 'admin') return { ok: false };
  }
  return { ok: true, role: self.role, fullName: self.fullName };
}
