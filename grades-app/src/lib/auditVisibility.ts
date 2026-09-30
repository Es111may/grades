// Что из журнала «Действия» видно зрителю — поверх скоупа по людям.
//
// «Действия» открыты лиду, а в журнал пишутся и деньги: плановый пересмотр
// з/п и премии. Лид видит их только про тех, чьи деньги ему можно видеть
// (lib/compPermissions) — иначе чужая команда или бывший подопечный
// просвечивали бы через журнал. Увольнение — только тем, кто видит его дату
// (lib/dismissal).
//
// Фильтр отдаётся как условие Prisma, а не фильтром после выборки: иначе
// страница «Загрузить ещё» приходила бы неполной, и клиент решил бы, что
// событий больше нет.
//
// Значения action — строками из AUDIT_ACTIONS (lib/audit): чистый модуль
// не должен тянуть за собой Prisma.

import { canViewDismissalDate } from './dismissal';

/** Префиксы денежных событий: planned_raise_* и bonus_*. */
const COMP_ACTION_PREFIXES = ['planned_raise_', 'bonus_'] as const;
const DISMISSAL_UPDATED = 'dismissal_updated';

type Viewer = { id: number; role: string };

export function isCompAuditAction(action: string): boolean {
  return COMP_ACTION_PREFIXES.some((p) => action.startsWith(p));
}

/**
 * Условие Prisma для AuditLog. `compViewableUserIds` — люди, чьи деньги
 * зрителю можно видеть (посчитаны через canViewCompensation). Админу — без
 * ограничений.
 */
export function auditVisibilityWhere(
  viewer: Viewer,
  compViewableUserIds: number[],
): Record<string, unknown> {
  if (viewer.role === 'admin') return {};
  const and: Record<string, unknown>[] = [
    {
      OR: [
        { NOT: COMP_ACTION_PREFIXES.map((p) => ({ action: { startsWith: p } })) },
        { targetType: 'user', targetId: { in: compViewableUserIds } },
      ],
    },
  ];
  if (!canViewDismissalDate(viewer)) {
    and.push({ action: { not: DISMISSAL_UPDATED } });
  }
  return { AND: and };
}

/**
 * То же правило для одной записи — для проверок и тестов; должно совпадать
 * с auditVisibilityWhere.
 */
export function canSeeAuditEntry(
  viewer: Viewer,
  entry: { action: string; targetType: string; targetId: number | null },
  compViewableUserIds: number[],
): boolean {
  if (viewer.role === 'admin') return true;
  if (isCompAuditAction(entry.action)) {
    const ok =
      entry.targetType === 'user' &&
      entry.targetId !== null &&
      compViewableUserIds.includes(entry.targetId);
    if (!ok) return false;
  }
  if (entry.action === DISMISSAL_UPDATED && !canViewDismissalDate(viewer)) return false;
  return true;
}
