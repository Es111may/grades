// Выборка HR-портала для «Экономики» (Phase 23.6b) — только сервер.
//
// Источник — ClickHouse-копия HR (`hr_portal_current`), та же, что у
// «Зарплаты». Семь запросов параллельно, кэш perfCache под одним ключом на
// набор email (stale-while-revalidate до 6 ч). Расчёты — в lib/economics,
// здесь только SQL и приведение строк к типам.
//
// Контур задают Грейды: сотрудников и журнал ставок берём по email людей
// контура — с любой позицией в HR (лид может числиться в Backoffice).
// Позиции 9 «Design» и 20 «Lead Designer» — только для справки «работают
// в HR дизайнерами, но нет в «Команде»», с тем же контуром, что у сверки
// реестра (lib/hrRegistry): без Lite и дизайн-инженеров, без декрета. Обязательны
// сотрудники и журнал; справочник причин, статистика компании и справка —
// по возможности: без них страница рисуется, но без причин и доли в ФОТ.
//
// Если HR не ответил, а кэш perfCache уже выдохся, страница берёт последнюю
// удачную выборку процесса (lastGood) с меткой «Данные от …».

import { chQuery } from './clickhouse';
import { HR_DESIGN_POSITION_IDS, isDesignContour } from './hrRegistry';
import { DEFAULT_TTL_MS, PAGE_BUDGET_MS, getOrCompute, makeEmailsCacheKey, withTimeout } from './perfCache';
import type {
  CompanyStats,
  HrEconomicsRaw,
  HrEmployeeRaw,
  HrLogRaw,
  HrReasonRaw,
  HrSubRaw,
} from './economics';

/** Дизайнерские позиции — из справочника сверки реестра: 9 и 20, без 29. */
export const DESIGN_POSITION_IDS: readonly string[] = HR_DESIGN_POSITION_IDS.map(String);
const POSITIONS_SQL = `toString(e.position_id) IN (${DESIGN_POSITION_IDS.map((p) => `'${p}'`).join(', ')})`;
// v3: справка «нет в «Команде»» — без Lite, дизайн-инженеров и декрета
const CACHE_PREFIX = 'hr-economics:v3';

/** Последняя удачная выборка — живёт, пока жив процесс. */
let lastGood: HrEconomicsRaw | null = null;

type Cell = string | number | boolean | null | undefined;

const str = (v: Cell): string => (v == null ? '' : String(v));
const numOr0 = (v: Cell): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const flag = (v: Cell): boolean => v === true || v === 1 || v === '1' || v === 'true';
/** 1970-01-01 и пустое в HR — «даты нет». */
const date = (v: Cell): string | null => {
  const s = str(v).slice(0, 10);
  return s && s >= '2000' ? s : null;
};
/** Ссылка на справочник: пусто, 0 и нулевой UUID — «не заполнено». */
const id = (v: Cell): string | null => {
  const s = str(v).trim();
  return s && s !== '\\N' && !/^[0-]+$/.test(s) ? s : null;
};

export function toEmployee(r: Record<string, Cell>): HrEmployeeRaw {
  return {
    id: str(r.id),
    email: str(r.em).trim().toLowerCase(),
    firstName: str(r.fn).trim(),
    lastName: str(r.ln).trim(),
    positionId: str(r.pos),
    department: str(r.dept),
    hiredAt: date(r.hired),
    dismissedAt: date(r.dismissed),
    archived: flag(r.arch),
    salary: numOr0(r.salary),
    reasonId: id(r.reason),
    subId: id(r.sub),
  };
}

export function toLog(r: Record<string, Cell>): HrLogRaw {
  return { employeeId: str(r.id), date: str(r.d).slice(0, 10), from: numOr0(r.f), to: numOr0(r.t) };
}

export function toReason(r: Record<string, Cell>): HrReasonRaw {
  const v = r.initiator;
  const initiator = v === true ? 1 : v === false ? 0 : v == null || v === '' ? null : Number(v);
  return {
    id: str(r.id),
    initiator: initiator === 0 || initiator === 1 ? initiator : null,
    title: str(r.title),
  };
}

export function toSub(r: Record<string, Cell>): HrSubRaw {
  return { id: str(r.id), reasonId: str(r.rid), title: str(r.title) };
}

/**
 * Помесячная статистика компании. Колонки stats_monthlyemployeestats
 * берём по смыслу имени (dismissed / active / all): точные названия в HR
 * менялись, а запрос «SELECT *» переживает переименование.
 */
export function toCompany(
  wage: Array<Record<string, Cell>>,
  monthly: Array<Record<string, Cell>>,
): CompanyStats {
  const fotByMonth: Record<string, number> = {};
  for (const r of wage) {
    const m = str(r.m).slice(0, 7);
    const v = numOr0(r.v);
    if (m && v > 0) fotByMonth[m] = v;
  }
  const headcountByMonth: Record<string, number> = {};
  const exitsByMonth: Record<string, number> = {};
  const cols = monthly.length ? Object.keys(monthly[0]) : [];
  const pick = (re: RegExp) => cols.find((c) => re.test(c));
  const dateCol = pick(/^date$/i) ?? pick(/date|month/i);
  const exitsCol = pick(/dismiss/i);
  const activeCol = pick(/active/i) ?? pick(/^all|total/i);
  if (dateCol && exitsCol && activeCol) {
    for (const r of monthly) {
      const m = str(r[dateCol]).slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(m)) continue;
      headcountByMonth[m] = numOr0(r[activeCol]);
      exitsByMonth[m] = numOr0(r[exitsCol]);
    }
  }
  return { fotByMonth, headcountByMonth, exitsByMonth };
}

/** Литерал Array(String) для параметра ClickHouse: ['a','b'] — как в hrSalary. */
export function arrayParam(values: string[]): string {
  return `[${values.map((v) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`).join(',')}]`;
}

const BY_EMAIL = 'lowerUTF8(e.email) IN {emails:Array(String)}';

const EMPLOYEES_SQL = (full: boolean) => `
  SELECT toString(e.id) AS id, lowerUTF8(e.email) AS em,
         e.first_name_ru AS fn, e.last_name_ru AS ln, toString(e.position_id) AS pos,
         ${full ? 'd.name' : "''"} AS dept,
         toString(toDate(e.date_of_employee)) AS hired,
         toString(toDate(e.date_of_dismissal)) AS dismissed,
         e.is_archive AS arch, e.salary AS salary,
         toString(e.reason_of_dismissal_id) AS reason,
         toString(e.reason_of_dismissal_subcategory_id) AS sub
    FROM hr_portal_current.employee_employee AS e
    ${full ? `LEFT JOIN hr_portal_current.employee_team AS t ON t.id = e.team_id
    LEFT JOIN hr_portal_current.employee_department AS d ON d.id = t.department_id` : ''}
   WHERE ${BY_EMAIL}`;

/**
 * Сотрудники по email. Отдел HR (через команду, как в lib/hrRegistry) — по
 * возможности: если в HR переименовали справочник, берём без него (отдел
 * есть и в Грейдах).
 */
async function fetchEmployees(params: Record<string, string>): Promise<Array<Record<string, Cell>>> {
  try {
    return await chQuery<Record<string, Cell>>(EMPLOYEES_SQL(true), params);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/Unknown (identifier|table|column)|Missing columns|no column|UNKNOWN_IDENTIFIER|UNKNOWN_TABLE/i.test(msg)) {
      throw err;
    }
    console.error('[hrEconomics] employees: fallback without department:', msg.slice(0, 200));
    return chQuery<Record<string, Cell>>(EMPLOYEES_SQL(false), params);
  }
}

/**
 * Email работающих в HR в контуре дизайна: позиция 9 или 20, не отдел Lite
 * (isDesignContour), не в декрете, не архив и без даты увольнения.
 */
export function toDesignWorking(rows: Array<Record<string, Cell>>): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    const em = str(r.em).trim().toLowerCase();
    if (!em || date(r.dismissed) || flag(r.arch) || flag(r.mat)) continue;
    if (isDesignContour({ positionId: r.pos, department: r.dept })) out.add(em);
  }
  return Array.from(out);
}

/**
 * Работающие на дизайнерских позициях — для справки. Отдел — через команду,
 * как в сверке реестра. Справка по возможности: не прошёл запрос — справки
 * нет (лучше, чем число с Lite внутри).
 */
const DESIGN_SQL = `
  SELECT lowerUTF8(e.email) AS em, toString(e.position_id) AS pos, d.name AS dept,
         toString(toDate(e.date_of_dismissal)) AS dismissed,
         e.is_archive AS arch, e.maternity_leave AS mat
    FROM hr_portal_current.employee_employee AS e
    LEFT JOIN hr_portal_current.employee_team AS t ON t.id = e.team_id
    LEFT JOIN hr_portal_current.employee_department AS d ON d.id = t.department_id
   WHERE ${POSITIONS_SQL}`;

async function optional<T>(label: string, p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error(`[hrEconomics] ${label} failed:`, err);
    return fallback;
  }
}

/**
 * Вся выборка «Экономики» одним заходом по email людей контура. Кэш 15 минут
 * на набор email (порядок не важен).
 */
export async function fetchHrEconomics(emails: string[]): Promise<HrEconomicsRaw> {
  const unique = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  const params = { emails: arrayParam(unique) };
  const none = Promise.resolve<Array<Record<string, Cell>>>([]);
  return getOrCompute(
    makeEmailsCacheKey(CACHE_PREFIX, unique),
    async () => {
      const [emps, logs, design, reasons, subs, wage, monthly] = await Promise.all([
        unique.length ? fetchEmployees(params) : none,
        unique.length
          ? chQuery<Record<string, Cell>>(
              `SELECT toString(employee_id) AS id, toString(toDate(date_start)) AS d,
                      salary_start AS f, salary AS t
                 FROM hr_portal_current.salary_changesalarylog
                WHERE employee_id IN (
                        SELECT e.id FROM hr_portal_current.employee_employee AS e WHERE ${BY_EMAIL})
                ORDER BY date_start`,
              params,
            )
          : none,
        optional('design positions', chQuery<Record<string, Cell>>(DESIGN_SQL), []),
        optional(
          'reasons',
          chQuery<Record<string, Cell>>(
            `SELECT toString(id) AS id, initiator, reason AS title
               FROM hr_portal_current.employee_dismissalreason`,
          ),
          [],
        ),
        optional(
          'reason subcategories',
          chQuery<Record<string, Cell>>(
            `SELECT toString(id) AS id, toString(reason_id) AS rid, title
               FROM hr_portal_current.employee_dismissalreasonsubcategory`,
          ),
          [],
        ),
        optional(
          'company wage fund',
          chQuery<Record<string, Cell>>(
            `SELECT toString(toStartOfMonth(toDate(date))) AS m, argMax(wage_fund, date) AS v
               FROM hr_portal_current.stats_wagefundstats
              GROUP BY m
              ORDER BY m`,
          ),
          [],
        ),
        optional(
          'company monthly stats',
          chQuery<Record<string, Cell>>(
            `SELECT * FROM hr_portal_current.stats_monthlyemployeestats ORDER BY date`,
          ),
          [],
        ),
      ]);
      const raw: HrEconomicsRaw = {
        employees: emps.map(toEmployee),
        designWorkingEmails: toDesignWorking(design),
        logs: logs.map(toLog),
        reasons: reasons.map(toReason),
        subs: subs.map(toSub),
        company: toCompany(wage, monthly),
        fetchedAt: new Date().toISOString(),
      };
      lastGood = raw;
      return raw;
    },
    DEFAULT_TTL_MS,
  );
}

export type HrEconomicsLoad = {
  raw: HrEconomicsRaw | null;
  /** HR сейчас не ответил — показываем последнюю удачную выборку. */
  stale: boolean;
  error: string | null;
};

/**
 * Для страницы: ждём не дольше бюджета. Не успели или HR упал — отдаём
 * последнюю удачную выборку процесса, если она есть (набор email мог с тех
 * пор измениться: новые люди тогда временно «нет в HR»); запрос, не
 * уложившийся в бюджет, дорабатывает в фоне и кладёт результат в кэш.
 */
export async function loadHrEconomics(
  emails: string[],
  budgetMs: number = PAGE_BUDGET_MS,
): Promise<HrEconomicsLoad> {
  try {
    const raw = await withTimeout(fetchHrEconomics(emails), budgetMs, 'HR economics');
    return { raw, stale: false, error: null };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[hrEconomics] load failed:', error);
    return { raw: lastGood, stale: lastGood != null, error };
  }
}

/** Только для тестов. */
export function resetHrEconomicsForTests(): void {
  lastGood = null;
}
