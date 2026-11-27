import * as zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32 } from '../crc32';

describe('crc32 — IEEE, как CRC32() в ClickHouse и zlib', () => {
  it('тест-вектор: CRC32(\'hello\') = 907060870', () => {
    expect(crc32('hello')).toBe(907060870);
  });

  it('пустая строка — 0 (так ClickHouse считает и toString(NULL) после ifNull)', () => {
    expect(crc32('')).toBe(0);
  });

  it('стандартный вектор «123456789» — 0xCBF43926', () => {
    expect(crc32('123456789')).toBe(0xcbf43926);
  });

  it('над UTF-8 байтами: кириллица, ё, символы — паритет с zlib.crc32', () => {
    const z = (zlib as unknown as { crc32?: (b: Uint8Array) => number }).crc32;
    expect(z, 'zlib.crc32 есть с Node 20.15 / 22.2').toBeTypeOf('function');
    const samples = ['Анна Пример', 'Алёна', '2026-11-01', '150000', 'design.inhouse', 'a@ida.test', '✓ x', 'hello'];
    for (const s of samples) expect(crc32(s), s).toBe(z!(Buffer.from(s, 'utf8')));
  });
});
