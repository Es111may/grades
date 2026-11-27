// SQL набора HR (lib/hrDataset) — одно место на два пути:
//   • живая загрузка — chQuery прямо в ClickHouse (data SQL без LIMIT);
//   • слепок через ida.hub — scripts/hr-snapshot.ts кладёт эти же SQL в план,
//     хаб их выполняет, импорт сверяет `sql` ответа с планом дословно.
// Значит, живой путь проверен самим слепком: SQL один и тот же.
//
// Правила, на которых держится сверка слепка:
//   • все колонки — строки (ifNull(toString(…), '')): контрольная сумма не
//     зависит от того, как хаб и ClickHouse печатают числа; NULL не бывает;
//   • даты — toString(toDate(…)), «нет даты» в HR — 1970-01-01;
//   • ORDER BY — по всем выходным колонкам (журнал — сначала по моменту
//     пересмотра): страницы LIMIT/OFFSET не пересекаются и не теряют строк;
//   • SQL в одну строку: хаб возвращает выполненный запрос, лишние переводы
//     строк только мешали бы сравнению.
//
// Охват — минимально нужный: сотрудники на позициях сверки состава (9, 20,
// 29 — HR_REGISTRY_POSITION_IDS) и все, чей email совпадает с почтой любого
// пользователя Грейдов (активного или нет). Журнал пересмотров — только их.
// Модуль чистый (без БД и сети): его берут и сервер, и скрипт, и тесты.

import { HR_REGISTRY_POSITION_IDS, normalizeEmail } from './hrRegistry';

export { normalizeEmail } from './hrRegistry';

/** Строк на страницу данных в плане хаба (хаб отдаёт не больше 200). */
export const HR_PAGE_SIZE = 150;

/** Колонки каждой таблицы набора — в порядке SELECT. */
export const HR_DATASET_COLUMNS = {
  employees: [
    'id',
    'email',
    'firstNameRu',
    'lastNameRu',
    'firstName',
    'lastName',
    'positionId',
    'department',
    'hiredAt',
    'dismissedAt',
    'isArchive',
    'isHourly',
    'maternityLeave',
    'salary',
    'reasonId',
    'subId',
  ],
  salaryLog: ['employeeId', 'date', 'salaryFrom', 'salaryTo'],
  reasons: ['id', 'initiator', 'title'],
  subs: ['id', 'reasonId', 'title'],
  wageFundByMonth: ['month', 'wageFund'],
  monthlyStats: [
    'id',
    'date',
    'new_employees_cnt',
    'dismissed_employees_cnt',
    'active_employees_cnt',
    'all_employees_cnt',
  ],
} as const;

export type HrDatasetKey = keyof typeof HR_DATASET_COLUMNS;

/** Таблицы в порядке плана и проверок. */
export const HR_DATASET_KEYS: readonly HrDatasetKey[] = [
  'employees',
  'salaryLog',
  'reasons',
  'subs',
  'wageFundByMonth',
  'monthlyStats',
];

/** Строка таблицы набора: все значения — строки, как их отдал SQL. */
export type HrRow<K extends HrDatasetKey> = { [C in (typeof HR_DATASET_COLUMNS)[K][number]]: string };

/** Строка без NULL. */
const s = (expr: string) => `ifNull(toString(${expr}), '')`;
/** Дата YYYY-MM-DD строкой. */
const d = (expr: string) => `ifNull(toString(toDate(${expr})), '')`;

const EXPR: { [K in HrDatasetKey]: Record<(typeof HR_DATASET_COLUMNS)[K][number], string> } = {
  employees: {
    id: s('e.id'),
    email: s('e.email'),
    firstNameRu: s('e.first_name_ru'),
    lastNameRu: s('e.last_name_ru'),
    firstName: s('e.first_name'),
    lastName: s('e.last_name'),
    positionId: s('e.position_id'),
    // Отдел — через команду, как в сверке реестра и «Экономике»
    department: s('d.name'),
    hiredAt: d('e.date_of_employee'),
    dismissedAt: d('e.date_of_dismissal'),
    isArchive: s('e.is_archive'),
    isHourly: s('e.is_hourly'),
    maternityLeave: s('e.maternity_leave'),
    salary: s('e.salary'),
    reasonId: s('e.reason_of_dismissal_id'),
    subId: s('e.reason_of_dismissal_subcategory_id'),
  },
  salaryLog: {
    employeeId: s('l.employee_id'),
    date: d('l.date_start'),
    salaryFrom: s('l.salary_start'),
    salaryTo: s('l.salary'),
  },
  reasons: {
    id: s('r.id'),
    initiator: s('r.initiator'),
    title: s('r.reason'),
  },
  subs: {
    id: s('c.id'),
    reasonId: s('c.reason_id'),
    title: s('c.title'),
  },
  // Помесячно — последняя запись месяца, как раньше в «Экономике»
  wageFundByMonth: {
    month: s('toStartOfMonth(toDate(w.date))'),
    wageFund: s('argMax(w.wage_fund, w.date)'),
  },
  monthlyStats: {
    id: s('m.id'),
    date: d('m.date'),
    new_employees_cnt: s('m.new_employees_cnt'),
    dismissed_employees_cnt: s('m.dismissed_employees_cnt'),
    active_employees_cnt: s('m.active_employees_cnt'),
    all_employees_cnt: s('m.all_employees_cnt'),
  },
};

const T = 'hr_portal_current';

const FROM: Record<HrDatasetKey, string> = {
  employees:
    `${T}.employee_employee AS e` +
    ` LEFT JOIN ${T}.employee_team AS t ON t.id = e.team_id` +
    ` LEFT JOIN ${T}.employee_department AS d ON d.id = t.department_id`,
  salaryLog: `${T}.salary_changesalarylog AS l`,
  reasons: `${T}.employee_dismissalreason AS r`,
  subs: `${T}.employee_dismissalreasonsubcategory AS c`,
  wageFundByMonth: `${T}.stats_wagefundstats AS w`,
  monthlyStats: `${T}.stats_monthlyemployeestats AS m`,
};

/** Литерал Array(String) для ClickHouse: ['a','b'] — с экранированием \ и '. */
export function arrayParam(values: readonly string[]): string {
  return `[${values.map((v) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`).join(',')}]`;
}

/** Почты охвата: нормализованы, без пустых и повторов, по алфавиту — SQL от порядка не зависит. */
export function normalizeScopeEmails(emails: readonly (string | null | undefined)[]): string[] {
  return Array.from(new Set(emails.map(normalizeEmail).filter(Boolean))).sort();
}

/** Охват сотрудников: позиции сверки или почта пользователя Грейдов. */
function scopeWhere(emails: readonly string[]): string {
  // id позиций — числа из нашего же справочника
  const positions = `e.position_id IN (${HR_REGISTRY_POSITION_IDS.map((n) => String(Math.trunc(n))).join(', ')})`;
  const scope = normalizeScopeEmails(emails);
  return scope.length ? `${positions} OR lowerUTF8(trimBoth(e.email)) IN ${arrayParam(scope)}` : positions;
}

const WHERE: Partial<Record<HrDatasetKey, (emails: readonly string[]) => string>> = {
  employees: scopeWhere,
  salaryLog: (emails) => `l.employee_id IN (SELECT e.id FROM ${T}.employee_employee AS e WHERE ${scopeWhere(emails)})`,
};

const ORDER: Partial<Record<HrDatasetKey, string>> = {
  // Журнал — по моменту пересмотра, как раньше: в один день их бывает несколько
  salaryLog: 'l.date_start',
};

/**
 * SQL таблицы набора без LIMIT. Для живой загрузки — как есть, для хаба —
 * страницами (hrPageSql) и контрольной суммой (hrChecksumSql).
 */
export function hrDataSql(key: HrDatasetKey, emails: readonly string[]): string {
  const cols: readonly string[] = HR_DATASET_COLUMNS[key];
  const expr = EXPR[key] as Record<string, string>;
  const parts = [`SELECT ${cols.map((c) => `${expr[c]} AS ${c}`).join(', ')}`, `FROM ${FROM[key]}`];
  const where = WHERE[key]?.(emails);
  if (where) parts.push(`WHERE ${where}`);
  if (key === 'wageFundByMonth') parts.push('GROUP BY month');
  parts.push(`ORDER BY ${[ORDER[key], ...cols].filter(Boolean).join(', ')}`);
  return parts.join(' ');
}

/** Страница данных: page — с 1. */
export function hrPageSql(dataSql: string, page: number, size: number = HR_PAGE_SIZE): string {
  return `${dataSql} LIMIT ${size} OFFSET ${(page - 1) * size}`;
}

/**
 * Контрольная сумма таблицы: число строк и sum(CRC32) по каждой колонке —
 * колонки уже строки, CRC32 в ClickHouse — IEEE, как zlib (lib/crc32).
 */
export function hrChecksumSql(key: HrDatasetKey, emails: readonly string[]): string {
  const cols: readonly string[] = HR_DATASET_COLUMNS[key];
  const sums = cols.map((c) => `sum(CRC32(q.${c})) AS ${c}`).join(', ');
  return `SELECT count() AS n, ${sums} FROM (${hrDataSql(key, emails)}) AS q`;
}

/** Колонки ответа на контрольную сумму. */
export function hrChecksumColumns(key: HrDatasetKey): string[] {
  return ['n', ...HR_DATASET_COLUMNS[key]];
}
