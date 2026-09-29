// Права на компенсации (Phase 23.4). Решения Pavel, 29.09.2026:
//   • админ видит всех;
//   • лид по своим людям видит ставку, % роста, историю и премии;
//   • стардиз и дизайнер о деньгах не видят ничего — даже своих.
// Применять на сервере: суммы не должны попадать ни в ответ API, ни в данные
// страницы для тех, кому их видеть нельзя.

type Me = { id: number; role: string } | null;
type Target = { id: number; leadId: number | null };

/** Видеть ставку, вилку, историю, премии и плановый пересмотр. */
export function canViewCompensation(me: Me, target: Target): boolean {
  if (!me) return false;
  if (me.role === 'admin') return true;
  return me.role === 'lead' && target.leadId === me.id;
}

/** Ставить, менять и снимать плановый пересмотр — те же, кто видит. */
export function canEditPlannedRaise(me: Me, target: Target): boolean {
  return canViewCompensation(me, target);
}

/** Вносить и удалять премии — только админ. */
export function canEditBonuses(me: Me): boolean {
  return me?.role === 'admin';
}
