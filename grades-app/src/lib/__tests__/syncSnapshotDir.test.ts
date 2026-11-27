import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

// Сверка по папке ответов ida.hub (--snapshot-dir) и по слепку в БД из тех
// же ответов. Ни ClickHouse, ни Postgres: БД — поддельная, слепок в ней —
// то, что записал бы hr-snapshot.ts --import --apply.
const findFirstSnapshot = vi.fn();
vi.mock('../clickhouse', () => ({ chQuery: vi.fn() }));
vi.mock('../db', () => ({
  prisma: {
    hrSnapshot: { findFirst: (...a: unknown[]) => findFirstSnapshot(...a) },
    user: { findMany: vi.fn() },
  },
}));

import { loadHrForSync, parseArgs, planFingerprint, toHrPerson } from '../../../scripts/sync-hr-registry';
import { readAnswersDir, saveSnapshot } from '../../../scripts/hr-snapshot';
import { crc32 } from '../crc32';
import { HR_DATASET_COLUMNS, HR_DATASET_KEYS, HR_PAGE_SIZE, hrDataSql, hrPageSql } from '../hrDatasetQueries';
import { resetHrDatasetForTests } from '../hrDataset';
import { planRegistrySync, type GradesUser } from '../hrRegistry';
import {
  CHECKSUM_PLAN_FILE,
  buildChecksumPlan,
  checksumFile,
  importSnapshotAnswers,
  pageFile,
  type HrDatasetTables,
} from '../hrSnapshot';
import { clearCache } from '../perfCache';

// Все люди, почты и суммы выдуманы.
const USERS: GradesUser[] = [
  { id: 1, email: 'admin@example.test', fullName: 'Админ Тестовый', active: true, role: 'admin', employmentType: 'staff', hiredAt: '2020-01-01T00:00:00.000Z', dismissedAt: null },
  { id: 2, email: 'cur@example.test', fullName: 'Нынешний Тестов', active: true, role: 'designer', employmentType: 'staff', hiredAt: null, dismissedAt: null },
  { id: 3, email: 'left@example.test', fullName: 'Ушедший Тестов', active: true, role: 'designer', employmentType: 'staff', hiredAt: '2022-01-10T00:00:00.000Z', dismissedAt: null },
  { id: 4, email: 'maria.old@example.test', fullName: 'Мария Образцова', active: true, role: 'designer', employmentType: 'staff', hiredAt: null, dismissedAt: null },
];

let seq = 0;
const emp = (email: string, ru: [string, string], over: Record<string, string> = {}) => ({
  id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  email,
  firstNameRu: ru[0],
  lastNameRu: ru[1],
  firstName: '',
  lastName: '',
  positionId: '9',
  department: 'create',
  hiredAt: '2023-03-01',
  dismissedAt: '1970-01-01',
  isArchive: '0',
  isHourly: '0',
  maternityLeave: '0',
  salary: '150000',
  reasonId: '',
  subId: '',
  ...over,
});

function tables(): HrDatasetTables {
  seq = 0;
  return {
    employees: [
      emp('admin@example.test', ['Админ', 'Тестовый'], { positionId: '4', dismissedAt: '2026-11-01', isArchive: '1' }),
      emp('cur@example.test', ['Нынешний', 'Тестов'], { hiredAt: '2023-05-02' }),
      emp('left@example.test', ['Ушедший', 'Тестов'], { dismissedAt: '2026-10-15', isArchive: '1' }),
      emp('maria.new@example.test', ['Мария', 'Образцова'], { hiredAt: '2024-04-15' }),
      emp('new@example.test', ['Новая', 'Дизайнер'], { hiredAt: '2026-11-10', department: 'design.inhouse' }),
      emp('gone@example.test', ['Ушла', 'Летом'], { dismissedAt: '2025-07-31', isArchive: '1', positionId: '20', department: 'improve' }),
      // Давно ушедшие — чтобы учёток было на две страницы
      ...Array.from({ length: 150 }, (_, i) =>
        emp(`old${i}@example.test`, [`Давний${i}`, 'Архивный'], { hiredAt: '2018-01-01', dismissedAt: '2024-06-30', isArchive: '1' }),
      ),
    ],
    salaryLog: [{ employeeId: '00000000-0000-4000-8000-000000000002', date: '2023-05-02', salaryFrom: '0', salaryTo: '150000' }],
    reasons: [{ id: '1', initiator: 'true', title: 'Условия труда' }],
    subs: [],
    wageFundByMonth: [{ month: '2026-10-01', wageFund: '32000000' }],
    monthlyStats: [],
  };
}

/** Папка ответов «как от хаба» на план по почтам пользователей. */
function writeAnswers(dir: string, t: HrDatasetTables) {
  const plan = buildChecksumPlan(USERS.map((u) => u.email));
  const put = (name: string, v: unknown) => writeFileSync(join(dir, name), JSON.stringify(v));
  put(CHECKSUM_PLAN_FILE, plan);
  for (const key of HR_DATASET_KEYS) {
    const cols: readonly string[] = HR_DATASET_COLUMNS[key];
    const items = (t[key] as Array<Record<string, string>>).map((r) => cols.map((c) => r[c]));
    const sums = cols.map((_, i) => items.reduce((s, it) => s + crc32(it[i]), 0));
    const q = plan.queries.find((x) => x.key === key)!;
    put(checksumFile(key), { sql: `${q.sql} LIMIT 200`, columns: ['n', ...cols], items: [[items.length, ...sums]], count: 1 });
    for (let page = 1; (page - 1) * HR_PAGE_SIZE < items.length; page++) {
      const slice = items.slice((page - 1) * HR_PAGE_SIZE, page * HR_PAGE_SIZE);
      put(pageFile(key, page), { sql: hrPageSql(hrDataSql(key, plan.emails), page), columns: [...cols], items: slice, count: slice.length });
    }
  }
}

/** Как Postgres хранит jsonb: ключи объектов — в своём порядке (короче — раньше), массивы — как есть. */
function jsonbLike(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(jsonbLike);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(keys.map((k) => [k, jsonbLike((v as Record<string, unknown>)[k])]));
  }
  return v;
}

const planFor = (employees: HrDatasetTables['employees']) =>
  planRegistrySync({ hr: employees.map(toHrPerson), users: USERS, excluded: [], options: { today: '2026-11-27' } });

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'hr-sync-dir-test-'));
  dirs.push(d);
  return d;
};

beforeEach(() => {
  clearCache();
  resetHrDatasetForTests();
  findFirstSnapshot.mockReset();
  for (const k of ['CLICKHOUSE_HOST', 'CLICKHOUSE_PORT', 'CLICKHOUSE_USER', 'CLICKHOUSE_PASSWORD']) delete process.env[k];
});
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('--snapshot-dir — только отчёт', () => {
  it('--apply с --snapshot-dir — ошибка: сначала загрузите слепок в базу', () => {
    expect(() => parseArgs(['--apply', '--snapshot-dir=work'])).toThrow('сначала загрузите слепок в базу');
    expect(() => parseArgs(['--snapshot-dir=work', '--apply', '--confirm=0123456789'])).toThrow('только отчёт');
  });

  it('без --apply — можно; пустая папка — ошибка', () => {
    expect(parseArgs(['--snapshot-dir=work', '--verbose'])).toMatchObject({ snapshotDir: 'work', apply: false });
    expect(parseArgs([]).snapshotDir).toBeNull();
    expect(() => parseArgs(['--snapshot-dir='])).toThrow('нужна папка');
  });

  it('папка не прошла проверку (хаб переписал SQL) — отказ, отчёта нет', async () => {
    const dir = tmp();
    writeAnswers(dir, tables());
    const p = join(dir, pageFile('employees', 2));
    writeFileSync(p, JSON.stringify({ sql: "SELECT 'x' AS id UNION ALL SELECT 'y'", columns: [], items: [] }));
    await expect(loadHrForSync(dir)).rejects.toThrow('Папка ответов не прошла проверку — отчёта нет. employees.2.json');
  });
});

describe('отпечаток: отчёт по папке = отчёт по слепку из тех же ответов в БД', () => {
  it('тот же план и тот же отпечаток — --confirm из отчёта по папке годится для --apply после загрузки', async () => {
    const dir = tmp();
    writeAnswers(dir, tables());

    // Отчёт по папке
    const fromDir = await loadHrForSync(dir);
    expect(fromDir.source).toContain('из папки ответов ida.hub, в базу ещё не загружен');

    // Загрузка: то, что hr-snapshot.ts --import --apply записал бы в hr_snapshots
    const created: Array<{ data: Record<string, unknown> }> = [];
    const tx = {
      hrSnapshot: {
        create: async (a: { data: Record<string, unknown> }) => (created.push(a), { id: 1 }),
        findMany: async () => [{ id: 1 }],
        deleteMany: async () => ({ count: 0 }),
      },
    };
    const db = { $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as PrismaClient;
    await saveSnapshot(importSnapshotAnswers(readAnswersDir(dir)), { takenAt: new Date('2026-11-27T07:30:00Z'), actor: null }, db);
    const row = created[0].data;
    findFirstSnapshot.mockResolvedValue({ takenAt: row.takenAt, data: jsonbLike(JSON.parse(JSON.stringify(row.data))) });

    // Отчёт по БД — обычный путь сверки без папки
    const fromDb = await loadHrForSync(null);
    expect(fromDb.dataset.source).toBe('snapshot');
    expect(fromDb.source).not.toContain('папки');
    expect(fromDb.dataset.employees).toEqual(fromDir.dataset.employees);

    const a = planFor(fromDir.dataset.employees);
    const b = planFor(fromDb.dataset.employees);
    // План не пустой: есть кого завести, кого деактивировать и кому дозаполнить дату
    expect(a.create.length).toBeGreaterThan(0);
    expect(a.deactivate.map((d) => d.userId)).toEqual([3]);
    expect(a.update.map((u) => u.userId)).toEqual([2, 4]);
    expect(b).toEqual(a);
    expect(planFingerprint(b)).toBe(planFingerprint(a));
  });
});
