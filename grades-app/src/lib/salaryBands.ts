// Вилки ставок (Phase 23.4) — те, на которые ориентируемся при подборе.
// Источник — «Дэшборд 2026» таблицы Pavel; не менялись 2,5 года, поэтому
// лежат в коде, а не в базе. Суммы — ₽/мес на руки. Вилка лида — 160–240
// с 01.10.2026 (решение Pavel; было 140–220).
//
// Пре-мидл — полугрейд между джун+ и мидлом, своих гейтов у него нет, и
// вилка совпадает с джун+ осознанно (решение Pavel). По правилу цвета
// пре-мидлы поэтому часто оказываются «выше вилки» — это не ошибка.

export type SalaryBand = { min: number; max: number };

const K = 1000;
const BY_GRADE: Record<string, SalaryBand> = {
  junior: { min: 55 * K, max: 75 * K },
  junior_plus: { min: 75 * K, max: 100 * K },
  premiddle: { min: 75 * K, max: 100 * K },
  middle: { min: 100 * K, max: 120 * K },
  middle_plus: { min: 120 * K, max: 140 * K },
  senior: { min: 140 * K, max: 160 * K },
};
const BY_ROLE: Record<string, SalaryBand> = {
  stardiz: { min: 140 * K, max: 180 * K },
  lead: { min: 160 * K, max: 240 * K },
};

/**
 * Вилка человека: у лида и стардиза — по роли, у дизайнера — по грейду.
 * Почасовщика в вилку не сверяем. Нет грейда (испыталка без оценки) — нет вилки.
 */
export function bandFor(u: {
  role: string;
  grade: string | null;
  employmentType?: string | null;
}): SalaryBand | null {
  if (u.employmentType === 'hourly') return null;
  if (BY_ROLE[u.role]) return BY_ROLE[u.role];
  if (u.role === 'designer' && u.grade) return BY_GRADE[u.grade] ?? null;
  return null;
}

export type BandState = 'above' | 'within' | 'below';

/**
 * Правило цвета Pavel: красный — выше вилки, зелёный — в вилке или ниже.
 * «Ниже» различаем для подписи, но тревогой не считаем.
 */
export function bandState(salary: number, band: SalaryBand): BandState {
  if (salary > band.max) return 'above';
  if (salary < band.min) return 'below';
  return 'within';
}
