import { describe, expect, it } from 'vitest';
import { elapsedSince, formatDateShort, moscowIsoDate, todayLocalIso, todayMoscowIso } from '../dates';

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

// «Последний пересмотр» в блоке «Зарплата»: давность вместо даты.
// Сегодня в примерах — 2 октября 2026.
describe('elapsedSince', () => {
  const today = '2026-10-02';

  it('меньше месяца — в днях: сегодня, вчера, через 29 дней', () => {
    expect(elapsedSince('2026-10-02', today)).toBe('Сегодня');
    expect(elapsedSince('2026-10-01', today)).toBe('Вчера');
    expect(elapsedSince('2026-09-28', today)).toBe('4 дн. назад');
    expect(elapsedSince('2026-09-03', today)).toBe('29 дн. назад');
  });

  it('ровно месяц и 11 месяцев', () => {
    expect(elapsedSince('2026-09-02', today)).toBe('1 мес. назад');
    expect(elapsedSince('2025-11-02', today)).toBe('11 мес. назад');
    // За день до годовщины — ещё 11
    expect(elapsedSince('2025-10-03', today)).toBe('11 мес. назад');
  });

  it('годы — с месяцами и без, «год / года / лет»', () => {
    expect(elapsedSince('2025-10-02', today)).toBe('1 год назад');
    expect(elapsedSince('2025-07-01', today)).toBe('1 год 3 мес. назад');
    expect(elapsedSince('2024-10-02', today)).toBe('2 года назад');
    expect(elapsedSince('2021-10-02', today)).toBe('5 лет назад');
    expect(elapsedSince('2015-10-02', today)).toBe('11 лет назад');
    expect(elapsedSince('2005-10-02', today)).toBe('21 год назад');
    expect(elapsedSince('2002-04-02', today)).toBe('24 года 6 мес. назад');
  });

  it('31-е в коротком месяце наступает в его последний день', () => {
    expect(elapsedSince('2027-01-31', '2027-02-27')).toBe('27 дн. назад');
    expect(elapsedSince('2027-01-31', '2027-02-28')).toBe('1 мес. назад');
    expect(elapsedSince('2028-01-31', '2028-02-29')).toBe('1 мес. назад');
    expect(elapsedSince('2026-03-31', '2026-04-30')).toBe('1 мес. назад');
  });

  it('дата в будущем — «Вступит в силу» и дата', () => {
    expect(elapsedSince('2026-10-05', today)).toBe(`Вступит в силу ${formatDateShort('2026-10-05')}`);
    expect(elapsedSince('2026-10-05', today)).toMatch(/^Вступит в силу \d/);
  });

  // Момент из базы — по Москве: 2 сентября 21:30 UTC — уже 3 сентября,
  // и до полного месяца не хватает дня
  it('момент со временем — календарная дата по Москве', () => {
    expect(elapsedSince('2026-09-02T20:30:00Z', today)).toBe('1 мес. назад');
    expect(elapsedSince('2026-09-02T21:30:00Z', today)).toBe('29 дн. назад');
  });

  it('не дата — прочерк', () => {
    expect(elapsedSince('', today)).toBe('—');
    expect(elapsedSince('вчера', today)).toBe('—');
  });

  it('без «сегодня» — считает от сегодняшнего дня по Москве', () => {
    expect(elapsedSince(todayMoscowIso())).toBe('Сегодня');
  });
});
