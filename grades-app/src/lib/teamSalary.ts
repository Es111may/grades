// Колонка «З/п» в «Лидерборде» «Команды» (Phase 23.4; лиду — с 0.84.0).
//
// Права — те же, что у поп-апа (canViewCompensation): админ видит всех, лид —
// своих людей, стардиз и дизайнер — никого. Сервер кладёт ставку в строку
// только тем, кому её можно видеть: чужих сумм в данных страницы нет.
//
// Ячейка у зрителя бывает трёх видов: ставка; «—» — человек свой, но данных
// в HR нет (как у админа); пусто — человек не свой, ставка зрителю не
// положена. Пустая ячейка не должна читаться как «нет данных».

import { buildCompensation } from './compensation';
import { canViewCompensation } from './compPermissions';
import type { HrCompensation } from './hrSalary';

type Viewer = { id: number; role: string } | null;

type Person = {
  id: number;
  email: string;
  role: string;
  active: boolean;
  leadId: number | null;
  employmentType?: string | null;
};

/**
 * Почты для батча ставок страницы: активные люди, чью ставку зритель видит.
 * Админу — все активные, лиду — только свои, остальным — никого.
 */
export function salaryBatchEmails(
  viewer: Viewer,
  people: ReadonlyArray<Pick<Person, 'id' | 'email' | 'active' | 'leadId'>>,
): string[] {
  return people
    .filter((u) => u.active && u.email && canViewCompensation(viewer, u))
    .map((u) => u.email);
}

/**
 * Ставка в строке «Команды», ₽. Права проверяем ещё раз, даже если батч
 * собран по salaryBatchEmails: лишний человек в батче не должен дать сумму.
 *
 *   • undefined — зрителю не положено или человека нет в батче (HR
 *     недоступен, неактивный) — поля в строке нет;
 *   • null — в HR нет актуальной ставки («—» в колонке);
 *   • число — текущая ставка, тем же buildCompensation, что поп-ап.
 */
export function rowSalary(
  viewer: Viewer,
  person: Person,
  batch: ReadonlyMap<string, HrCompensation> | null,
  ctx: { grade: string | null; today: string },
): number | null | undefined {
  if (!canViewCompensation(viewer, person)) return undefined;
  const c = batch?.get(person.email.toLowerCase());
  if (!c) return undefined;
  const v = buildCompensation({
    hr: c.hr,
    log: c.log,
    bonuses: [],
    role: person.role,
    grade: ctx.grade,
    employmentType: person.employmentType,
    activeInGrades: person.active,
    today: ctx.today,
  });
  return v.state === 'ok' ? v.current : null;
}

/** Ячейка «З/п»: ставка, 'none' — «—» (нет данных), 'hidden' — пусто (не свой). */
export type SalaryCell = number | 'none' | 'hidden';

export function salaryCell(salary: number | null | undefined, visible: boolean): SalaryCell {
  if (!visible) return 'hidden';
  return salary != null ? salary : 'none';
}

const tier = (c: SalaryCell) => (typeof c === 'number' ? 0 : c === 'none' ? 1 : 2);

/**
 * Сортировка по «З/п»: ставки — по направлению, за ними «—», в самом конце
 * пустые (чужие) — в обе стороны. Иначе по возрастанию наверх всплывали бы
 * строки без цифр.
 */
export function compareSalaryCells(a: SalaryCell, b: SalaryCell, dir: 'asc' | 'desc'): number {
  const ta = tier(a);
  const tb = tier(b);
  if (ta !== tb) return ta - tb;
  if (typeof a === 'number' && typeof b === 'number') return dir === 'asc' ? a - b : b - a;
  return 0;
}
