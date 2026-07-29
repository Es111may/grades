// Скоуп команды для страницы «Команда»: «Все · Мои · <команда лида/стардиза>».
//
// Чистые функции, без React — чтобы поведение селектора можно было проверить
// тестами, а не только глазами. Тот же подход, что у permissions-библиотек
// (checklistPermissions.ts, selfAssessmentPermissions.ts).

import { genitiveFirstName } from './names';

/** Скоуп: вся команда, свои подопечные или команда конкретного лида/стардиза. */
export type ScopeFilter = 'all' | 'mine' | `u:${number}`;

/** Минимум полей, нужных для расчёта скоупа. */
export type ScopePerson = {
  id: number;
  fullName: string;
  role: string;
  active: boolean;
  leadId: number | null;
  stardizId: number | null;
};

export type TeamOption = {
  scope: ScopeFilter;
  /** Подпись в списке: «Все», «Мои», «Никиты». */
  label: string;
  /** Полное имя — в title, чтобы падеж не мешал узнать человека. */
  fullName: string;
  /** 'lead' | 'stardiz' | '' для служебных пунктов. */
  role: string;
  count: number;
};

/** id владельца команды: «Мои» → я, «u:N» → N, «Все» → null. */
export function scopeOwnerId(
  scope: ScopeFilter,
  meId: number | null,
): number | null {
  if (scope === 'all') return null;
  if (scope === 'mine') return meId;
  const id = Number(scope.slice(2));
  return Number.isFinite(id) ? id : null;
}

/** Подопечный владельца — и по лиду, и по стардизу. */
export function isMenteeOf(u: ScopePerson, ownerId: number): boolean {
  return u.leadId === ownerId || u.stardizId === ownerId;
}

/** Активные подопечные владельца. */
export function countMentees(users: ScopePerson[], ownerId: number): number {
  return users.filter((u) => u.active && isMenteeOf(u, ownerId)).length;
}

/**
 * Команды лидов и стардизов для селектора.
 *
 *  • админ видит все команды;
 *  • лид — только команды своих стардизов (его собственная команда — «Мои»);
 *  • остальным роли селектор не показываем вообще.
 *
 * Себя в список не добавляем — это пункт «Мои». Пустые команды скрываем:
 * пункт с нулём выбрать можно, но смотреть в нём нечего.
 */
export function buildTeamOptions(
  users: ScopePerson[],
  meId: number | null,
  meRole: string,
): TeamOption[] {
  return users
    .filter(
      (u) =>
        u.active &&
        u.id !== meId &&
        (u.role === 'lead' || u.role === 'stardiz') &&
        (meRole === 'admin' || (meRole === 'lead' && u.leadId === meId)),
    )
    .map((o) => ({
      scope: `u:${o.id}` as ScopeFilter,
      label: genitiveFirstName(o.fullName),
      fullName: o.fullName,
      role: o.role,
      count: countMentees(users, o.id),
    }))
    .filter((o) => o.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'));
}
