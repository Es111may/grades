/**
 * Предохранитель ClickHouse: прежде чем ждать тяжёлый запрос, убедиться,
 * что хост вообще отвечает.
 *
 * Зачем (разбор 12.10.2026): с 08.10 хост ClickHouse перестал принимать
 * соединения, и каждый запрос висел до своего таймаута — портрет ждал
 * 8 с, список задач 15 с, зарплата 6 с. Кэш ошибок в perfCache помнит
 * падение по ключу, но ключ у каждого дизайнера свой: каждое открытие
 * нового портрета снова ждало до упора.
 *
 * Как работает:
 *   - Перед запросом спрашиваем `/ping` — ClickHouse отвечает «Ok.» без
 *     авторизации и без нагрузки на базу — с коротким PING_TIMEOUT_MS.
 *   - Хост ответил (или успешно прошёл запрос) — REACHABLE_TTL_MS не
 *     пингуем.
 *   - Не ответил — UNREACHABLE_TTL_MS все запросы падают сразу ошибкой
 *     ClickHouseUnreachableError. Вызывающие её уже обрабатывают как любую
 *     ошибку источника: данные из кэша или пустое состояние.
 *   - Запрос упал — следующий сначала пингует. Медленный, но живой
 *     ClickHouse недоступным не станет: `/ping` ответит.
 *   - Параллельные проверки склеиваются в одну.
 */

/** Сколько ждём ответа на `/ping`. Живой хост из Railway отвечает за доли секунды. */
export const PING_TIMEOUT_MS = 3000;
/** Сколько после ответа хоста не пингуем перед запросами. */
export const REACHABLE_TTL_MS = 5 * 60 * 1000;
/** Сколько после неответа сразу отказываем, не трогая сеть. */
export const UNREACHABLE_TTL_MS = 60 * 1000;

/** ClickHouse не ответил на `/ping` — запрос не отправляли. */
export class ClickHouseUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClickHouseUnreachableError';
  }
}

type State =
  | { reachable: true; until: number }
  | { reachable: false; until: number; reason: string };

let state: State | null = null;
let checking: Promise<State> | null = null;

/** Сброс состояния — для тестов. */
export function resetClickHouseGate(): void {
  state = null;
  checking = null;
}

/**
 * Выполнить запрос к ClickHouse, если хост отвечает; иначе сразу бросить
 * ClickHouseUnreachableError. Без CLICKHOUSE_HOST/PORT проверку
 * пропускаем — запрос сам бросит понятную ошибку конфигурации.
 */
export async function withClickHouseGate<T>(run: () => Promise<T>): Promise<T> {
  const host = process.env.CLICKHOUSE_HOST;
  const port = process.env.CLICKHOUSE_PORT;
  if (host && port) {
    const s = await currentState(`http://${host}:${port}/ping`);
    if (!s.reachable) throw new ClickHouseUnreachableError(`ClickHouse недоступен: ${s.reason}`);
  }
  try {
    const value = await run();
    state = { reachable: true, until: Date.now() + REACHABLE_TTL_MS };
    return value;
  } catch (err) {
    // Причина может быть и в сети — следующий запрос сначала проверит хост
    if (state?.reachable) state = null;
    throw err;
  }
}

function currentState(pingUrl: string): Promise<State> {
  if (state && state.until > Date.now()) return Promise.resolve(state);
  if (!checking) {
    checking = ping(pingUrl).then((s) => {
      state = s;
      checking = null;
      return s;
    });
  }
  return checking;
}

async function ping(url: string): Promise<State> {
  try {
    // no-store: Next 14 иначе положит GET в Data Cache — и «Ok.» навсегда
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    await res.text().catch(() => ''); // дочитать «Ok.», чтобы освободить сокет
    if (res.ok) return { reachable: true, until: Date.now() + REACHABLE_TTL_MS };
    return unreachable(`/ping ответил ${res.status}`);
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    return unreachable(
      timedOut ? `/ping не ответил за ${PING_TIMEOUT_MS} мс` : `/ping: ${errorText(err)}`,
    );
  }
}

function unreachable(reason: string): State {
  return { reachable: false, until: Date.now() + UNREACHABLE_TTL_MS, reason };
}

function errorText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  // fetch прячет сетевую причину (ECONNREFUSED и т.п.) в cause
  const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
  return cause?.code ?? cause?.message ?? err.message;
}
