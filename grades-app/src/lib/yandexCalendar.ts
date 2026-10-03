// «Дата грейдирования → Я.Календарь» (Pavel, 03.10.2026): поставили или
// сменили дату грейдирования — открываем Я.Календарь в новой вкладке, и
// встречу создают уже там. Без файлов .ics и без интеграции: Грейды ни от
// чего не зависят, календарь — тоже.
//
// Ссылка — на неделю с этой датой (week?show_date=). Параметр не описан в
// справке Яндекса, а без входа calendar.yandex.ru уводит на лендинг 360 —
// проверить разбор нечем. Незнакомый параметр календарь не ломает: в худшем
// случае откроется текущая неделя.

/** Я.Календарь без привязки к дате. */
export const YANDEX_CALENDAR_URL = 'https://calendar.yandex.ru/';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Ссылка на неделю с датой `date` (YYYY-MM-DD); без даты — на календарь. */
export function yandexCalendarUrl(date?: string | null): string {
  if (!date || !DATE_RE.test(date)) return YANDEX_CALENDAR_URL;
  return `${YANDEX_CALENDAR_URL}week?show_date=${date}`;
}

/**
 * Нужно ли открывать календарь: дату поставили или сменили. Снятая дата
 * (пусто) и та же самая — не повод.
 */
export function shouldOpenYandexCalendar(before: string, after: string): boolean {
  return !!after && after !== before;
}

/**
 * Открыть Я.Календарь на дате `after`, если она поставлена или сменена.
 * Вызывать синхронно в обработчике клика, до первого await: иначе браузер
 * сочтёт вкладку всплывающим окном и заблокирует. Сохранение потом не
 * удалось — вкладка остаётся, ошибку показывает форма.
 */
export function openYandexCalendarOnChange(before: string, after: string): void {
  if (!shouldOpenYandexCalendar(before, after)) return;
  window.open(yandexCalendarUrl(after), '_blank', 'noopener,noreferrer');
}
