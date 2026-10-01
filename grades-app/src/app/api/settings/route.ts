/**
 * GET /api/settings — настройки «Экономики» (только админ).
 * PUT /api/settings — сохранить все три сразу (только админ).
 *
 * Тело PUT — в единицах хранения (lib/settings):
 *   { payrollTaxRate: 0…1, fotGrowthTarget: 0…1, salaryCeiling: ₽ | null }
 * Ответ обоих — { settings } с тем, что теперь лежит в базе. Изменение
 * пишется в «Действия» (до → после); если ничего не поменялось — не пишется.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { writeAudit } from '@/lib/audit';
import { changedSettings, loadSettings, saveSettings, settingsSchema } from '@/lib/settings';

/** Действие для журнала. Подпись в AUDIT_ACTION_LABEL — «Настройки изменены». */
const SETTINGS_UPDATED = 'settings_updated';

async function requireAdmin() {
  const me = await getCurrentUser();
  return me?.id && me.role === 'admin' ? me : null;
}

export async function GET() {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ settings: await loadSettings() });
}

export async function PUT(req: NextRequest) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: 'Настройки меняет только админ' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Некорректные значения настроек' }, { status: 400 });
  }

  const before = await loadSettings();
  let settings;
  try {
    settings = await saveSettings(parsed.data, me.id);
  } catch (err) {
    console.error('[/api/settings] save failed:', err);
    return NextResponse.json({ error: 'Не удалось сохранить настройки' }, { status: 500 });
  }

  const changed = changedSettings(before, settings);
  if (changed.length) {
    await writeAudit({
      actorId: me.id,
      action: SETTINGS_UPDATED,
      targetType: 'settings',
      before: Object.fromEntries(changed.map((k) => [k, before[k]])),
      after: Object.fromEntries(changed.map((k) => [k, settings[k]])),
    });
  }
  return NextResponse.json({ settings });
}
