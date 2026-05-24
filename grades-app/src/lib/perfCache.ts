/**
 * Простой in-memory TTL-кэш для тяжёлых ClickHouse-запросов перформанса.
 *
 * Зачем нужен:
 *   - Бэтч-агрегат по 20+ дизайнерам — это JOIN по миллионам записей в
 *     `collab.time_records`. На холодную может занимать 5–8 секунд.
 *   - Лидерборд открывается часто (каждый раз когда лид смотрит команду).
 *   - Данные за rolling 6 мес меняются по чуть-чуть; обновление каждые
 *     15 минут — нормально для этого продукта.
 *
 * Ограничения:
 *   - Кэш живёт в памяти Node.js. При рестарте контейнера на Railway
 *     первый заход — холодный, ~5 сек ожидания. Это приемлемо.
 *   - При нескольких инстансах (горизонтальное масштабирование) каждый
 *     инстанс держит свой кэш. Сейчас Railway деплоит в один инстанс,
 *     так что это не проблема. Если позже понадобится — переедет в Redis.
 *
 * API:
 *   - `getOrCompute(key, ttlMs, compute)` — стандартный паттерн.
 *   - `invalidate(key)` — на случай ручной инвалидации (пока не используем).
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

/** TTL по умолчанию — 15 минут (Pavel ОК с этим). */
export const DEFAULT_TTL_MS = 15 * 60 * 1000;

export async function getOrCompute<T>(
  key: string,
  compute: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }

  // Если в кэше истекло — удаляем сразу, чтобы не возвращать stale-данные
  // другому параллельному запросу (он сам пересчитает).
  if (hit) store.delete(key);

  const value = await compute();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function invalidate(key: string): void {
  store.delete(key);
}

/**
 * Утилита: стабильный ключ для набора email'ов (порядок не важен).
 * Используется в `clickhousePerfBatch.ts` чтобы запросы с разным порядком
 * email'ов на входе попадали в один кэш-слот.
 */
export function makeEmailsCacheKey(prefix: string, emails: string[]): string {
  const normalized = emails.map((e) => e.trim().toLowerCase()).sort();
  return `${prefix}:${normalized.join(',')}`;
}
