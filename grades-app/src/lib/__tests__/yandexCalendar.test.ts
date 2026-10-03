import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  YANDEX_CALENDAR_URL,
  openYandexCalendarOnChange,
  shouldOpenYandexCalendar,
  yandexCalendarUrl,
} from '../yandexCalendar';

describe('yandexCalendarUrl', () => {
  it('с датой — неделя с этой датой', () => {
    expect(yandexCalendarUrl('2026-10-15')).toBe(
      'https://calendar.yandex.ru/week?show_date=2026-10-15',
    );
  });

  // Не YYYY-MM-DD — не подставляем в адрес, ведём просто в календарь
  it('без даты или с кривой датой — просто календарь', () => {
    expect(yandexCalendarUrl()).toBe(YANDEX_CALENDAR_URL);
    expect(yandexCalendarUrl(null)).toBe(YANDEX_CALENDAR_URL);
    expect(yandexCalendarUrl('')).toBe(YANDEX_CALENDAR_URL);
    expect(yandexCalendarUrl('15.10.2026')).toBe(YANDEX_CALENDAR_URL);
    expect(yandexCalendarUrl('2026-10-15T00:00:00Z')).toBe(YANDEX_CALENDAR_URL);
  });
});

describe('shouldOpenYandexCalendar', () => {
  it('дату поставили или сменили — открываем', () => {
    expect(shouldOpenYandexCalendar('', '2026-10-15')).toBe(true);
    expect(shouldOpenYandexCalendar('2026-10-01', '2026-10-15')).toBe(true);
  });

  it('дату сняли или не меняли — не открываем', () => {
    expect(shouldOpenYandexCalendar('2026-10-15', '')).toBe(false);
    expect(shouldOpenYandexCalendar('2026-10-15', '2026-10-15')).toBe(false);
    expect(shouldOpenYandexCalendar('', '')).toBe(false);
  });
});

describe('openYandexCalendarOnChange', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('открывает новую вкладку без opener и referrer', () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    openYandexCalendarOnChange('', '2026-10-15');
    expect(open).toHaveBeenCalledWith(
      'https://calendar.yandex.ru/week?show_date=2026-10-15',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('дата не изменилась — вкладку не открывает', () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    openYandexCalendarOnChange('2026-10-15', '2026-10-15');
    openYandexCalendarOnChange('2026-10-15', '');
    expect(open).not.toHaveBeenCalled();
  });
});
