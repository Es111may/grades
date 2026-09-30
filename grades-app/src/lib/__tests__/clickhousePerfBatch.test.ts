import { beforeEach, describe, expect, it, vi } from 'vitest';

// Подменяем клиент ClickHouse: считаем запросы и отдаём заготовленные строки.
const query = vi.fn();
vi.mock('@clickhouse/client', () => ({
  createClient: () => ({ query }),
}));

import {
  fetchOnTimeStatsByEmail,
  fetchTeamMonthlyOnTime,
  monthlyOnTimePercents,
  onTimeStatsFromRows,
  type OnTimeRow,
} from '../clickhousePerfBatch';
import { clearCache } from '../perfCache';

const rows: OnTimeRow[] = [
  { email: 'a@ida.ru', month: '2026-07-01', total: 4, onTime: 3 },
  { email: 'b@ida.ru', month: '2026-07-01', total: 6, onTime: 3 },
  { email: 'a@ida.ru', month: '2026-08-01', total: 2, onTime: 2 },
];

// Строки в формате ответа ClickHouse (JSONEachRow, UInt64 — строкой).
const chRows = rows.map((r) => ({
  user_email: r.email,
  month: r.month,
  total_tasks: String(r.total),
  on_time_tasks: String(r.onTime),
}));

beforeEach(() => {
  clearCache();
  query.mockReset();
  query.mockResolvedValue({ json: async () => chRows });
  process.env.CLICKHOUSE_HOST = 'ch.test';
  process.env.CLICKHOUSE_PORT = '8123';
  process.env.CLICKHOUSE_USER = 'u';
  process.env.CLICKHOUSE_PASSWORD = 'p';
});

describe('агрегаты из строк (email, месяц)', () => {
  it('по email — сумма по месяцам, % с одним знаком', () => {
    const m = onTimeStatsFromRows(rows);
    expect(m.get('a@ida.ru')).toEqual({ totalTasks: 6, onTimeTasks: 5, onTimePercent: 83.3 });
    expect(m.get('b@ida.ru')).toEqual({ totalTasks: 6, onTimeTasks: 3, onTimePercent: 50 });
  });

  it('по месяцу — сумма по людям, целые %, по возрастанию месяца', () => {
    const shuffled = [rows[2], rows[0], rows[1]];
    // июль: 6 из 10 → 60; август: 2 из 2 → 100
    expect(monthlyOnTimePercents(shuffled)).toEqual([60, 100]);
  });

  it('пусто — пустые результаты', () => {
    expect(onTimeStatsFromRows([]).size).toBe(0);
    expect(monthlyOnTimePercents([])).toEqual([]);
  });
});

describe('один запрос на лидерборд, спарклайн и портреты', () => {
  it('«в срок» и спарклайн параллельно — один запрос в ClickHouse', async () => {
    const emails = ['A@ida.ru', 'b@ida.ru'];
    const [stats, spark] = await Promise.all([
      fetchOnTimeStatsByEmail(emails),
      fetchTeamMonthlyOnTime(emails),
    ]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(stats.get('a@ida.ru')?.onTimePercent).toBe(83.3);
    expect(spark).toEqual([60, 100]);
  });

  it('после командного запроса портрет одного человека не ходит в ClickHouse', async () => {
    await fetchOnTimeStatsByEmail(['a@ida.ru', 'b@ida.ru', 'c@ida.ru']);
    const a = await fetchOnTimeStatsByEmail(['a@ida.ru']);
    const c = await fetchOnTimeStatsByEmail(['c@ida.ru']);
    expect(query).toHaveBeenCalledTimes(1);
    expect(a.get('a@ida.ru')).toEqual({ totalTasks: 6, onTimeTasks: 5, onTimePercent: 83.3 });
    // Без задач — как у одиночного запроса: человека нет в результате
    expect(c.size).toBe(0);
  });

  it('ошибка ClickHouse доходит до вызывающего', async () => {
    query.mockRejectedValue(new Error('timeout'));
    await expect(fetchOnTimeStatsByEmail(['a@ida.ru'])).rejects.toThrow('timeout');
  });
});
