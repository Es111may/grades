/**
 * In-memory кэш для тяжёлых ClickHouse-запросов (перформанс, HR).
 *
 * Зачем нужен:
 *   - Бэтч-агрегат по 20+ дизайнерам — это JOIN по миллионам записей в
 *     `manage.worklog_timerecord`. На холодную может занимать 5–8 секунд.
 *   - Лидерборд открывается часто (каждый раз когда лид смотрит команду).
 *   - Данные за rolling 6 мес меняются по чуть-чуть; обновление каждые
 *     15 минут — нормально для этого продукта.
 *
 * Что умеет (ревью производительности, 30.09.2026):
 *   - Склейка параллельных запросов: пока значение считается, все вызовы
 *     с тем же ключом ждут один и тот же промис — в ClickHouse уходит один
 *     запрос, а не по одному на каждую вкладку/рендер.
 *   - Stale-while-revalidate: после TTL отдаём старое значение сразу и
 *     обновляем в фоне. Старое держим ещё до STALE_MS (6 ч) — если ClickHouse
 *     лежит, страница показывает вчерашние цифры, а не пустоту.
 *   - Кэш ошибок: упавший расчёт помним ERROR_TTL_MS (90 с) и сразу
 *     бросаем ту же ошибку. Вызывающие ошибки уже обрабатывают — так
 *     недоступный ClickHouse не держит каждую страницу до таймаута.
 *   - Ограничение размера: не больше MAX_ENTRIES ключей, вытесняем самые
 *     давно записанные.
 *
 * Ограничения:
 *   - Кэш живёт в памяти Node.js. При рестарте контейнера на Railway (каждый
 *     деплой) он пустой — первый заход холодный. Страницы ограничивают
 *     ожидание через `withTimeout`, а запрос дописывает кэш в фоне.
 *   - При нескольких инстансах каждый держит свой кэш. Сейчас Railway
 *     деплоит в один инстанс; если понадобится — переедет в Redis.
 *
 * API:
 *   - `getOrCompute(key, compute, ttlMs)` — стандартный паттерн.
 *   - `setCached(key, value, ttlMs)` — положить готовое значение (батч
 *     раскладывает результат по ключам одиночных запросов).
 *   - `invalidate(key)` — на случай ручной инвалидации (пока не используем).
 *   - `withTimeout(promise, ms, label)` — бюджет ожидания для страниц.
 */

interface Entry<T> {
  value: T;
  /** До этого момента значение свежее — отдаём без обновления. */
  freshUntil: number;
  /** До этого момента отдаём как устаревшее и обновляем в фоне. */
  staleUntil: number;
}

interface Failure {
  error: unknown;
  until: number;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const failures = new Map<string, Failure>();

/** TTL по умолчанию — 15 минут (Pavel ОК с этим). */
export const DEFAULT_TTL_MS = 15 * 60 * 1000;
/** Сколько после TTL ещё отдаём устаревшее значение, пока идёт обновление. */
export const STALE_MS = 6 * 60 * 60 * 1000;
/** Сколько помним ошибку расчёта и не повторяем запрос. */
export const ERROR_TTL_MS = 90 * 1000;
/** Потолок числа ключей: задачи портретов × фильтры — самые массовые. */
export const MAX_ENTRIES = 500;
/**
 * Сколько серверный рендер страницы ждёт внешний источник (ClickHouse, HR).
 * Не успел — страница рисуется без этих данных, как при ошибке.
 */
export const PAGE_BUDGET_MS = 8000;

export async function getOrCompute<T>(
  key: string,
  compute: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit) {
    if (hit.freshUntil > now) return hit.value;
    if (hit.staleUntil > now) {
      // Устарело, но ещё годится: отдаём сразу, обновляем в фоне. Если
      // недавнее обновление упало — не долбим источник, ждём ERROR_TTL_MS.
      if (!isFailing(key, now)) {
        refresh(key, compute, ttlMs).catch(() => {
          // Ошибка уже записана в failures; вызывающему отдали старое.
        });
      }
      return hit.value;
    }
    store.delete(key);
  }

  const failed = failures.get(key);
  if (failed && failed.until > now) throw failed.error;

  return refresh(key, compute, ttlMs);
}

/** Положить готовое значение под ключ (как будто его только что посчитали). */
export function setCached<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
  const now = Date.now();
  // delete + set — ключ переезжает в конец Map, вытеснение идёт с начала
  store.delete(key);
  store.set(key, { value, freshUntil: now + ttlMs, staleUntil: now + ttlMs + STALE_MS });
  failures.delete(key);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function invalidate(key: string): void {
  store.delete(key);
  failures.delete(key);
}

/** Полная очистка — для тестов. */
export function clearCache(): void {
  store.clear();
  inflight.clear();
  failures.clear();
}

function isFailing(key: string, now: number): boolean {
  const f = failures.get(key);
  if (!f) return false;
  if (f.until > now) return true;
  failures.delete(key);
  return false;
}

/** Один расчёт на ключ: параллельные вызовы получают тот же промис. */
function refresh<T>(key: string, compute: () => Promise<T>, ttlMs: number): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = (async () => {
    try {
      const value = await compute();
      setCached(key, value, ttlMs);
      return value;
    } catch (err) {
      failures.set(key, { error: err, until: Date.now() + ERROR_TTL_MS });
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/**
 * Бюджет ожидания: если промис не успел за `ms`, бросаем ошибку, а сам
 * запрос продолжает работать в фоне и дописывает кэш — следующий рендер
 * возьмёт готовое. Нужен страницам, чтобы медленный ClickHouse не держал
 * рендер до таймаута клиента (однажды /admin/users ждал 22,6 с).
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label}: не уложились в ${ms} мс`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
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
