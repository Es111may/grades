/**
 * GET /api/performance/tasks?userId=...&hasEstimate=...&completedOnly=...&workedHardOnly=...
 *
 * Возвращает список задач конкретного дизайнера из ClickHouse
 * (collab + manage tracker) — для дашборда «Мой перформанс» на портрете.
 *
 * Права (полностью совпадают с правами на портрет):
 *   - admin                  — может смотреть всех
 *   - сам пользователь       — может смотреть свой
 *   - лид дизайнера          — может смотреть своих
 *   - стардиз дизайнера      — может смотреть своих
 *
 * Email берётся из БД по userId, а не из query — иначе можно было бы
 * подставить чужой email и обойти проверку.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { fetchDesignerTasks } from '@/lib/clickhousePerf';

function parseBool(v: string | null, fallback: boolean): boolean {
  if (v === null) return fallback;
  return v === '1' || v === 'true';
}

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const userIdRaw = url.searchParams.get('userId');
  const userId = userIdRaw ? parseInt(userIdRaw, 10) : NaN;
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  // Берём email и связи целевого пользователя из БД, не из query.
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, leadId: true, stardizId: true },
  });
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const canView =
    me.role === 'admin' ||
    me.id === target.id ||
    target.leadId === me.id ||
    target.stardizId === me.id;
  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Если у юзера нет корпоративного email — ClickHouse-запросы бессмысленны.
  if (!target.email || !target.email.includes('@')) {
    return NextResponse.json({ tasks: [] });
  }

  const hasEstimate = parseBool(url.searchParams.get('hasEstimate'), true);
  const completedOnly = parseBool(url.searchParams.get('completedOnly'), true);
  const workedHardOnly = parseBool(url.searchParams.get('workedHardOnly'), true);

  try {
    const tasks = await fetchDesignerTasks({
      email: target.email,
      hasEstimate,
      completedOnly,
      workedHardOnly,
    });
    return NextResponse.json({ tasks });
  } catch (err) {
    console.error('[/api/performance/tasks] ClickHouse error:', err);
    return NextResponse.json(
      { error: 'ClickHouse unavailable', tasks: [] },
      { status: 502 },
    );
  }
}
