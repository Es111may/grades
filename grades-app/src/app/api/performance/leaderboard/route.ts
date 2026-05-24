/**
 * GET /api/performance/leaderboard
 *
 * Возвращает агрегат «% в срок за 6 мес» для дизайнеров команды.
 *
 * Этот endpoint НЕ используется в server-side рендере админ-лидерборда —
 * там данные подтягиваются прямо через `fetchOnTimeStatsByEmail` в
 * `admin/users/page.tsx`. Endpoint оставлен на случай, если позже понадобится
 * фоновое обновление без перезагрузки страницы или внешняя интеграция.
 *
 * Права: admin / lead / stardiz. Stardiz получает данные только по своим
 * подопечным (scope-фильтр).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { fetchOnTimeStatsByEmail } from '@/lib/clickhousePerfBatch';

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.role !== 'admin' && me.role !== 'lead' && me.role !== 'stardiz') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Scope: stardiz видит только своих, admin/lead — всех designer'ов.
  const where =
    me.role === 'stardiz'
      ? {
          role: 'designer' as const,
          active: true,
          OR: [{ stardizId: me.id }, { leadId: me.id }],
        }
      : { role: 'designer' as const, active: true };

  const designers = await prisma.user.findMany({
    where,
    select: { id: true, email: true },
  });

  const emails = designers.map((d) => d.email).filter(Boolean);
  if (emails.length === 0) {
    return NextResponse.json({ stats: [] });
  }

  try {
    const statsByEmail = await fetchOnTimeStatsByEmail(emails);
    const stats = designers.map((d) => {
      const s = statsByEmail.get(d.email.toLowerCase());
      return {
        userId: d.id,
        email: d.email,
        onTimePercent: s?.onTimePercent ?? null,
        totalTasks: s?.totalTasks ?? 0,
      };
    });
    return NextResponse.json({ stats });
  } catch (err) {
    console.error('[/api/performance/leaderboard] error:', err);
    return NextResponse.json(
      {
        error: 'ClickHouse unavailable',
        message: err instanceof Error ? err.message : String(err),
        stats: [],
      },
      { status: 502 },
    );
  }
}
