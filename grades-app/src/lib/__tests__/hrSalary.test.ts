import { beforeEach, describe, expect, it, vi } from 'vitest';

// Подменяем HTTP-клиент ClickHouse: первый запрос — сотрудники, второй — журналы.
const chQuery = vi.fn();
vi.mock('../clickhouse', () => ({ chQuery: (...args: unknown[]) => chQuery(...args) }));

import { fetchHrCompensation, fetchHrCompensationBatch } from '../hrSalary';
import { clearCache } from '../perfCache';

beforeEach(() => {
  clearCache();
  chQuery.mockReset();
  chQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('employee_employee')) {
      return [
        { em: 'a@ida.ru', id: 'id-a', salary: '150000', hired: '2024-02-01', dismissed: '1970-01-01', arch: 0 },
      ];
    }
    return [{ id: 'id-a', d: '2025-03-01', f: '120000', t: '150000' }];
  });
});

describe('fetchHrCompensationBatch раскладывает результат по ключам одиночных запросов', () => {
  it('поп-ап после списка не ходит в ClickHouse', async () => {
    const batch = await fetchHrCompensationBatch(['A@ida.ru', 'nohr@ida.ru']);
    expect(chQuery).toHaveBeenCalledTimes(2);

    const a = await fetchHrCompensation('a@ida.ru');
    const none = await fetchHrCompensation(' NoHR@ida.ru ');
    expect(chQuery).toHaveBeenCalledTimes(2);

    expect(a).toEqual(batch.get('a@ida.ru'));
    expect(a).toEqual({
      hr: { salary: 150000, hiredAt: '2024-02-01', dismissedAt: null },
      log: [{ date: '2025-03-01', from: 120000, to: 150000 }],
    });
    // Нет учётки в HR — тот же ответ, что дал бы одиночный запрос
    expect(none).toEqual({ hr: null, log: [] });
  });
});
