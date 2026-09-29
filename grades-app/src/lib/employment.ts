// Формат занятости (Phase 23.4): штатный или почасовщик.
//
// Почасовщик — такой же дизайнер, но:
//   • не грейдируется: нет даты грейдирования, оценок, сигналов о них;
//   • не входит в таланты: NIPC, 9-Box, рейтинг и подиум;
//   • его задачи учитываются в «в срок» команды — это реальная работа.
// Решения Pavel, 29.09.2026. Правила собраны здесь, чтобы сервер (page.tsx)
// и клиент (computeScopedStats) считали одинаково.

export type EmploymentType = 'staff' | 'hourly';

type WithEmployment = { employmentType?: string | null };
type Person = WithEmployment & { role: string; active: boolean };

export function isHourly(u: WithEmployment): boolean {
  return u.employmentType === 'hourly';
}

/** Участвует в грейдировании и талантах: дизайнер или стардиз, активен, не почасовщик. */
export function isGradable(u: Person): boolean {
  return (u.role === 'designer' || u.role === 'stardiz') && u.active && !isHourly(u);
}

/** Дизайнер, чья работа идёт в «в срок» команды — включая почасовщиков. */
export function countsForOnTime(u: Person): boolean {
  return u.role === 'designer' && u.active;
}

/**
 * Кто может перевести дизайнера в почасовщики и обратно: админ — любого,
 * лид — своего подопечного. Стардиз — нет. Статус есть только у дизайнеров.
 */
export function canSetEmploymentType(
  me: { id: number; role: string } | null,
  target: { role: string; leadId: number | null },
): boolean {
  if (!me || target.role !== 'designer') return false;
  if (me.role === 'admin') return true;
  return me.role === 'lead' && target.leadId === me.id;
}
