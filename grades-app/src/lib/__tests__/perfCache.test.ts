import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TTL_MS,
  ERROR_TTL_MS,
  MAX_ENTRIES,
  STALE_MS,
  clearCache,
  getOrCompute,
  invalidate,
  setCached,
  withTimeout,
} from '../perfCache';

// Промис, который резолвим/реджектим руками — чтобы управлять «ClickHouse».
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Дать отработать микрозадачам (then-цепочкам внутри кэша).
const flush = () => Promise.resolve().then(() => Promise.resolve());

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-30T09:00:00Z'));
  clearCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getOrCompute — свежий кэш', () => {
  it('в пределах TTL считает один раз', async () => {
    const compute = vi.fn(async () => 42);
    expect(await getOrCompute('k', compute)).toBe(42);
    vi.advanceTimersByTime(DEFAULT_TTL_MS - 1);
    expect(await getOrCompute('k', compute)).toBe(42);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('разные ключи не пересекаются', async () => {
    expect(await getOrCompute('a', async () => 1)).toBe(1);
    expect(await getOrCompute('b', async () => 2)).toBe(2);
  });

  it('invalidate — следующий вызов считает заново', async () => {
    const compute = vi.fn(async () => 1);
    await getOrCompute('k', compute);
    invalidate('k');
    await getOrCompute('k', compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});

describe('getOrCompute — склейка параллельных вызовов', () => {
  it('одновременные вызовы с одним ключом ждут один расчёт', async () => {
    const d = deferred<string>();
    const compute = vi.fn(() => d.promise);
    const p1 = getOrCompute('k', compute);
    const p2 = getOrCompute('k', compute);
    const p3 = getOrCompute('k', compute);
    d.resolve('v');
    expect(await Promise.all([p1, p2, p3])).toEqual(['v', 'v', 'v']);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('ошибка общего расчёта доходит до всех ждущих', async () => {
    const d = deferred<string>();
    const compute = vi.fn(() => d.promise);
    const p1 = getOrCompute('k', compute);
    const p2 = getOrCompute('k', compute);
    d.reject(new Error('CH down'));
    await expect(p1).rejects.toThrow('CH down');
    await expect(p2).rejects.toThrow('CH down');
    expect(compute).toHaveBeenCalledTimes(1);
  });
});

describe('getOrCompute — stale-while-revalidate', () => {
  it('после TTL сразу отдаёт старое и обновляет в фоне', async () => {
    await getOrCompute('k', async () => 'old');
    vi.advanceTimersByTime(DEFAULT_TTL_MS + 1);

    const d = deferred<string>();
    const compute = vi.fn(() => d.promise);
    // Старое — сразу, не дожидаясь нового расчёта
    expect(await getOrCompute('k', compute)).toBe('old');
    expect(compute).toHaveBeenCalledTimes(1);

    // Пока фон считает, повторные вызовы не запускают второй расчёт
    expect(await getOrCompute('k', compute)).toBe('old');
    expect(compute).toHaveBeenCalledTimes(1);

    d.resolve('new');
    await flush();
    expect(await getOrCompute('k', compute)).toBe('new');
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('старше TTL + STALE_MS — старое не отдаём, ждём расчёт', async () => {
    await getOrCompute('k', async () => 'old');
    vi.advanceTimersByTime(DEFAULT_TTL_MS + STALE_MS + 1);
    expect(await getOrCompute('k', async () => 'new')).toBe('new');
  });

  it('упавшее фоновое обновление: отдаём старое и не повторяем 90 с', async () => {
    await getOrCompute('k', async () => 'old');
    vi.advanceTimersByTime(DEFAULT_TTL_MS + 1);

    const failing = vi.fn(async () => {
      throw new Error('CH down');
    });
    expect(await getOrCompute('k', failing)).toBe('old');
    await flush();
    expect(await getOrCompute('k', failing)).toBe('old');
    expect(failing).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(ERROR_TTL_MS + 1);
    const ok = vi.fn(async () => 'new');
    expect(await getOrCompute('k', ok)).toBe('old'); // старое + фоновый повтор
    await flush();
    expect(ok).toHaveBeenCalledTimes(1);
    expect(await getOrCompute('k', ok)).toBe('new');
  });
});

describe('getOrCompute — кэш ошибок', () => {
  it('после ошибки 90 с бросает ту же ошибку без нового запроса', async () => {
    const err = new Error('timeout');
    const compute = vi.fn(async () => {
      throw err;
    });
    await expect(getOrCompute('k', compute)).rejects.toBe(err);
    vi.advanceTimersByTime(ERROR_TTL_MS - 1);
    await expect(getOrCompute('k', compute)).rejects.toBe(err);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('после 90 с пробует снова и кэширует успех', async () => {
    await expect(
      getOrCompute('k', async () => {
        throw new Error('timeout');
      }),
    ).rejects.toThrow();
    vi.advanceTimersByTime(ERROR_TTL_MS + 1);
    const ok = vi.fn(async () => 7);
    expect(await getOrCompute('k', ok)).toBe(7);
    expect(await getOrCompute('k', ok)).toBe(7);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('ошибка одного ключа не блокирует другие', async () => {
    await expect(
      getOrCompute('bad', async () => {
        throw new Error('x');
      }),
    ).rejects.toThrow();
    expect(await getOrCompute('good', async () => 1)).toBe(1);
  });
});

describe('setCached', () => {
  it('положенное значение отдаётся без расчёта', async () => {
    setCached('k', 'primed');
    const compute = vi.fn(async () => 'computed');
    expect(await getOrCompute('k', compute)).toBe('primed');
    expect(compute).not.toHaveBeenCalled();
  });

  it('снимает запомненную ошибку', async () => {
    await expect(
      getOrCompute('k', async () => {
        throw new Error('x');
      }),
    ).rejects.toThrow();
    setCached('k', 'primed');
    expect(await getOrCompute('k', async () => 'computed')).toBe('primed');
  });

  it(`держит не больше ${MAX_ENTRIES} ключей, вытесняет самые старые`, async () => {
    for (let i = 0; i <= MAX_ENTRIES; i++) setCached(`k${i}`, i);
    const compute = vi.fn(async () => -1);
    // k0 вытеснен — считаем заново; k1 и последний — на месте
    expect(await getOrCompute('k0', compute)).toBe(-1);
    expect(await getOrCompute(`k${MAX_ENTRIES}`, compute)).toBe(MAX_ENTRIES);
    expect(compute).toHaveBeenCalledTimes(1);
  });
});

describe('withTimeout', () => {
  it('успел — отдаёт значение', async () => {
    const p = withTimeout(Promise.resolve(5), 1000);
    expect(await p).toBe(5);
  });

  it('не успел — ошибка с меткой, а расчёт дописывает кэш в фоне', async () => {
    const d = deferred<string>();
    const cached = getOrCompute('slow', () => d.promise);
    const budgeted = withTimeout(cached, 8000, 'on-time');
    vi.advanceTimersByTime(8000);
    await expect(budgeted).rejects.toThrow('on-time');

    d.resolve('late');
    await flush();
    const compute = vi.fn(async () => 'again');
    expect(await getOrCompute('slow', compute)).toBe('late');
    expect(compute).not.toHaveBeenCalled();
  });

  it('ошибка до таймаута пробрасывается как есть', async () => {
    const err = new Error('boom');
    await expect(withTimeout(Promise.reject(err), 1000)).rejects.toBe(err);
  });
});
