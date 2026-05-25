/**
 * Права на ИПР (чек-листы).
 *
 * Иерархия ролей (от старшего к младшему):
 *   admin > lead > stardiz > designer
 *
 * Правила (см. PRD §11.7 и обсуждение с Pavel'ом):
 *
 *   СОЗДАВАТЬ на чьём портрете:
 *     admin   → всем
 *     lead    → designer и stardiz, плюс себе
 *     stardiz → designer, плюс себе
 *     designer → только себе
 *
 *   РЕДАКТИРОВАТЬ структуру (title, текст пунктов, +/- пункты, удалить):
 *     автор чек-листа + любая роль строго старше `createdByRole`.
 *     То есть если поставил дизайнер — может редактировать designer (он сам),
 *     stardiz, lead, admin. Если поставил лид — лид (он сам) + admin.
 *
 *   ОТМЕЧАТЬ `checked`:
 *     все, кто видит портрет owner'а. Включая самого owner'а — иначе ИПР
 *     бесполезен (дизайнер не сможет отметить выполнение того, что ему
 *     поставил лид).
 *
 * Модуль чистый — никаких БД-зависимостей. Caller передаёт нужные поля
 * пользователя/чек-листа сам.
 */

export type Role = 'admin' | 'lead' | 'stardiz' | 'designer';

/** Иерархия: меньше — старше. admin = 0, designer = 3. */
const RANK: Record<Role, number> = {
  admin: 0,
  lead: 1,
  stardiz: 2,
  designer: 3,
};

function isValidRole(r: string | null | undefined): r is Role {
  return r === 'admin' || r === 'lead' || r === 'stardiz' || r === 'designer';
}

// ============================================================
// Видимость
// ============================================================

export interface TargetUserForView {
  id: number;
  role: string;
  leadId: number | null;
  stardizId: number | null;
}

/**
 * Может ли пользователь просматривать чек-листы на портрете target'а.
 * Логика согласована с правом на просмотр портрета (см. /lead/portrait).
 *
 *   admin → всем
 *   lead → если target — его дизайнер/стардиз
 *   stardiz → если target — его дизайнер
 *   любой → самому себе
 */
export function canViewChecklists(
  me: { id: number; role: string },
  target: TargetUserForView,
): boolean {
  if (!isValidRole(me.role)) return false;
  if (me.id === target.id) return true;
  if (me.role === 'admin') return true;
  if (me.role === 'lead' || me.role === 'stardiz') {
    return target.leadId === me.id || target.stardizId === me.id;
  }
  return false;
}

// ============================================================
// Создание чек-листа на портрете target'а
// ============================================================

/**
 * Может ли `me` создать чек-лист на портрете `target`.
 * См. таблицу в шапке файла.
 */
export function canCreateChecklistFor(
  me: { id: number; role: string },
  target: { id: number; role: string; leadId: number | null; stardizId: number | null },
): boolean {
  if (!isValidRole(me.role)) return false;
  // Себе — может любой.
  if (me.id === target.id) return true;

  if (me.role === 'admin') return true;

  // Лид: дизайнеру или стардизу, которого он ведёт.
  if (me.role === 'lead') {
    if (target.role === 'designer' || target.role === 'stardiz') {
      return target.leadId === me.id || target.stardizId === me.id;
    }
    return false;
  }

  // Стардиз: только дизайнеру, которого он курирует.
  if (me.role === 'stardiz') {
    if (target.role === 'designer') {
      return target.stardizId === me.id || target.leadId === me.id;
    }
    return false;
  }

  // Designer — только себе (отработано в начале функции).
  return false;
}

// ============================================================
// Редактирование структуры чек-листа
// ============================================================

export interface ChecklistForPerms {
  ownerId: number;
  createdById: number;
  createdByRole: string;
}

/**
 * Может ли `me` редактировать структуру чек-листа (title, items, удалить).
 *
 *   - Сам автор чек-листа — всегда может.
 *   - Любая роль строго старше `createdByRole` — может (admin > lead > stardiz > designer).
 *
 * Заметка: «свой/чужой» по `ownerId` мы не проверяем — это про право
 * РЕДАКТИРОВАНИЯ, а не доступа к данным. Доступ (видеть) уже подтверждён
 * через `canViewChecklists`. Если admin может видеть портрет — он может
 * редактировать любой чек-лист, даже не «свой».
 */
export function canEditChecklist(
  me: { id: number; role: string },
  checklist: ChecklistForPerms,
): boolean {
  if (!isValidRole(me.role)) return false;
  if (checklist.createdById === me.id) return true;
  if (!isValidRole(checklist.createdByRole)) return false;
  return RANK[me.role] < RANK[checklist.createdByRole];
}

// ============================================================
// Отметка checked
// ============================================================

/**
 * Может ли `me` менять флаг `checked` у пункта чек-листа.
 * Все, кто видит портрет owner'а. По сути — алиас canViewChecklists.
 */
export function canCheckItem(
  me: { id: number; role: string },
  checklist: ChecklistForPerms,
  owner: TargetUserForView,
): boolean {
  // checklist здесь нужен только для возможного расширения логики позже
  // (например, если решим, что галочки чужого автора ставит только owner).
  // Пока — алиас.
  void checklist;
  return canViewChecklists(me, owner);
}
