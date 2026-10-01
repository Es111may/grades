// Настройки сервиса (Phase 23.6b) — key-value в таблице `settings`
// (модель Setting). Правит только админ, через PUT /api/settings; каждое
// изменение пишется в «Действия».
//
// Ключи и единицы — как в комментарии к модели в schema.prisma:
//   payrollTaxRate  — налоговая нагрузка, доля: '0.36' → «Для компании» ×1,36;
//   fotGrowthTarget — ориентир роста ФОТ в год, доля: '0.1' (ориентир, не бюджет);
//   salaryCeiling   — потолок ставки, ₽/мес на руки; пусто — не используется.
//
// Чтение терпимо к мусору: битое или отсутствующее значение — дефолт.
// Таблицы может ещё не быть (prisma db push идёт при деплое) — тогда тоже
// дефолты, страница не падает.

import { z } from 'zod';
import { prisma } from './db';

export const SETTING_KEYS = ['payrollTaxRate', 'fotGrowthTarget', 'salaryCeiling'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export type EconomicsSettings = {
  payrollTaxRate: number;
  fotGrowthTarget: number;
  salaryCeiling: number | null;
};

export const SETTINGS_DEFAULTS: EconomicsSettings = {
  payrollTaxRate: 0.36,
  fotGrowthTarget: 0.1,
  salaryCeiling: null,
};

/** Потолок ставки — не больше 10 млн ₽/мес: защита от опечатки в нулях. */
export const SALARY_CEILING_MAX = 10_000_000;

/** Тело PUT /api/settings — все три поля сразу, в единицах хранения. */
export const settingsSchema = z
  .object({
    payrollTaxRate: z.number().finite().min(0).max(1),
    fotGrowthTarget: z.number().finite().min(0).max(1),
    salaryCeiling: z.number().int().positive().max(SALARY_CEILING_MAX).nullable(),
  })
  .strict();

const num = (v: string | undefined): number | null => {
  if (v == null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Строки таблицы → настройки; неизвестные ключи и битые значения — мимо. */
export function parseSettings(rows: Array<{ key: string; value: string }>): EconomicsSettings {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const tax = num(byKey.get('payrollTaxRate'));
  const target = num(byKey.get('fotGrowthTarget'));
  const ceiling = num(byKey.get('salaryCeiling'));
  return {
    payrollTaxRate: tax != null && tax >= 0 && tax <= 1 ? tax : SETTINGS_DEFAULTS.payrollTaxRate,
    fotGrowthTarget: target != null && target >= 0 && target <= 1 ? target : SETTINGS_DEFAULTS.fotGrowthTarget,
    salaryCeiling:
      ceiling != null && ceiling > 0 && ceiling <= SALARY_CEILING_MAX ? Math.round(ceiling) : SETTINGS_DEFAULTS.salaryCeiling,
  };
}

/** Настройки → строки таблицы. Пустой потолок — пустая строка. */
export function settingsToRows(s: EconomicsSettings): Array<{ key: SettingKey; value: string }> {
  return [
    { key: 'payrollTaxRate', value: String(s.payrollTaxRate) },
    { key: 'fotGrowthTarget', value: String(s.fotGrowthTarget) },
    { key: 'salaryCeiling', value: s.salaryCeiling == null ? '' : String(s.salaryCeiling) },
  ];
}

/** Какие ключи поменялись — для записи в «Действия». */
export function changedSettings(before: EconomicsSettings, after: EconomicsSettings): SettingKey[] {
  return SETTING_KEYS.filter((k) => before[k] !== after[k]);
}

export async function loadSettings(): Promise<EconomicsSettings> {
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: [...SETTING_KEYS] } },
      select: { key: true, value: true },
    });
    return parseSettings(rows);
  } catch (err) {
    // Таблицы ещё нет или база недоступна — работаем на дефолтах
    console.error('[settings] read failed, using defaults:', err);
    return { ...SETTINGS_DEFAULTS };
  }
}

/** Записать все три ключа одной транзакцией; вернуть то, что теперь лежит в базе. */
export async function saveSettings(s: EconomicsSettings, actorId: number): Promise<EconomicsSettings> {
  const rows = settingsToRows(s);
  await prisma.$transaction(
    rows.map((r) =>
      prisma.setting.upsert({
        where: { key: r.key },
        create: { key: r.key, value: r.value, updatedById: actorId },
        update: { value: r.value, updatedById: actorId },
      }),
    ),
  );
  return parseSettings(rows);
}
