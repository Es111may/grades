// Отображение ставки — только сервер (клиентский код этот модуль не
// импортирует: тест salaryOverrideImports).
//
// Запись в salary_display_overrides (ведёт scripts/salary-override.ts, UI
// нет) задаёт человеку ставку для показа. Всем, кроме владельца записи, его
// ставка — эта сумма, постоянная с начала истории: в журнале HR одна
// стартовая ставка, без пересмотров. Остальное — вилка, рост, «Последний
// пересмотр», «выполнен» у планового пересмотра, колонка «Зарплата»,
// «Экономика» — считается уже от неё теми же функциями, что и всегда.
//
// Правила:
//   • владелец — тот, кто вошёл сам: под имперсонацией (кто бы под кем ни
//     вошёл) настоящих данных не видит никто;
//   • подменяем только то, что пришло из HR: человека нет в HR, ставки нет,
//     HR недоступен — данные как есть, как у любого без данных;
//   • форма та же, что без подмены: те же ключи, типы и виды событий;
//   • кэши HR (perfCache, lastGood в hrEconomics) общие для всех зрителей и
//     хранят данные как есть. Подмена — копией после кэша, на каждый запрос;
//     исходные объекты не трогаем.

import { prisma } from './db';
import { normalizeLog, type HrEconomicsRaw, type HrLogRaw } from './economics';
import type { HrLogRow } from './compensation';
import type { HrCompensation } from './hrSalary';

/**
 * Кто смотрит. impersonatorId обязателен: «вошёл сам» — только явный null
 * из сессии (session.user.impersonatorId), а не отсутствие поля.
 */
export type DisplayViewer = { id: number; impersonatorId: number | null } | null;

export type DisplayRule = { email: string; amount: number; ownerId: number | null };

/** email (нижний регистр) → ставка для показа, ₽/мес. */
export type DisplayRates = ReadonlyMap<string, number>;

const emailKey = (email: string) => email.trim().toLowerCase();
const day = (iso: string) => iso.slice(0, 10);

/** Владелец записи, вошедший сам, видит данные как есть. */
export function seesActual(rule: Pick<DisplayRule, 'ownerId'>, viewer: DisplayViewer): boolean {
  return (
    !!viewer &&
    rule.ownerId != null &&
    viewer.id === rule.ownerId &&
    viewer.impersonatorId === null
  );
}

/** Ставки для показа этому зрителю: без записей, которые он видит как есть. */
export function ratesForViewer(rules: DisplayRule[], viewer: DisplayViewer): DisplayRates {
  const out = new Map<string, number>();
  for (const r of rules) {
    if (!Number.isInteger(r.amount) || r.amount <= 0 || seesActual(r, viewer)) continue;
    out.set(emailKey(r.email), r.amount);
  }
  return out;
}

/**
 * Записи из БД — на каждый запрос (таблица крошечная, кэш процесса не
 * нужен). Не прочитались — ошибка без подробностей: вызывающие считают её
 * недоступностью HR и не показывают ставок никому.
 */
export async function loadDisplayRates(viewer: DisplayViewer): Promise<DisplayRates> {
  let rows: Array<{ amount: number; ownerId: number | null; user: { email: string } }>;
  try {
    rows = await prisma.salaryDisplayOverride.findMany({
      select: { amount: true, ownerId: true, user: { select: { email: true } } },
    });
  } catch {
    throw new Error('HR: данные недоступны');
  }
  return ratesForViewer(
    rows.map((r) => ({ email: r.user.email, amount: r.amount, ownerId: r.ownerId })),
    viewer,
  );
}

/**
 * Дата единственной записи: найм (последний не позже начала журнала), иначе
 * первая запись журнала. На дате найма стартовая ставка стоит у всех, и
 * «с начала года» / «с найма» дают 0%.
 */
function startDate(firstLogDate: string, hires: Array<string | null>): string {
  const before = hires
    .filter((h): h is string => !!h)
    .map(day)
    .filter((h) => h <= firstLogDate)
    .sort();
  return before.length ? before[before.length - 1] : firstLogDate;
}

/** Журнал «одна стартовая ставка» вместо настоящего; null — ставки в журнале нет. */
function startLog(log: HrLogRow[], hires: Array<string | null>, amount: number): HrLogRow[] | null {
  const rows = normalizeLog(log);
  if (!rows.length) return null;
  // from = 0 — запись читается стартовой ставкой (как «с нуля» в HR)
  return [{ date: startDate(rows[0].date, hires), from: 0, to: amount }];
}

/** Поп-ап «Зарплата», план пересмотра: ставка и журнал одного человека. */
export function displayCompensation(c: HrCompensation, amount: number | undefined): HrCompensation {
  if (amount == null || !c.hr) return c;
  const log = startLog(c.log, [c.hr.hiredAt], amount);
  // Ставки нет ни в журнале, ни в карточке — показывать нечего, как есть
  if (!log && !(c.hr.salary > 0)) return c;
  return {
    hr: { ...c.hr, salary: c.hr.salary > 0 ? amount : c.hr.salary },
    log: log ?? c.log,
  };
}

/** То же по email: ставки зрителя ищем сами. */
export function displayCompensationFor(
  c: HrCompensation,
  email: string,
  rates: DisplayRates,
): HrCompensation {
  return displayCompensation(c, rates.get(emailKey(email)));
}

/** Батч «Команды» (ключ — email в нижнем регистре, как в fetchHrCompensationBatch). */
export function displayCompensationMap(
  batch: ReadonlyMap<string, HrCompensation>,
  rates: DisplayRates,
): Map<string, HrCompensation> {
  const out = new Map<string, HrCompensation>();
  for (const [em, c] of batch) out.set(em, displayCompensationFor(c, em, rates));
  return out;
}

/** Журналы для плановых пересмотров у лида (fetchHrLogsByEmail). */
export function displayLogsByEmail<T extends { hiredAt: string | null; log: HrLogRow[] }>(
  logs: ReadonlyMap<string, T>,
  rates: DisplayRates,
): Map<string, T> {
  const out = new Map<string, T>();
  for (const [em, v] of logs) {
    const amount = rates.get(emailKey(em));
    const log = amount == null ? null : startLog(v.log, [v.hiredAt], amount);
    out.set(em, log ? { ...v, log } : v);
  }
  return out;
}

/**
 * «Экономика»: записи HR человека (их бывает несколько — возвращения,
 * пересозданная карточка) и общий журнал. Ставка в карточках — сумма для
 * показа (где она была), журнал — одна стартовая ставка на первой из
 * записей. Статистику компании (ФОТ HR) не трогаем: это цифра HR целиком.
 */
export function displayEconomics(raw: HrEconomicsRaw, rates: DisplayRates): HrEconomicsRaw {
  if (!rates.size) return raw;
  const recsByEmail = new Map<string, HrEconomicsRaw['employees']>();
  for (const e of raw.employees) {
    const em = emailKey(e.email);
    if (rates.has(em)) recsByEmail.set(em, [...(recsByEmail.get(em) ?? []), e]);
  }
  if (!recsByEmail.size) return raw;

  const salaryById = new Map<string, number>();
  const dropLogsOf = new Set<string>();
  const added: HrLogRaw[] = [];
  for (const [em, recs] of recsByEmail) {
    const amount = rates.get(em)!;
    const ids = new Set(recs.map((r) => r.id));
    const own = raw.logs.filter((l) => ids.has(l.employeeId));
    const hires = recs.map((r) => r.hiredAt);
    const log = startLog(own, hires, amount);
    if (!log && !recs.some((r) => r.salary > 0)) continue;
    for (const r of recs) if (r.salary > 0) salaryById.set(r.id, amount);
    if (log) {
      for (const id of ids) dropLogsOf.add(id);
      // К записи HR, с найма которой начинается журнал; нет такой — к первой
      const anchor = recs.find((r) => r.hiredAt && day(r.hiredAt) === log[0].date) ?? recs[0];
      added.push({ employeeId: anchor.id, ...log[0] });
    }
  }
  if (!salaryById.size && !added.length) return raw;
  return {
    ...raw,
    employees: raw.employees.map((e) =>
      salaryById.has(e.id) ? { ...e, salary: salaryById.get(e.id)! } : e,
    ),
    logs: [...raw.logs.filter((l) => !dropLogsOf.has(l.employeeId)), ...added],
  };
}
