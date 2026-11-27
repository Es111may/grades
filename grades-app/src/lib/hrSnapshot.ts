// Слепок HR через ida.hub — чистые функции, без БД, сети и файлов.
//
// Сервер Грейдов в хаб не ходит: запросы делает человек (или Claude с его
// доступом) через dwh_ask и кладёт ответы JSON-файлами в папку. Здесь:
//   • форма таблиц набора и hr_snapshots.data;
//   • план контрольных сумм и план страниц (SQL — lib/hrDatasetQueries);
//   • проверка ответов хаба перед записью слепка.
// Файлы и запись в БД — scripts/hr-snapshot.ts.
//
// Хаб однажды переписал запрос и вернул выдуманные строки, поэтому импорт
// отвергает слепок целиком, если хоть что-то не так: `sql` ответа не тот,
// что в плане (допустимы пробелы по краям и дописанный хабом « LIMIT 200»),
// не те колонки, страница длиннее HR_PAGE_SIZE, строк в сумме не n, одна
// строка на двух страницах, count/sum(CRC32) по колонкам не сходятся с
// ответом хаба.

import { crc32 } from './crc32';
import {
  HR_DATASET_COLUMNS,
  HR_DATASET_KEYS,
  HR_PAGE_SIZE,
  hrChecksumColumns,
  hrChecksumSql,
  hrDataSql,
  hrPageSql,
  normalizeScopeEmails,
  type HrDatasetKey,
  type HrRow,
} from './hrDatasetQueries';

// ── Таблицы набора и hr_snapshots.data ──────────────────────────────────

/** Таблицы набора HR — то, что хранит слепок в hr_snapshots.data. */
export type HrDatasetTables = {
  /** Учётки HR (с дублями): позиции сверки + почты пользователей Грейдов. Отдел — через команду. */
  employees: HrRow<'employees'>[];
  /** Журнал пересмотров этих учёток — по моменту пересмотра. */
  salaryLog: HrRow<'salaryLog'>[];
  /** Справочник причин ухода. */
  reasons: HrRow<'reasons'>[];
  /** Подкатегории причин ухода. */
  subs: HrRow<'subs'>[];
  /** ФОТ компании помесячно (последняя запись месяца). */
  wageFundByMonth: HrRow<'wageFundByMonth'>[];
  /** Помесячная статистика компании: численность, наймы, уходы. */
  monthlyStats: HrRow<'monthlyStats'>[];
};

/** Версия формата hr_snapshots.data. */
export const HR_SNAPSHOT_FORMAT = 1;

/** Откуда слепок (hr_snapshots.source). */
export const HR_SNAPSHOT_SOURCE = 'ida-hub';

/** Сколько слепков храним: при записи нового старшие удаляются. */
export const HR_SNAPSHOTS_KEPT = 5;

export function emptyTables(): HrDatasetTables {
  return { employees: [], salaryLog: [], reasons: [], subs: [], wageFundByMonth: [], monthlyStats: [] };
}

/**
 * Строки таблицы из объектов (живой ClickHouse, слепок из БД) — ровно
 * колонки набора, значения строками. Колонки нет — ошибка: набор без неё
 * не нужен.
 */
export function rowsFromObjects<K extends HrDatasetKey>(key: K, rows: readonly unknown[]): HrRow<K>[] {
  const cols: readonly string[] = HR_DATASET_COLUMNS[key];
  return rows.map((r, i) => {
    if (!r || typeof r !== 'object') throw new Error(`HR ${key}: строка ${i + 1} — не объект`);
    const out: Record<string, string> = {};
    for (const c of cols) {
      const v = (r as Record<string, unknown>)[c];
      if (v === undefined) throw new Error(`HR ${key}: нет колонки ${c}`);
      out[c] = v == null ? '' : String(v);
    }
    return out as HrRow<K>;
  });
}

/** Строки из массивов ответа хаба (columns + items) — порядок колонок уже проверен. */
export function rowsFromItems<K extends HrDatasetKey>(key: K, items: readonly (readonly string[])[]): HrRow<K>[] {
  const cols: readonly string[] = HR_DATASET_COLUMNS[key];
  return items.map((item) => Object.fromEntries(cols.map((c, i) => [c, item[i]])) as HrRow<K>);
}

/** Содержимое hr_snapshots.data. */
export function snapshotData(tables: HrDatasetTables): { format: number } & HrDatasetTables {
  return { format: HR_SNAPSHOT_FORMAT, ...tables };
}

/**
 * Таблицы из hr_snapshots.data — с проверкой формы: битый или чужой формат
 * — ошибка, а не полупустой набор.
 */
export function tablesFromSnapshotData(data: unknown): HrDatasetTables {
  if (!data || typeof data !== 'object') throw new Error('слепок HR: data — не объект');
  const obj = data as Record<string, unknown>;
  if (obj.format !== HR_SNAPSHOT_FORMAT) throw new Error(`слепок HR: неизвестный формат ${String(obj.format)}`);
  const tables = emptyTables();
  for (const key of HR_DATASET_KEYS) {
    const rows = obj[key];
    if (!Array.isArray(rows)) throw new Error(`слепок HR: нет таблицы ${key}`);
    const cols: readonly string[] = HR_DATASET_COLUMNS[key];
    for (const r of rows) {
      if (!r || typeof r !== 'object' || cols.some((c) => typeof (r as Record<string, unknown>)[c] !== 'string')) {
        throw new Error(`слепок HR: строка ${key} не в формате набора`);
      }
    }
    (tables as Record<HrDatasetKey, unknown[]>)[key] = rowsFromObjects(key, rows);
  }
  return tables;
}

// ── Файлы плана и ответов ───────────────────────────────────────────────

export const CHECKSUM_PLAN_FILE = 'checksums.plan.json';
export const PAGES_PLAN_FILE = 'pages.plan.json';
export const checksumFile = (key: HrDatasetKey) => `checksums.${key}.json`;
export const pageFile = (key: HrDatasetKey, page: number) => `${key}.${page}.json`;

/** Слепок отвергнут: что не так и в каком файле. */
export class HrSnapshotRejected extends Error {
  constructor(
    readonly file: string,
    reason: string,
  ) {
    super(`${file}: ${reason}`);
    this.name = 'HrSnapshotRejected';
  }
}

function reject(file: string, reason: string): never {
  throw new HrSnapshotRejected(file, reason);
}

// ── Шаг 1. План контрольных сумм ────────────────────────────────────────

export type ChecksumPlan = {
  kind: 'hr-snapshot-checksums';
  format: number;
  createdAt: string;
  /** Почты пользователей Грейдов — охват набора; из них собраны все SQL. */
  emails: string[];
  queries: Array<{ key: HrDatasetKey; file: string; sql: string }>;
};

export function buildChecksumPlan(emails: readonly string[], now: Date = new Date()): ChecksumPlan {
  const scope = normalizeScopeEmails(emails);
  return {
    kind: 'hr-snapshot-checksums',
    format: HR_SNAPSHOT_FORMAT,
    createdAt: now.toISOString(),
    emails: scope,
    queries: HR_DATASET_KEYS.map((key) => ({ key, file: checksumFile(key), sql: hrChecksumSql(key, scope) })),
  };
}

/**
 * План с диска: формат и что каждый SQL собран из его же почт текущим
 * кодом — поправленный руками план или план от другой версии не пройдёт.
 */
export function readChecksumPlan(raw: unknown): ChecksumPlan {
  const f = CHECKSUM_PLAN_FILE;
  if (!raw || typeof raw !== 'object') return reject(f, 'не объект');
  const p = raw as Partial<ChecksumPlan>;
  if (p.kind !== 'hr-snapshot-checksums' || p.format !== HR_SNAPSHOT_FORMAT) {
    return reject(f, 'не план контрольных сумм этой версии — пересоздай шагом --checksums');
  }
  if (!Array.isArray(p.emails) || p.emails.some((e) => typeof e !== 'string')) return reject(f, 'нет списка почт');
  const expected = buildChecksumPlan(p.emails);
  if (JSON.stringify(expected.emails) !== JSON.stringify(p.emails)) {
    return reject(f, 'почты не нормализованы — план правили руками; пересоздай шагом --checksums');
  }
  const queries = Array.isArray(p.queries) ? p.queries : [];
  if (
    queries.length !== expected.queries.length ||
    expected.queries.some((q, i) => queries[i]?.key !== q.key || queries[i]?.file !== q.file || queries[i]?.sql !== q.sql)
  ) {
    return reject(f, 'SQL не совпадают с кодом — план правили руками или он от другой версии; пересоздай шагом --checksums');
  }
  return { ...expected, createdAt: typeof p.createdAt === 'string' ? p.createdAt : expected.createdAt };
}

// ── Ответ хаба ──────────────────────────────────────────────────────────

/**
 * Совпадает ли выполненный хабом SQL с запланированным: дословно, с
 * точностью до пробелов по краям. Если в плане LIMIT нет, хаб дописывает
 * « LIMIT 200» — это допустимо; всё остальное — нет.
 */
export function sqlMatches(got: unknown, planned: string): boolean {
  if (typeof got !== 'string') return false;
  const a = got.trim();
  const b = planned.trim();
  if (a === b) return true;
  if (/\bLIMIT\b/i.test(b) || !a.startsWith(b)) return false;
  return /^\s+LIMIT 200$/.test(a.slice(b.length));
}

/** Общая проверка ответа: SQL, колонки, форма строк. Возвращает items. */
function readAnswer(file: string, answer: unknown, plannedSql: string, columns: readonly string[]): unknown[][] {
  if (answer === undefined) return reject(file, 'нет файла — сделай запрос из плана и сохрани ответ хаба как есть');
  if (!answer || typeof answer !== 'object') return reject(file, 'не ответ хаба (ждём объект с sql, columns, items)');
  const a = answer as Record<string, unknown>;
  if (!sqlMatches(a.sql, plannedSql)) {
    return reject(file, 'хаб выполнил не тот SQL, что в плане (переписал запрос?) — ответ не годится, повтори запрос');
  }
  const cols = a.columns;
  if (!Array.isArray(cols) || cols.length !== columns.length || cols.some((c, i) => c !== columns[i])) {
    return reject(file, `колонки не те или не в том порядке: ждём ${columns.join(', ')}`);
  }
  if (!Array.isArray(a.items) || a.items.some((it) => !Array.isArray(it) || it.length !== columns.length)) {
    return reject(file, `items — не массив строк по ${columns.length} значений`);
  }
  return a.items as unknown[][];
}

export type Checksum = {
  /** Строк в таблице. */
  n: number;
  /** sum(CRC32) по колонкам. */
  sums: Record<string, number>;
};

/** Целое ≥ 0 из ответа: UInt64 хаб отдаёт числом или строкой. */
function toCount(file: string, col: string, v: unknown): bigint {
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  return reject(file, `${col} — не целое число`);
}

function toSafe(file: string, col: string, v: bigint): number {
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) return reject(file, `${col} — слишком большое число`);
  return Number(v);
}

/** Ответ хаба на контрольную сумму таблицы: одна строка — n и sum(CRC32) по колонкам. */
export function readChecksumAnswer(key: HrDatasetKey, answer: unknown, plannedSql: string): Checksum {
  const file = checksumFile(key);
  const cols = hrChecksumColumns(key);
  const items = readAnswer(file, answer, plannedSql, cols);
  if (items.length !== 1) return reject(file, `ждём одну строку, пришло ${items.length}`);
  const [row] = items;
  const sums: Record<string, number> = {};
  cols.slice(1).forEach((c, i) => {
    sums[c] = toSafe(file, c, toCount(file, c, row[i + 1]));
  });
  return { n: toSafe(file, 'n', toCount(file, 'n', row[0])), sums };
}

// ── Шаг 2. План страниц ─────────────────────────────────────────────────

export type PagesPlan = {
  kind: 'hr-snapshot-pages';
  format: number;
  createdAt: string;
  pageSize: number;
  /** Строк в таблице — из ответов на контрольные суммы. */
  counts: Record<HrDatasetKey, number>;
  pages: Array<{ key: HrDatasetKey; page: number; file: string; sql: string }>;
};

/** Сколько страниц покрывает n строк. */
export const pagesFor = (n: number, size: number = HR_PAGE_SIZE) => Math.ceil(n / size);

export function buildPagesPlan(
  plan: ChecksumPlan,
  checksums: Record<HrDatasetKey, Checksum>,
  now: Date = new Date(),
): PagesPlan {
  const pages: PagesPlan['pages'] = [];
  const counts = {} as Record<HrDatasetKey, number>;
  for (const key of HR_DATASET_KEYS) {
    const n = checksums[key].n;
    counts[key] = n;
    const data = hrDataSql(key, plan.emails);
    for (let page = 1; page <= pagesFor(n); page++) {
      pages.push({ key, page, file: pageFile(key, page), sql: hrPageSql(data, page) });
    }
  }
  return {
    kind: 'hr-snapshot-pages',
    format: HR_SNAPSHOT_FORMAT,
    createdAt: now.toISOString(),
    pageSize: HR_PAGE_SIZE,
    counts,
    pages,
  };
}

/** Все контрольные суммы из ответов хаба (шаги 2 и 3). */
export function readChecksumAnswers(
  plan: ChecksumPlan,
  files: ReadonlyMap<string, unknown>,
): Record<HrDatasetKey, Checksum> {
  const out = {} as Record<HrDatasetKey, Checksum>;
  for (const q of plan.queries) out[q.key] = readChecksumAnswer(q.key, files.get(q.file), q.sql);
  return out;
}

// ── Шаг 3. Импорт ───────────────────────────────────────────────────────

export type SnapshotImport = {
  plan: ChecksumPlan;
  tables: HrDatasetTables;
  checksums: Record<HrDatasetKey, Checksum>;
  /** Страниц по таблицам. */
  pages: Record<HrDatasetKey, number>;
};

/**
 * Проверить папку ответов и собрать набор. files — имя → разобранный JSON
 * (все *.json папки). Любое расхождение — HrSnapshotRejected с именем файла;
 * слепок тогда не пишется вовсе.
 */
export function importSnapshotAnswers(files: ReadonlyMap<string, unknown>): SnapshotImport {
  const planRaw = files.get(CHECKSUM_PLAN_FILE);
  if (planRaw === undefined) reject(CHECKSUM_PLAN_FILE, 'нет плана — сначала шаг --checksums');
  const plan = readChecksumPlan(planRaw);
  const checksums = readChecksumAnswers(plan, files);
  if (checksums.employees.n === 0) {
    reject(checksumFile('employees'), 'HR не вернул ни одной учётки — скорее сломан запрос, чем пусто в HR');
  }

  // Лишние файлы страниц и сумм — признак путаницы (старая папка, чужой план)
  const expected = new Set<string>([CHECKSUM_PLAN_FILE, PAGES_PLAN_FILE, ...plan.queries.map((q) => q.file)]);
  for (const key of HR_DATASET_KEYS) {
    for (let page = 1; page <= pagesFor(checksums[key].n); page++) expected.add(pageFile(key, page));
  }
  for (const name of files.keys()) {
    if (!expected.has(name) && (/^checksums\..+\.json$/.test(name) || /^[A-Za-z]+\.\d+\.json$/.test(name))) {
      reject(name, 'файла нет в плане — убери его из папки (или пересоздай план)');
    }
  }

  const tables: HrDatasetTables = emptyTables();
  const pages = {} as Record<HrDatasetKey, number>;
  for (const key of HR_DATASET_KEYS) {
    const cols: readonly string[] = HR_DATASET_COLUMNS[key];
    const want = checksums[key];
    const data = hrDataSql(key, plan.emails);
    const total = pagesFor(want.n);
    pages[key] = total;

    const all: string[][] = [];
    const seen = new Map<string, string>();
    for (let page = 1; page <= total; page++) {
      const file = pageFile(key, page);
      const answer = files.get(file);
      const items = readAnswer(file, answer, hrPageSql(data, page), cols);
      if (items.length > HR_PAGE_SIZE) {
        reject(file, `на странице ${items.length} строк — больше ${HR_PAGE_SIZE}: хаб выполнил не тот LIMIT`);
      }
      for (const item of items) {
        if (item.some((v) => typeof v !== 'string')) {
          reject(file, 'значение не строкой — в плане все колонки toString(); ответ правили или хаб сменил формат');
        }
        const sig = JSON.stringify(item);
        const prev = seen.get(sig);
        if (prev !== undefined && prev !== file) {
          reject(file, `та же строка, что в ${prev}: страницы пересеклись — повтори запросы страниц`);
        }
        seen.set(sig, file);
        all.push(item as string[]);
      }
    }

    if (all.length !== want.n) {
      reject(
        total ? pageFile(key, total) : checksumFile(key),
        `строк на страницах ${all.length}, а в контрольной сумме ${want.n} — страница потеряна или обрезана`,
      );
    }
    // Локальная контрольная сумма — CRC32 над UTF-8, как у ClickHouse
    cols.forEach((c, i) => {
      let sum = BigInt(0);
      for (const item of all) sum += BigInt(crc32(item[i]));
      if (sum !== BigInt(want.sums[c])) {
        reject(checksumFile(key), `sum(CRC32(${c})) не сошлась со строками страниц — данные на страницах не те`);
      }
    });
    (tables as Record<HrDatasetKey, unknown[]>)[key] = rowsFromItems(key, all);
  }
  return { plan, tables, checksums, pages };
}
