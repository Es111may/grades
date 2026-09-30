export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/** Дольше этого БД «не отвечает» — отдаём 503, не ждём таймаута балансера */
const DB_TIMEOUT_MS = 3000;

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * GET /api/health — проверка живости для Railway/мониторинга: сервер
 * поднят и БД отвечает на `SELECT 1`. Без авторизации (middleware матчит
 * только /admin, /lead, /designer) и без деталей в ответе — ни версии,
 * ни текста ошибки: эндпоинт публичный.
 */
export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('db timeout')), DB_TIMEOUT_MS);
      }),
    ]);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: NO_STORE });
  } finally {
    clearTimeout(timer);
  }
}
