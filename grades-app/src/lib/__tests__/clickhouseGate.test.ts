import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClickHouseUnreachableError,
  REACHABLE_TTL_MS,
  UNREACHABLE_TTL_MS,
  resetClickHouseGate,
  withClickHouseGate,
} from '../clickhouseGate';

// Подменяем fetch: им ходит только /ping, запросы — в run().
const fetchMock = vi.fn();

const pingOk = () => fetchMock.mockResolvedValue(new Response('Ok.\n', { status: 200 }));
const pingTimeout = () =>
  fetchMock.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-12T09:00:00Z'));
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  resetClickHouseGate();
  process.env.CLICKHOUSE_HOST = 'ch.test';
  process.env.CLICKHOUSE_PORT = '8123';
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('withClickHouseGate — хост отвечает', () => {
  it('пингует /ping и выполняет запрос', async () => {
    pingOk();
    const run = vi.fn(async () => 42);
    expect(await withClickHouseGate(run)).toBe(42);
    expect(run).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://ch.test:8123/ping');
  });

  it('в пределах REACHABLE_TTL_MS повторно не пингует', async () => {
    pingOk();
    await withClickHouseGate(async () => 1);
    vi.advanceTimersByTime(REACHABLE_TTL_MS - 1);
    await withClickHouseGate(async () => 2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('после REACHABLE_TTL_MS без запросов — пингует снова', async () => {
    pingOk();
    await withClickHouseGate(async () => 1);
    vi.advanceTimersByTime(REACHABLE_TTL_MS + 1);
    await withClickHouseGate(async () => 2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('упавший запрос: ошибка наружу как есть, следующий запрос сначала пингует', async () => {
    pingOk();
    await expect(
      withClickHouseGate(async () => {
        throw new Error('Timeout error.');
      }),
    ).rejects.toThrow('Timeout error.');
    await withClickHouseGate(async () => 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('параллельные запросы ждут один пинг', async () => {
    pingOk();
    const results = await Promise.all([1, 2, 3].map((n) => withClickHouseGate(async () => n)));
    expect(results).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('withClickHouseGate — хост не отвечает', () => {
  it('таймаут /ping — запрос не отправляем, бросаем ClickHouseUnreachableError', async () => {
    pingTimeout();
    const run = vi.fn(async () => 1);
    const err = await withClickHouseGate(run).catch((e) => e);
    expect(err).toBeInstanceOf(ClickHouseUnreachableError);
    expect(err.message).toContain('не ответил за 3000 мс');
    expect(run).not.toHaveBeenCalled();
  });

  it('в пределах UNREACHABLE_TTL_MS отказываем сразу, без сети', async () => {
    pingTimeout();
    await withClickHouseGate(async () => 1).catch(() => {});
    vi.advanceTimersByTime(UNREACHABLE_TTL_MS - 1);
    await expect(withClickHouseGate(async () => 1)).rejects.toBeInstanceOf(ClickHouseUnreachableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('после UNREACHABLE_TTL_MS проверяем снова — хост ожил, запрос проходит', async () => {
    pingTimeout();
    await withClickHouseGate(async () => 1).catch(() => {});
    vi.advanceTimersByTime(UNREACHABLE_TTL_MS + 1);
    pingOk();
    expect(await withClickHouseGate(async () => 7)).toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('/ping ответил не 200 — тоже недоступен, с кодом в причине', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 502 }));
    await expect(withClickHouseGate(async () => 1)).rejects.toThrow('/ping ответил 502');
  });

  it('сетевая ошибка — код причины в сообщении', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
    );
    await expect(withClickHouseGate(async () => 1)).rejects.toThrow('ECONNREFUSED');
  });
});

describe('withClickHouseGate — без настроек хоста', () => {
  it('не пингует, запрос сам бросит ошибку конфигурации', async () => {
    delete process.env.CLICKHOUSE_HOST;
    const run = vi.fn(async () => {
      throw new Error('ClickHouse env vars not set');
    });
    await expect(withClickHouseGate(run)).rejects.toThrow('env vars not set');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
