export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { chQuery } from '@/lib/clickhouse';

/**
 * GET /api/users/[id]/last-raise
 *
 * Возвращает дату последнего повышения ЗП у дизайнера/стардиза. Сумму
 * НЕ возвращаем — Pavel явно попросил скрыть, в UI показывается только
 * срок «с момента последнего повышения».
 *
 * Источник: ClickHouse-копия HR-портала Иды, таблица
 * salary_changesalarylog. Связка по email (employee_employee.email →
 * User.email).
 *
 * Доступ:
 *  - admin — всегда;
 *  - lead — только для своих подопечных (target.leadId === me.id);
 *  - остальные роли получают 403.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getCurrentUser();
  if (!me || (me.role !== 'admin' && me.role !== 'lead')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { email: true, leadId: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Лид может смотреть только своего подопечного. Админ — всех.
  if (me.role === 'lead' && target.leadId !== me.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Запрос только для дизайнеров/стардизов — у админов и лидов своя система оценки.
  if (target.role !== 'designer' && target.role !== 'stardiz') {
    return NextResponse.json({ lastRaiseAt: null });
  }

  try {
    const rows = await chQuery<{ last_raise_at: string }>(
      `SELECT max(scl.date_start) AS last_raise_at
         FROM hr_portal_current.salary_changesalarylog AS scl
         INNER JOIN hr_portal_current.employee_employee AS ee
           ON ee.id = scl.employee_id
        WHERE ee.email = {email:String}
          AND scl.salary > scl.salary_start`,
      { email: target.email },
    );
    const raw = rows[0]?.last_raise_at;
    // ClickHouse возвращает «1970-01-01 00:00:00» когда строк нет — для UI
    // это «данных о повышениях не было».
    const isEpoch = !raw || raw.startsWith('1970-01-01');
    return NextResponse.json({
      lastRaiseAt: isEpoch ? null : new Date(raw + ' UTC').toISOString(),
    });
  } catch (e) {
    console.error('[last-raise] clickhouse error:', e);
    // Не валим попап — UI покажет «Данные о повышениях недоступны».
    return NextResponse.json(
      { lastRaiseAt: null, error: 'clickhouse_unavailable' },
      { status: 502 },
    );
  }
}
