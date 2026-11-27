import { describe, expect, it } from 'vitest';
import { crc32 } from '../crc32';
import {
  HR_DATASET_COLUMNS,
  HR_DATASET_KEYS,
  HR_PAGE_SIZE,
  hrChecksumSql,
  hrDataSql,
  hrPageSql,
  inList,
  normalizeScopeEmails,
  type HrDatasetKey,
} from '../hrDatasetQueries';
import {
  CHECKSUM_PLAN_FILE,
  HrSnapshotRejected,
  buildChecksumPlan,
  buildPagesPlan,
  checksumFile,
  importSnapshotAnswers,
  pageFile,
  readChecksumAnswers,
  snapshotData,
  sqlMatches,
  tablesFromSnapshotData,
  type HrDatasetTables,
} from '../hrSnapshot';

// Все люди, почты и суммы выдуманы.
const EMAILS = ['p1@example.test', ' P2@Example.test ', 'grades.only@example.test', "o'neil@example.test"];
const PLAN = buildChecksumPlan(EMAILS, new Date('2026-11-27T07:00:00Z'));

/** 160 учёток — две страницы; остальные таблицы — по странице. */
function tables(): HrDatasetTables {
  const employees = Array.from({ length: 160 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    email: `p${i}@example.test`,
    firstNameRu: `Тест${i}`,
    lastNameRu: 'Тестов',
    firstName: `Test${i}`,
    lastName: 'Testov',
    positionId: i % 3 === 0 ? '20' : '9',
    department: i % 2 ? 'create' : 'improve',
    hiredAt: '2023-03-01',
    dismissedAt: i % 5 === 0 ? '2025-06-30' : '1970-01-01',
    isArchive: i % 7 === 0 ? '1' : '0',
    isHourly: '0',
    maternityLeave: '0',
    salary: String(100000 + i * 1000),
    reasonId: '',
    subId: '',
  }));
  return {
    employees,
    salaryLog: [
      { employeeId: employees[1].id, date: '2024-01-01', salaryFrom: '0', salaryTo: '100000' },
      { employeeId: employees[1].id, date: '2025-03-01', salaryFrom: '100000', salaryTo: '101000' },
      { employeeId: employees[2].id, date: '2025-04-01', salaryFrom: '90000', salaryTo: '102000' },
    ],
    reasons: [
      { id: '1', initiator: 'true', title: 'Условия труда' },
      { id: '3', initiator: 'false', title: 'Оптимизация' },
    ],
    subs: [{ id: 's1', reasonId: '1', title: 'Выгорание' }],
    wageFundByMonth: [
      { month: '2026-09-01', wageFund: '32000000' },
      { month: '2026-10-01', wageFund: '32500000' },
    ],
    monthlyStats: [
      {
        id: '1',
        date: '2026-10-01',
        new_employees_cnt: '6',
        dismissed_employees_cnt: '4',
        active_employees_cnt: '512',
        all_employees_cnt: '625',
      },
    ],
  };
}

const cols = (key: HrDatasetKey): readonly string[] => HR_DATASET_COLUMNS[key];
const itemsOf = (t: HrDatasetTables, key: HrDatasetKey) =>
  (t[key] as Array<Record<string, string>>).map((r) => cols(key).map((c) => r[c]));
const hub = (sql: string, columns: readonly string[], items: unknown[][]) => ({
  sql,
  columns: [...columns],
  items,
  count: items.length,
  source: 'generated',
  snippet: null,
});

/** Папка ответов «как от хаба»: суммы посчитаны по тем же строкам, хаб дописал LIMIT 200 к суммам. */
function answers(t: HrDatasetTables = tables()): Map<string, unknown> {
  const files = new Map<string, unknown>();
  files.set(CHECKSUM_PLAN_FILE, JSON.parse(JSON.stringify(PLAN)));
  for (const key of HR_DATASET_KEYS) {
    const items = itemsOf(t, key);
    const sums = cols(key).map((_, i) => items.reduce((s, it) => s + crc32(it[i]), 0));
    const q = PLAN.queries.find((x) => x.key === key)!;
    files.set(checksumFile(key), hub(`${q.sql} LIMIT 200`, ['n', ...cols(key)], [[items.length, ...sums]]));
    const data = hrDataSql(key, PLAN.emails);
    for (let page = 1; (page - 1) * HR_PAGE_SIZE < items.length; page++) {
      const slice = items.slice((page - 1) * HR_PAGE_SIZE, page * HR_PAGE_SIZE);
      files.set(pageFile(key, page), hub(hrPageSql(data, page), cols(key), slice));
    }
  }
  return files;
}

/** Отказ импорта: файл и кусок причины. */
function rejected(files: Map<string, unknown>): HrSnapshotRejected {
  try {
    importSnapshotAnswers(files);
  } catch (e) {
    if (e instanceof HrSnapshotRejected) return e;
    throw e;
  }
  throw new Error('импорт не отверг слепок');
}

const page = (files: Map<string, unknown>, name: string) =>
  files.get(name) as { sql: string; columns: string[]; items: unknown[][]; count: number };

describe('SQL набора', () => {
  it('одна строка, все колонки — строки, псевдонимы — колонки набора, ORDER BY по всем', () => {
    for (const key of HR_DATASET_KEYS) {
      const sql = hrDataSql(key, PLAN.emails);
      expect(sql).not.toMatch(/\n/);
      expect(sql).not.toMatch(/\bLIMIT\b/);
      for (const c of cols(key)) expect(sql).toContain(`), '') AS ${c}`);
      expect(sql).toMatch(new RegExp(`ORDER BY .*${cols(key).join(', ')}$`));
    }
  });

  it('охват: позиции 9, 20, 29 или почта пользователя Грейдов — литералом с экранированием', () => {
    const sql = hrDataSql('employees', PLAN.emails);
    expect(sql).toContain('e.position_id IN (9, 20, 29)');
    // Кортеж с «, » — в эту форму хаб переписывает литерал массива; сверка SQL строгая
    expect(sql).toContain(
      "lowerUTF8(trimBoth(e.email)) IN ('grades.only@example.test', 'o\\'neil@example.test', 'p1@example.test', 'p2@example.test')",
    );
    expect(sql).not.toContain('IN [');
    // Журнал — только этих учёток
    expect(hrDataSql('salaryLog', PLAN.emails)).toContain('l.employee_id IN (SELECT e.id FROM hr_portal_current.employee_employee AS e WHERE e.position_id IN (9, 20, 29) OR');
    expect(hrDataSql('salaryLog', PLAN.emails)).toContain('ORDER BY l.date_start, employeeId');
    expect(hrDataSql('salaryLog', PLAN.emails)).toContain("lowerUTF8(trimBoth(e.email)) IN ('grades.only@example.test', ");
    // Почт нет — только позиции
    expect(hrDataSql('employees', [])).not.toContain('lowerUTF8');
  });

  it('ФОТ — помесячно, последняя запись месяца', () => {
    expect(hrDataSql('wageFundByMonth', [])).toContain('argMax(w.wage_fund, w.date)');
    expect(hrDataSql('wageFundByMonth', [])).toContain('GROUP BY month');
  });

  it('контрольная сумма: count() и sum(CRC32) по каждой колонке поверх data SQL', () => {
    const sql = hrChecksumSql('reasons', []);
    expect(sql).toBe(
      `SELECT count() AS n, sum(CRC32(q.id)) AS id, sum(CRC32(q.initiator)) AS initiator, sum(CRC32(q.title)) AS title FROM (${hrDataSql('reasons', [])}) AS q`,
    );
  });

  it('inList: кортеж, разделитель «, », экранирование \\ и \'', () => {
    expect(inList(['a@x.test', 'b@x.test'])).toBe("('a@x.test', 'b@x.test')");
    expect(inList(["o'neil@x.test", 'a\\b'])).toBe("('o\\'neil@x.test', 'a\\\\b')");
  });

  it('хаб вернул охват литералом массива (старая форма) — сверка SQL это не пропускает', () => {
    const planned = hrPageSql(hrDataSql('employees', PLAN.emails), 1);
    const asArray = planned.replace(/IN \(('[^)]*')\)/, (_, list: string) => `IN [${list.split(', ').join(',')}]`);
    expect(asArray).not.toBe(planned);
    expect(sqlMatches(asArray, planned)).toBe(false);
  });

  it('страница — LIMIT 150 OFFSET', () => {
    expect(hrPageSql('SELECT 1', 3)).toBe('SELECT 1 LIMIT 150 OFFSET 300');
  });

  it('почты охвата: без регистра и пробелов, без повторов, по алфавиту', () => {
    expect(normalizeScopeEmails([' B@x.test', 'a@x.test', 'b@X.test', '', null])).toEqual(['a@x.test', 'b@x.test']);
    expect(PLAN.emails).toContain('p2@example.test');
  });
});

describe('sqlMatches', () => {
  const planned = 'SELECT count() AS n FROM (SELECT 1) AS q';
  it('дословно и с пробелами по краям — да', () => {
    expect(sqlMatches(`  ${planned}\n`, planned)).toBe(true);
  });
  it('дописанный « LIMIT 200» — да, если в плане LIMIT нет', () => {
    expect(sqlMatches(`${planned} LIMIT 200`, planned)).toBe(true);
    expect(sqlMatches(`${planned} LIMIT 10`, planned)).toBe(false);
    expect(sqlMatches(`${planned} LIMIT 150 OFFSET 0 LIMIT 200`, `${planned} LIMIT 150 OFFSET 0`)).toBe(false);
  });
  it('любая другая правка — нет', () => {
    expect(sqlMatches(planned.replace('count()', 'count(*)'), planned)).toBe(false);
    expect(sqlMatches(planned.replace(' FROM', '  FROM'), planned)).toBe(false);
    expect(sqlMatches(null, planned)).toBe(false);
  });
});

describe('импорт слепка — чистый прогон', () => {
  it('ответы сошлись: набор собран как есть, страниц у учёток две', () => {
    const t = tables();
    const r = importSnapshotAnswers(answers(t));
    expect(r.tables).toEqual(t);
    expect(r.pages.employees).toBe(2);
    expect(r.pages.salaryLog).toBe(1);
    expect(r.checksums.employees.n).toBe(160);
    expect(r.plan.emails).toEqual(PLAN.emails);
  });

  it('суммы строками (UInt64 в JSON) и без дописанного LIMIT — тоже годится', () => {
    const files = answers();
    const c = files.get(checksumFile('subs')) as { sql: string; items: unknown[][] };
    c.sql = PLAN.queries.find((q) => q.key === 'subs')!.sql;
    c.items = [c.items[0].map(String)];
    expect(() => importSnapshotAnswers(files)).not.toThrow();
  });

  it('слепок в БД и обратно — тот же набор', () => {
    const t = tables();
    expect(tablesFromSnapshotData(JSON.parse(JSON.stringify(snapshotData(t))))).toEqual(t);
  });

  it('битый слепок в БД — ошибка, а не полупустой набор', () => {
    expect(() => tablesFromSnapshotData({ format: 99 })).toThrow('формат');
    const broken = snapshotData(tables()) as unknown as Record<string, unknown>;
    delete broken.subs;
    expect(() => tablesFromSnapshotData(broken)).toThrow('subs');
    const num = JSON.parse(JSON.stringify(snapshotData(tables())));
    num.reasons[0].id = 1;
    expect(() => tablesFromSnapshotData(num)).toThrow('reasons');
  });
});

describe('импорт слепка — отказ целиком, с именем файла', () => {
  it('хаб переписал SQL страницы и вернул выдуманные строки (UNION ALL литералов)', () => {
    const files = answers();
    const p = page(files, pageFile('employees', 1));
    p.sql = "SELECT 'x' AS id, 'fake@example.test' AS email UNION ALL SELECT 'y', 'fake2@example.test'";
    const e = rejected(files);
    expect(e.file).toBe('employees.1.json');
    expect(e.message).toContain('не тот SQL');
  });

  it('хаб переписал SQL контрольной суммы', () => {
    const files = answers();
    const c = files.get(checksumFile('salaryLog')) as { sql: string };
    c.sql = c.sql.replace('sum(CRC32(q.date))', 'sum(CRC32(q.employeeId))');
    expect(rejected(files).file).toBe('checksums.salaryLog.json');
  });

  it('к странице дописан LIMIT 200 — в плане LIMIT уже есть, это не наш запрос', () => {
    const files = answers();
    page(files, pageFile('reasons', 1)).sql += ' LIMIT 200';
    expect(rejected(files).file).toBe('reasons.1.json');
  });

  it('колонки не в том порядке', () => {
    const files = answers();
    const p = page(files, pageFile('subs', 1));
    p.columns = ['reasonId', 'id', 'title'];
    const e = rejected(files);
    expect(e.file).toBe('subs.1.json');
    expect(e.message).toContain('колонки');
  });

  it('колонки не те в контрольной сумме', () => {
    const files = answers();
    (files.get(checksumFile('reasons')) as { columns: string[] }).columns = ['n', 'id', 'initiator', 'name'];
    expect(rejected(files).file).toBe('checksums.reasons.json');
  });

  it('страница вернула больше 150 строк', () => {
    const files = answers();
    const all = itemsOf(tables(), 'employees');
    page(files, pageFile('employees', 1)).items = all.slice(0, 151);
    page(files, pageFile('employees', 1)).count = 151;
    const e = rejected(files);
    expect(e.file).toBe('employees.1.json');
    expect(e.message).toContain('больше 150');
  });

  it('сумма строк по страницам не равна n', () => {
    const files = answers();
    const p = page(files, pageFile('employees', 2));
    p.items = p.items.slice(0, -1);
    p.count = p.items.length;
    const e = rejected(files);
    expect(e.file).toBe('employees.2.json');
    expect(e.message).toContain('строк на страницах 159, а в контрольной сумме 160');
  });

  it('пересчитанная sum(CRC32) колонки не равна ответу хаба', () => {
    const files = answers();
    const p = page(files, pageFile('employees', 2));
    const salary = HR_DATASET_COLUMNS.employees.indexOf('salary');
    p.items[0] = p.items[0].map((v, i) => (i === salary ? '999999' : v));
    const e = rejected(files);
    expect(e.file).toBe('checksums.employees.json');
    expect(e.message).toContain('sum(CRC32(salary))');
  });

  it('count() не равен строкам при верных суммах колонок — тоже отказ', () => {
    const files = answers();
    const c = files.get(checksumFile('subs')) as { items: unknown[][] };
    c.items = [[2, ...c.items[0].slice(1)]];
    // n = 2 — по-прежнему одна страница, а строк на ней одна
    expect(rejected(files).message).toContain('строк на страницах 1, а в контрольной сумме 2');
  });

  it('дубли строк между страницами', () => {
    const files = answers();
    const first = page(files, pageFile('employees', 1)).items[0];
    page(files, pageFile('employees', 2)).items[0] = first;
    const e = rejected(files);
    expect(e.file).toBe('employees.2.json');
    expect(e.message).toContain('employees.1.json');
  });

  it('нет файла страницы', () => {
    const files = answers();
    files.delete(pageFile('employees', 2));
    const e = rejected(files);
    expect(e.file).toBe('employees.2.json');
    expect(e.message).toContain('нет файла');
  });

  it('нет плана', () => {
    const files = answers();
    files.delete(CHECKSUM_PLAN_FILE);
    expect(rejected(files).file).toBe(CHECKSUM_PLAN_FILE);
  });

  it('лишний файл страницы — путаница папок', () => {
    const files = answers();
    files.set(pageFile('employees', 3), page(files, pageFile('employees', 2)));
    expect(rejected(files).file).toBe('employees.3.json');
  });

  it('значение не строкой', () => {
    const files = answers();
    const p = page(files, pageFile('monthlyStats', 1));
    p.items[0] = p.items[0].map((v, i) => (i === 2 ? 6 : v));
    expect(rejected(files).message).toContain('не строкой');
  });

  it('план правили руками — SQL не из его почт', () => {
    const files = answers();
    const plan = files.get(CHECKSUM_PLAN_FILE) as { emails: string[] };
    plan.emails = [...plan.emails, 'z@example.test'];
    const e = rejected(files);
    expect(e.file).toBe(CHECKSUM_PLAN_FILE);
    expect(e.message).toContain('SQL не совпадают');
  });

  it('HR без единой учётки — скорее сломан запрос', () => {
    const t = { ...tables(), employees: [], salaryLog: [] };
    expect(rejected(answers(t)).file).toBe('checksums.employees.json');
  });
});

describe('план страниц (шаг 2)', () => {
  it('страниц ровно столько, чтобы покрыть n; пустая таблица — без страниц', () => {
    const files = answers({ ...tables(), subs: [] });
    const sums = readChecksumAnswers(PLAN, files);
    const pages = buildPagesPlan(PLAN, sums, new Date('2026-11-27T07:10:00Z'));
    const count = (key: HrDatasetKey) => pages.pages.filter((p) => p.key === key).length;
    expect(count('employees')).toBe(2);
    expect(count('salaryLog')).toBe(1);
    expect(count('subs')).toBe(0);
    expect(pages.counts.employees).toBe(160);
    expect(pages.pages[1]).toEqual({
      key: 'employees',
      page: 2,
      file: 'employees.2.json',
      sql: `${hrDataSql('employees', PLAN.emails)} LIMIT 150 OFFSET 150`,
    });
  });
});
