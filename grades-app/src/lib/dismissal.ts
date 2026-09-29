// Увольнение (Phase 23.4): дата, тип и причина. Решения Pavel, 30.09.2026:
//   • показываем у деактивированных и у почасовщиков — почасовщик формально
//     выведен из штата, хотя в команде работает;
//   • дату видят админ и лид; стардиз и дизайнер — нет;
//   • тип и причину видит и ставит только админ.
// Применять на сервере: тип и причина не должны попадать ни в данные
// страницы, ни в ответы API для не-админов, дата — для стардиза и дизайнера.

export const DISMISSAL_TYPES = ['voluntary', 'company', 'probation'] as const;
export type DismissalType = (typeof DISMISSAL_TYPES)[number];

export const DISMISSAL_TYPE_LABELS: Record<DismissalType, string> = {
  voluntary: 'По своему желанию',
  company: 'По решению компании',
  probation: 'Испытательный срок не пройден',
};

type Me = { role: string } | null;

/** У кого в карточке есть блок увольнения: неактивные и почасовщики. */
export function showsDismissal(u: { active: boolean; employmentType?: string | null }): boolean {
  return !u.active || u.employmentType === 'hourly';
}

/** Видеть дату увольнения — админ и лид. */
export function canViewDismissalDate(me: Me): boolean {
  return me?.role === 'admin' || me?.role === 'lead';
}

/** Видеть тип и причину увольнения — только админ. */
export function canViewDismissalStatus(me: Me): boolean {
  return me?.role === 'admin';
}

/** Ставить и менять дату, тип и причину — только админ. */
export function canEditDismissal(me: Me): boolean {
  return me?.role === 'admin';
}

export function isDismissalType(x: unknown): x is DismissalType {
  return typeof x === 'string' && (DISMISSAL_TYPES as readonly string[]).includes(x);
}
