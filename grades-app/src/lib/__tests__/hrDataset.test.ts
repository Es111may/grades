import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// В тесте нет ни ClickHouse, ни Postgres: оба клиента поддельные.
const chQuery = vi.fn();
const findManyUsers = vi.fn();
const findFirstSnapshot = vi.fn();
vi.mock('../clickhouse', () => ({ chQuery: (...a: unknown[]) => chQuery(...a) }));
vi.mock('../db', () => ({
  prisma: {
    user: { findMany: (...a: unknown[]) => findManyUsers(...a) },
    hrSnapshot: { findFirst: (...a: unknown[]) => findFirstSnapshot(...a) },
  },
}));

import { HrUnavailableError, loadHrDataset, resetHrDatasetForTests } from '../hrDataset';
import { hrDataSql, type HrDatasetKey } from '../hrDatasetQueries';
import { snapshotData, type HrDatasetTables } from '../hrSnapshot';
import { clearCache } from '../perfCache';

// Все люди и суммы выдуманы.
const EMP = {
  id: 'e-1',
  email: 'Anna@Example.test',
  firstNameRu: 'Анна',
  lastNameRu: 'Пример',
  firstName: 'Anna',
  lastName: 'Primer',
  positionId: '9',
  department: 'improve',
  hiredAt: '2024-03-01',
  dismissedAt: '1970-01-01',
  isArchive: '0',
  isHourly: '0',
  maternityLeave: '0',
  salary: '110000',
  reasonId: '',
  subId: '',
};
const TABLES: HrDatasetTables = {
  employees: [EMP],
  salaryLog: [{ employeeId: 'e-1', date: '2026-04-01', salaryFrom: '100000', salaryTo: '110000' }],
  reasons: [{ id: '1', initiator: 'true', title: 'Условия труда' }],
  subs: [],
  wageFundByMonth: [{ month: '2026-09-01', wageFund: '32000000' }],
  monthlyStats: [],
};
const SNAP = { takenAt: new Date('2026-11-27T07:00:00Z'), data: snapshotData(TABLES) };
const CH_ENV = { CLICKHOUSE_HOST: 'ch.example.test', CLICKHOUSE_PORT: '8123', CLICKHOUSE_USER: 'u', CLICKHOUSE_PASSWORD: 'p' };

/** Живой ClickHouse: отвечает строками таблицы из первого FROM. */
const TABLE_KEY: Record<string, HrDatasetKey> = {
  employee_employee: 'employees',
  salary_changesalarylog: 'salaryLog',
  employee_dismissalreason: 'reasons',
  employee_dismissalreasonsubcategory: 'subs',
  stats_wagefundstats: 'wageFundByMonth',
  stats_monthlyemployeestats: 'monthlyStats',
};
function liveAnswer(sql: string) {
  const key = TABLE_KEY[sql.match(/FROM hr_portal_current\.(\w+) AS/)?.[1] ?? ''];
  if (!key) throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
  return (TABLES[key] as unknown[]).map((r) => ({ ...(r as object) }));
}

const setCh = (on: boolean) => {
  for (const [k, v] of Object.entries(CH_ENV)) {
    if (on) process.env[k] = v;
    else delete process.env[k];
  }
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  clearCache();
  resetHrDatasetForTests();
  chQuery.mockReset();
  findManyUsers.mockReset();
  findFirstSnapshot.mockReset();
  findManyUsers.mockResolvedValue([{ email: 'Anna@Example.test' }, { email: ' new.person@example.test' }]);
  findFirstSnapshot.mockResolvedValue(SNAP);
  chQuery.mockImplementation(async (sql: string) => liveAnswer(sql));
  setCh(false);
});

afterEach(() => {
  setCh(false);
  vi.restoreAllMocks();
});

describe('loadHrDataset — откуда набор', () => {
  it('ClickHouse не настроен — последний слепок из БД, в ClickHouse не ходим', async () => {
    const ds = await loadHrDataset();
    expect(ds.source).toBe('snapshot');
    expect(ds.takenAt).toBe('2026-11-27T07:00:00.000Z');
    expect(ds.employees).toEqual([EMP]);
    expect(chQuery).not.toHaveBeenCalled();
    expect(findFirstSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ takenAt: 'desc' }, { id: 'desc' }] }),
    );
  });

  it('ClickHouse отвечает — живой набор теми же SQL, охват — почты всех пользователей Грейдов', async () => {
    setCh(true);
    const ds = await loadHrDataset();
    expect(ds.source).toBe('clickhouse');
    expect(ds.employees).toEqual([EMP]);
    expect(ds.reasons).toEqual(TABLES.reasons);
    const sqls = chQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls).toHaveLength(6);
    const emails = ['anna@example.test', 'new.person@example.test'];
    expect(sqls).toContain(hrDataSql('employees', emails));
    expect(sqls).toContain(hrDataSql('salaryLog', emails));
    expect(findFirstSnapshot).not.toHaveBeenCalled();
  });

  it('ClickHouse настроен, но не отвечает — слепок', async () => {
    setCh(true);
    chQuery.mockRejectedValue(new Error('ClickHouse недоступен: /ping не ответил за 3000 мс'));
    const ds = await loadHrDataset();
    expect(ds.source).toBe('snapshot');
  });

  it('живой: справочники по возможности — упали, набор без них', async () => {
    setCh(true);
    chQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('employee_dismissalreason AS r')) throw new Error('ClickHouse 500');
      return liveAnswer(sql);
    });
    const ds = await loadHrDataset();
    expect(ds.source).toBe('clickhouse');
    expect(ds.reasons).toEqual([]);
    expect(ds.employees).toHaveLength(1);
  });

  it('нет ни живого, ни слепка — HrUnavailableError', async () => {
    findFirstSnapshot.mockResolvedValue(null);
    await expect(loadHrDataset()).rejects.toBeInstanceOf(HrUnavailableError);
  });

  it('битый слепок — ошибка, а не пустой набор', async () => {
    findFirstSnapshot.mockResolvedValue({ takenAt: SNAP.takenAt, data: { format: 1, employees: [] } });
    await expect(loadHrDataset()).rejects.toThrow('слепок HR');
  });
});

describe('loadHrDataset — кэш', () => {
  it('второй заход — из кэша, тот же объект', async () => {
    const a = await loadHrDataset();
    const b = await loadHrDataset(['anna@example.test']);
    expect(b).toBe(a);
    expect(findFirstSnapshot).toHaveBeenCalledTimes(1);
  });

  it('живой набор: email не из охвата (новый человек) — перечитываем, но не чаще раза в минуту', async () => {
    setCh(true);
    await loadHrDataset();
    expect(findManyUsers).toHaveBeenCalledTimes(1);
    // Охват покрыт — не перечитываем
    await loadHrDataset(['ANNA@example.test']);
    expect(findManyUsers).toHaveBeenCalledTimes(1);
    // Новый email — перечитали
    findManyUsers.mockResolvedValue([{ email: 'anna@example.test' }, { email: 'fresh@example.test' }]);
    await loadHrDataset(['fresh@example.test']);
    expect(findManyUsers).toHaveBeenCalledTimes(2);
    // Ещё один новый в ту же минуту — не перечитываем
    await loadHrDataset(['other@example.test']);
    expect(findManyUsers).toHaveBeenCalledTimes(2);
  });

  it('слепок охват не перечитывает', async () => {
    await loadHrDataset();
    await loadHrDataset(['fresh@example.test']);
    expect(findFirstSnapshot).toHaveBeenCalledTimes(1);
    expect(findManyUsers).not.toHaveBeenCalled();
  });
});
