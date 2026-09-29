import { describe, expect, it } from 'vitest';
import { todayLocalIso } from '../dates';

describe('todayLocalIso', () => {
  it('дата по местному времени, с ведущими нулями', () => {
    expect(todayLocalIso(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
    expect(todayLocalIso(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  // Сразу после полуночи и перед ней: в любом поясе, кроме UTC, у одного
  // из моментов дата по UTC другая (в Москве 00:30 — ещё вчера по UTC).
  // Поле по умолчанию должно показывать местную дату в обоих случаях.
  it('около полуночи — местная дата, а не дата по UTC', () => {
    expect(todayLocalIso(new Date(2026, 8, 30, 0, 30))).toBe('2026-09-30');
    expect(todayLocalIso(new Date(2026, 8, 30, 23, 30))).toBe('2026-09-30');
  });
});
