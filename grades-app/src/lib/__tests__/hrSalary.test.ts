import { beforeEach, describe, expect, it, vi } from 'vitest';

// Подменяем набор HR (lib/hrDataset): живой ClickHouse или слепок — здесь всё равно.
const loadHrDataset = vi.fn();
vi.mock('../hrDataset', () => ({ loadHrDataset: (...args: unknown[]) => loadHrDataset(...args) }));

import type { HrDataset } from '../hrDataset';
import { fetchHrCompensation, fetchHrCompensationBatch, fetchHrLogsByEmail } from '../hrSalary';
import { clearCache } from '../perfCache';

// Все люди, адреса и суммы выдуманы.
type Emp = HrDataset['employees'][number];
const emp = (over: Partial<Emp> & Pick<Emp, 'id' | 'email'>): Emp => ({
  firstNameRu: 'Тест',
  lastNameRu: 'Тестов',
  firstName: 'Test',
  lastName: 'Testov',
  positionId: '9',
  department: 'create',
  hiredAt: '2024-02-01',
  dismissedAt: '1970-01-01',
  isArchive: '0',
  isHourly: '0',
  maternityLeave: '0',
  salary: '150000',
  reasonId: '',
  subId: '',
  ...over,
});
const log = (employeeId: string, date: string, from: string, to: string) => ({
  employeeId,
  date,
  salaryFrom: from,
  salaryTo: to,
});
const dataset = (employees: Emp[], salaryLog: HrDataset['salaryLog']): HrDataset => ({
  employees,
  salaryLog,
  reasons: [],
  subs: [],
  wageFundByMonth: [],
  monthlyStats: [],
  source: 'snapshot',
  takenAt: '2026-11-27T07:00:00.000Z',
});

// То же, что раньше отдавали два запроса ClickHouse: учётка и её журнал
const SIMPLE = dataset([emp({ id: 'id-a', email: 'a@example.test' })], [log('id-a', '2025-03-01', '120000', '150000')]);

beforeEach(() => {
  clearCache();
  loadHrDataset.mockReset();
  loadHrDataset.mockResolvedValue(SIMPLE);
});

describe('fetchHrCompensationBatch раскладывает результат по ключам одиночных запросов', () => {
  it('поп-ап после списка не идёт в набор заново', async () => {
    const batch = await fetchHrCompensationBatch(['A@example.test', 'nohr@example.test']);
    expect(loadHrDataset).toHaveBeenCalledTimes(1);

    const a = await fetchHrCompensation('a@example.test');
    const none = await fetchHrCompensation(' NoHR@example.test ');
    expect(loadHrDataset).toHaveBeenCalledTimes(1);

    expect(a).toEqual(batch.get('a@example.test'));
    expect(a).toEqual({
      hr: { salary: 150000, hiredAt: '2024-02-01', dismissedAt: null },
      log: [{ date: '2025-03-01', from: 120000, to: 150000 }],
    });
    // Нет учётки в HR — тот же ответ, что дал бы одиночный запрос
    expect(none).toEqual({ hr: null, log: [] });
  });

  it('набор недоступен — ошибка, вызывающие показывают «HR недоступен»', async () => {
    loadHrDataset.mockRejectedValue(new Error('HR: данные недоступны'));
    await expect(fetchHrCompensation('a@example.test')).rejects.toThrow('HR: данные недоступны');
  });
});

describe('паритет с прежними запросами к ClickHouse', () => {
  // a — пересоздана: архивная старая учётка и живая новая; b — уволен;
  // c — две ушедшие учётки; d — флаги Bool строкой ('true'/'false')
  const RICH = dataset(
    [
      emp({ id: 'a0', email: 'a@example.test', hiredAt: '2019-01-10', dismissedAt: '2021-05-01', isArchive: '1', salary: '90000' }),
      emp({ id: 'a1', email: 'A@Example.test', hiredAt: '2022-02-01', salary: '150000' }),
      emp({ id: 'b', email: 'b@example.test', hiredAt: '2020-01-01', dismissedAt: '2025-06-30', salary: '130000.00' }),
      emp({ id: 'c1', email: 'c@example.test', hiredAt: '2018-01-01', dismissedAt: '2019-01-01', isArchive: '1' }),
      emp({ id: 'c2', email: 'c@example.test', hiredAt: '2021-01-01', dismissedAt: '2024-01-01', isArchive: '1', salary: '99000' }),
      emp({ id: 'd', email: 'd@example.test', isArchive: 'false', salary: '' }),
      emp({ id: 'other', email: 'other@example.test' }),
    ],
    // Порядок набора — по моменту пересмотра (ORDER BY l.date_start)
    [
      log('a0', '2019-01-10', '0', '80000'),
      log('c2', '2021-01-01', '0', '99000'),
      log('a0', '2020-03-01', '80000', '90000'),
      log('a1', '2022-02-01', '0', '120000'),
      log('b', '2024-01-01', '110000', '130000'),
      log('a1', '2025-03-01', '120000', '150000'),
      log('other', '2025-04-01', '1', '2'),
    ],
  );

  beforeEach(() => {
    loadHrDataset.mockResolvedValue(RICH);
  });

  it('одиночный запрос: одна живая учётка (pickEmployee) и только её журнал', async () => {
    expect(await fetchHrCompensation('a@example.test')).toEqual({
      hr: { salary: 150000, hiredAt: '2022-02-01', dismissedAt: null },
      log: [
        { date: '2022-02-01', from: 0, to: 120000 },
        { date: '2025-03-01', from: 120000, to: 150000 },
      ],
    });
    expect(await fetchHrCompensation('b@example.test')).toEqual({
      hr: { salary: 130000, hiredAt: '2020-01-01', dismissedAt: '2025-06-30' },
      log: [{ date: '2024-01-01', from: 110000, to: 130000 }],
    });
    // Живых нет — самая поздняя по найму
    expect(await fetchHrCompensation('c@example.test')).toEqual({
      hr: { salary: 99000, hiredAt: '2021-01-01', dismissedAt: '2024-01-01' },
      log: [{ date: '2021-01-01', from: 0, to: 99000 }],
    });
    // 'false' — не архив; пустая ставка — 0, как NULL раньше
    expect(await fetchHrCompensation('d@example.test')).toEqual({
      hr: { salary: 0, hiredAt: '2024-02-01', dismissedAt: null },
      log: [],
    });
  });

  it('батч — те же ответы, что одиночные', async () => {
    const batch = await fetchHrCompensationBatch(['a@example.test', 'b@example.test', 'c@example.test', 'x@example.test']);
    clearCache();
    for (const em of ['a@example.test', 'b@example.test', 'c@example.test', 'x@example.test']) {
      expect(batch.get(em)).toEqual(await fetchHrCompensation(em));
    }
  });

  it('журналы по email: все учётки с этим email (и архивные), по дате; найм — у учётки первой записи', async () => {
    const logs = await fetchHrLogsByEmail(['A@example.test', 'b@example.test', 'nolog@example.test']);
    expect(Array.from(logs.keys()).sort()).toEqual(['a@example.test', 'b@example.test']);
    expect(logs.get('a@example.test')).toEqual({
      hiredAt: '2019-01-10',
      log: [
        { date: '2019-01-10', from: 0, to: 80000 },
        { date: '2020-03-01', from: 80000, to: 90000 },
        { date: '2022-02-01', from: 0, to: 120000 },
        { date: '2025-03-01', from: 120000, to: 150000 },
      ],
    });
    expect(logs.get('b@example.test')).toEqual({
      hiredAt: '2020-01-01',
      log: [{ date: '2024-01-01', from: 110000, to: 130000 }],
    });
  });

  it('пустой список — без захода в набор', async () => {
    expect((await fetchHrLogsByEmail([' '])).size).toBe(0);
    expect((await fetchHrCompensationBatch([])).size).toBe(0);
    expect(loadHrDataset).not.toHaveBeenCalled();
  });
});
