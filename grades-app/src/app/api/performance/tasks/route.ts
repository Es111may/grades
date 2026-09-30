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
 *
 * Дебаг: добавь `&debug=1` (доступно только админу) — вернётся блок
 * `diagnostics` с тем, какой email пошёл в CH, сколько строк отдал каждый
 * источник с фильтрами и без, и ошибки запросов (если были). Сырой запрос
 * без фильтров — такой же тяжёлый, поэтому идёт только в дебаге, а дебаг
 * всегда мимо кэша.
 *
 * Кэш: ответ держим в perfCache по userId + фильтрам (TTL 15 мин, как у
 * агрегата «в срок»). Если ClickHouse не ответил — 502 с текстом для
 * дашборда, а не пустой список «нет задач».
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { fetchDesignerTasks, type FetchTasksResult } from '@/lib/clickhousePerf';
import { getOrCompute, DEFAULT_TTL_MS } from '@/lib/perfCache';

const UNAVAILABLE = 'Данные о задачах временно недоступны';

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
  const debug = parseBool(url.searchParams.get('debug'), false) && me.role === 'admin';

  const email = target.email;
  const load = async (): Promise<FetchTasksResult> => {
    const res = await fetchDesignerTasks(
      { email, hasEstimate, completedOnly, workedHardOnly },
      { withRaw: debug },
    );
    // В Railway-логи — короткая сводка на каждый поход в ClickHouse, чтобы
    // можно было понять, почему дашборд пустой, не дёргая `debug=1`.
    // Только userId: email в логи не пишем.
    const d = res.diagnostics;
    console.info(
      `[/api/performance/tasks] userId=${userId} ` +
        `filtered=collab:${d.collabCount}+manage:${d.trackerCount} ` +
        `raw=${d.trackerRawCount ?? 'skipped'} errors=${d.errors.length}`,
    );
    return res;
  };

  try {
    const flags = `${+hasEstimate}${+completedOnly}${+workedHardOnly}`;
    const { tasks, diagnostics } = debug
      ? await load()
      : await getOrCompute(`perf-tasks:${userId}:${flags}`, load, DEFAULT_TTL_MS);

    return NextResponse.json(
      debug
        ? {
            tasks,
            diagnostics,
            appliedFilters: { hasEstimate, completedOnly, workedHardOnly },
          }
        : { tasks },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[/api/performance/tasks] userId=${userId} ClickHouse error:`, message);
    return NextResponse.json(
      debug ? { error: UNAVAILABLE, message } : { error: UNAVAILABLE },
      { status: 502 },
    );
  }
}
