import { describe, expect, it } from 'vitest';
import { moscowIsoDate, todayLocalIso, todayMoscowIso } from '../dates';

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

// Моменты заданы в UTC (суффикс Z), поэтому результат не зависит от пояса,
// в котором запущены тесты: сервер работает в UTC, пользователи — в Москве.
describe('todayMoscowIso / moscowIsoDate', () => {
  it('00:30 по Москве — уже новый день, хотя по UTC ещё вчера', () => {
    expect(todayMoscowIso(new Date('2026-09-29T21:30Z'))).toBe('2026-09-30');
  });

  it('23:59 по Москве — ещё тот же день', () => {
    expect(todayMoscowIso(new Date('2026-09-30T20:59Z'))).toBe('2026-09-30');
  });

  it('ровно полночь по Москве — следующий день', () => {
    expect(todayMoscowIso(new Date('2026-09-30T21:00Z'))).toBe('2026-10-01');
  });

  it('смена года и ведущие нули', () => {
    expect(moscowIsoDate(new Date('2026-12-31T21:00Z'))).toBe('2027-01-01');
    expect(moscowIsoDate(new Date('2026-01-05T09:00Z'))).toBe('2026-01-05');
  });
});
