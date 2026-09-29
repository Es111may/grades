import { describe, it, expect } from 'vitest';
import {
  SEASONS,
  activeSeason,
  reminderWindow,
  seasonDeadlineLabel,
  type Season,
} from '../assessmentSeason';

// Даты — в локальном времени: компоненты сравнивают по getMonth/getDate.
const at = (month: number, day: number, hour = 12) => new Date(2026, month - 1, day, hour);

describe('activeSeason — весна: март и 1 апреля', () => {
  it('28 февраля — вне окна', () => expect(activeSeason(at(2, 28))).toBeNull());
  it('1 марта — весна', () => expect(activeSeason(at(3, 1))).toBe('spring'));
  it('31 марта — весна', () => expect(activeSeason(at(3, 31))).toBe('spring'));
  it('1 апреля — весна, день старта включительно', () =>
    expect(activeSeason(at(4, 1))).toBe('spring'));
  it('2 апреля — вне окна', () => expect(activeSeason(at(4, 2))).toBeNull());
});

describe('activeSeason — осень: сентябрь и 1 октября', () => {
  it('31 августа — вне окна', () => expect(activeSeason(at(8, 31))).toBeNull());
  it('1 сентября — осень', () => expect(activeSeason(at(9, 1))).toBe('autumn'));
  it('30 сентября — осень', () => expect(activeSeason(at(9, 30))).toBe('autumn'));
  it('1 октября — осень, день старта включительно', () =>
    expect(activeSeason(at(10, 1))).toBe('autumn'));
  it('2 октября — вне окна', () => expect(activeSeason(at(10, 2))).toBeNull());
});

describe('activeSeason — время суток не влияет', () => {
  it('1 марта 00:00 и 1 апреля 23:59 — весна', () => {
    expect(activeSeason(new Date(2026, 2, 1, 0, 0))).toBe('spring');
    expect(activeSeason(new Date(2026, 3, 1, 23, 59))).toBe('spring');
  });
  it('28 февраля 23:59 и 2 апреля 00:00 — вне окна', () => {
    expect(activeSeason(new Date(2026, 1, 28, 23, 59))).toBeNull();
    expect(activeSeason(new Date(2026, 3, 2, 0, 0))).toBeNull();
  });
  it('високосный год: 29 февраля — вне окна', () => {
    expect(activeSeason(new Date(2028, 1, 29))).toBeNull();
  });
});

describe('seasonDeadlineLabel', () => {
  it('весна — «1 апреля»', () => expect(seasonDeadlineLabel('spring')).toBe('1 апреля'));
  it('осень — «1 октября»', () => expect(seasonDeadlineLabel('autumn')).toBe('1 октября'));
});

describe('SEASONS — единственный источник дат', () => {
  it('сезоны: 1 апреля – 1 мая и 1 октября – 1 ноября', () => {
    expect(SEASONS.spring).toEqual({ start: { month: 4, day: 1 }, end: { month: 5, day: 1 } });
    expect(SEASONS.autumn).toEqual({ start: { month: 10, day: 1 }, end: { month: 11, day: 1 } });
  });

  for (const season of Object.keys(SEASONS) as Season[]) {
    const { month, day } = SEASONS[season].start;

    it(`${season}: окно — месяц перед стартом по день старта`, () => {
      const { from, to } = reminderWindow(season, 2026);
      expect(to).toEqual(new Date(2026, month - 1, day));
      expect(from).toEqual(new Date(2026, month - 2, day));
      expect(activeSeason(from)).toBe(season);
      expect(activeSeason(to)).toBe(season);
      expect(activeSeason(new Date(2026, month - 2, day - 1))).toBeNull();
      expect(activeSeason(new Date(2026, month - 1, day + 1))).toBeNull();
    });

    it(`${season}: подпись срока — число и месяц старта`, () => {
      expect(seasonDeadlineLabel(season)).toMatch(new RegExp(`^${day} `));
    });
  }
});
