import { beforeEach, describe, expect, it, vi } from 'vitest';

// Набор HR — настоящий (lib/hrDataset), из слепка в поддельной БД; ClickHouse не настроен.
const findFirstSnapshot = vi.fn();
const findManyOverrides = vi.fn();
vi.mock('../clickhouse', () => ({ chQuery: vi.fn() }));
vi.mock('../db', () => ({
  prisma: {
    hrSnapshot: { findFirst: (...a: unknown[]) => findFirstSnapshot(...a) },
    user: { findMany: vi.fn() },
    salaryDisplayOverride: { findMany: (...a: unknown[]) => findManyOverrides(...a) },
  },
}));

import { fetchHrCompensation } from '../hrSalary';
import { fetchHrEconomics, resetHrEconomicsForTests } from '../hrEconomics';
import { resetHrDatasetForTests } from '../hrDataset';
import { snapshotData, type HrDatasetTables } from '../hrSnapshot';
import { displayCompensationFor, displayEconomics, loadDisplayRates } from '../salaryOverride';
import { clearCache } from '../perfCache';

// Все люди и суммы выдуманы.
const K = 1000;
const TABLES: HrDatasetTables = {
  employees: [
    {
      id: 'e-1', email: 'person@example.test', firstNameRu: 'Тест', lastNameRu: 'Тестов', firstName: '', lastName: '',
      positionId: '9', department: 'create', hiredAt: '2023-03-01', dismissedAt: '1970-01-01', isArchive: '0',
      isHourly: '0', maternityLeave: '0', salary: String(150 * K), reasonId: '', subId: '',
    },
  ],
  salaryLog: [
    { employeeId: 'e-1', date: '2023-03-01', salaryFrom: '0', salaryTo: String(100 * K) },
    { employeeId: 'e-1', date: '2026-02-01', salaryFrom: String(100 * K), salaryTo: String(150 * K) },
  ],
  reasons: [],
  subs: [],
  wageFundByMonth: [],
  monthlyStats: [],
};

beforeEach(() => {
  clearCache();
  resetHrDatasetForTests();
  resetHrEconomicsForTests();
  for (const k of ['CLICKHOUSE_HOST', 'CLICKHOUSE_PORT', 'CLICKHOUSE_USER', 'CLICKHOUSE_PASSWORD']) delete process.env[k];
  findFirstSnapshot.mockResolvedValue({ takenAt: new Date('2026-11-27T07:00:00Z'), data: snapshotData(TABLES) });
  findManyOverrides.mockResolvedValue([{ amount: 110 * K, ownerId: 1, user: { email: 'Person@example.test' } }]);
});

describe('ставка для показа — и на слепке HR', () => {
  it('поп-ап: ставка и журнал — суммой для показа', async () => {
    const c = await fetchHrCompensation('person@example.test');
    const rates = await loadDisplayRates({ id: 2, impersonatorId: null });
    const shown = displayCompensationFor(c, 'person@example.test', rates);
    expect(shown.hr?.salary).toBe(110 * K);
    expect(shown.log).toEqual([{ date: '2023-03-01', from: 0, to: 110 * K }]);
    // Владелец, вошедший сам, — как есть
    const own = displayCompensationFor(c, 'person@example.test', await loadDisplayRates({ id: 1, impersonatorId: null }));
    expect(own.hr?.salary).toBe(150 * K);
  });

  it('«Экономика»: ставка в карточке и журнал — суммой для показа', async () => {
    const raw = await fetchHrEconomics(['person@example.test']);
    expect(raw.source).toBe('snapshot');
    const shown = displayEconomics(raw, await loadDisplayRates({ id: 2, impersonatorId: null }));
    expect(shown.employees[0].salary).toBe(110 * K);
    expect(shown.logs).toEqual([{ employeeId: 'e-1', date: '2023-03-01', from: 0, to: 110 * K }]);
  });
});
