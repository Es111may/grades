// Сезоны оценок (решение Pavel, 30.09.2026):
//   • весна — 1 апреля – 1 мая, осень — 1 октября – 1 ноября;
//   • срок назначить даты грейдирования (лиду) и обновить самооценку
//     (дизайнеру) — старт сезона: «до 1 апреля» / «до 1 октября»;
//   • напоминание в шапке висит месяц перед стартом и в сам день старта:
//     весна — 1–31 марта и 1 апреля, осень — 1–30 сентября и 1 октября.
// Даты живут только в SEASONS — окна и подписи сроков выводятся из неё.
// Сравнение по локальной дате (getMonth/getDate), как в компонентах.

export type Season = 'spring' | 'autumn';

/** Месяц 1..12 и число. */
type MonthDay = { month: number; day: number };

export const SEASONS: Record<Season, { start: MonthDay; end: MonthDay }> = {
  spring: { start: { month: 4, day: 1 }, end: { month: 5, day: 1 } },
  autumn: { start: { month: 10, day: 1 }, end: { month: 11, day: 1 } },
};

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/**
 * Окно напоминания в заданном году: от того же числа месяцем раньше
 * до дня старта включительно. Сезоны не стартуют в январе, поэтому окно
 * не переходит через год.
 */
export function reminderWindow(season: Season, year: number): { from: Date; to: Date } {
  const { month, day } = SEASONS[season].start;
  return { from: new Date(year, month - 2, day), to: new Date(year, month - 1, day) };
}

/** Какой сезон сейчас напоминаем, или null — вне окон. */
export function activeSeason(now: Date): Season | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (const season of Object.keys(SEASONS) as Season[]) {
    const { from, to } = reminderWindow(season, today.getFullYear());
    if (today >= from && today <= to) return season;
  }
  return null;
}

/** Срок в тексте капсулы: «1 апреля» / «1 октября». */
export function seasonDeadlineLabel(season: Season): string {
  const { month, day } = SEASONS[season].start;
  return `${day} ${MONTHS_GENITIVE[month - 1]}`;
}
