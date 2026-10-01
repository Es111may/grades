import { beforeEach, describe, expect, it, vi } from 'vitest';

// Подменяем Prisma: настройки — key-value в памяти.
const findMany = vi.fn();
const upsert = vi.fn((args: unknown) => args);
const $transaction = vi.fn(async (ops: unknown[]) => ops);
vi.mock('../db', () => ({
  prisma: { setting: { findMany: (...a: unknown[]) => findMany(...a), upsert: (a: unknown) => upsert(a) }, $transaction: (ops: unknown[]) => $transaction(ops) },
}));

import {
  SETTINGS_DEFAULTS,
  changedSettings,
  loadSettings,
  parseSettings,
  saveSettings,
  settingsSchema,
  settingsToRows,
} from '../settings';

beforeEach(() => {
  findMany.mockReset();
  upsert.mockClear();
  $transaction.mockClear();
});

describe('parseSettings', () => {
  it('пусто — дефолты: налог 36%, ориентир 10%, потолка нет', () => {
    expect(parseSettings([])).toEqual({ payrollTaxRate: 0.36, fotGrowthTarget: 0.1, salaryCeiling: null });
  });

  it('читает значения и игнорирует чужие ключи', () => {
    expect(
      parseSettings([
        { key: 'payrollTaxRate', value: '0.3' },
        { key: 'fotGrowthTarget', value: '0.125' },
        { key: 'salaryCeiling', value: '250000' },
        { key: 'other', value: 'x' },
      ]),
    ).toEqual({ payrollTaxRate: 0.3, fotGrowthTarget: 0.125, salaryCeiling: 250000 });
  });

  it('битые и вне диапазона — дефолт', () => {
    expect(
      parseSettings([
        { key: 'payrollTaxRate', value: '36' },
        { key: 'fotGrowthTarget', value: 'десять' },
        { key: 'salaryCeiling', value: '-5' },
      ]),
    ).toEqual(SETTINGS_DEFAULTS);
  });

  it('туда и обратно через строки таблицы; пустой потолок — пустая строка', () => {
    const s = { payrollTaxRate: 0.36, fotGrowthTarget: 0.1, salaryCeiling: null };
    const rows = settingsToRows(s);
    expect(rows.find((r) => r.key === 'salaryCeiling')!.value).toBe('');
    expect(parseSettings(rows)).toEqual(s);
    const t = { payrollTaxRate: 0, fotGrowthTarget: 0.15, salaryCeiling: 300000 };
    expect(parseSettings(settingsToRows(t))).toEqual(t);
  });
});

describe('settingsSchema', () => {
  it('доли 0…1, потолок — целые рубли или null, лишние поля нельзя', () => {
    expect(settingsSchema.safeParse({ payrollTaxRate: 0.36, fotGrowthTarget: 0.1, salaryCeiling: null }).success).toBe(true);
    expect(settingsSchema.safeParse({ payrollTaxRate: 36, fotGrowthTarget: 0.1, salaryCeiling: null }).success).toBe(false);
    expect(settingsSchema.safeParse({ payrollTaxRate: 0.36, fotGrowthTarget: -0.1, salaryCeiling: null }).success).toBe(false);
    expect(settingsSchema.safeParse({ payrollTaxRate: 0.36, fotGrowthTarget: 0.1, salaryCeiling: 250000.5 }).success).toBe(false);
    expect(settingsSchema.safeParse({ payrollTaxRate: 0.36, fotGrowthTarget: 0.1, salaryCeiling: 0 }).success).toBe(false);
    expect(settingsSchema.safeParse({ payrollTaxRate: 0.36, fotGrowthTarget: 0.1, salaryCeiling: null, x: 1 }).success).toBe(false);
    expect(settingsSchema.safeParse({ payrollTaxRate: 0.36, fotGrowthTarget: 0.1 }).success).toBe(false);
  });
});

describe('changedSettings', () => {
  it('только изменившиеся ключи', () => {
    expect(changedSettings(SETTINGS_DEFAULTS, { ...SETTINGS_DEFAULTS, salaryCeiling: 200000 })).toEqual(['salaryCeiling']);
    expect(changedSettings(SETTINGS_DEFAULTS, SETTINGS_DEFAULTS)).toEqual([]);
  });
});

describe('loadSettings и saveSettings', () => {
  it('таблицы ещё нет — дефолты, страница не падает', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    findMany.mockRejectedValue(new Error('relation "settings" does not exist'));
    await expect(loadSettings()).resolves.toEqual(SETTINGS_DEFAULTS);
    spy.mockRestore();
  });

  it('читает свои ключи', async () => {
    findMany.mockResolvedValue([{ key: 'payrollTaxRate', value: '0.3' }]);
    await expect(loadSettings()).resolves.toEqual({ ...SETTINGS_DEFAULTS, payrollTaxRate: 0.3 });
    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { key: { in: ['payrollTaxRate', 'fotGrowthTarget', 'salaryCeiling'] } } });
  });

  it('пишет все три ключа одной транзакцией, с автором', async () => {
    const saved = await saveSettings({ payrollTaxRate: 0.3, fotGrowthTarget: 0.12, salaryCeiling: null }, 7);
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(3);
    expect(upsert.mock.calls[2][0]).toEqual({
      where: { key: 'salaryCeiling' },
      create: { key: 'salaryCeiling', value: '', updatedById: 7 },
      update: { value: '', updatedById: 7 },
    });
    expect(saved).toEqual({ payrollTaxRate: 0.3, fotGrowthTarget: 0.12, salaryCeiling: null });
  });
});
