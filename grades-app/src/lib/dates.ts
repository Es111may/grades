/**
 * Единый формат дат сервиса (Pavel, 12.07.2026):
 * «число месяц-сокращённо год» без «г.» — например «18 сент. 2024».
 */
export function formatDateShort(
  iso: string | Date | null | undefined,
): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return '—';
  return d
    .toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    .replace(/\s*г\.$/, '');
}

/**
 * Сегодня в формате input[type=date] (YYYY-MM-DD) — по местному времени.
 * Не toISOString(): тот даёт дату в UTC, и в Москве с 00:00 до 03:00
 * по умолчанию подставлялось бы вчера.
 */
export function todayLocalIso(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/**
 * Календарная дата момента `d` по Москве (YYYY-MM-DD) — независимо от пояса
 * процесса. Сервер на Railway живёт в UTC, пользователи в Москве (UTC+3):
 * с 00:00 до 03:00 по Москве UTC-дата ещё вчерашняя, и счётчики дней
 * («через N дн.», «просрочено») съезжали бы на сутки.
 * en-CA выбран ради готового формата YYYY-MM-DD.
 */
const MOSCOW_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function moscowIsoDate(d: Date): string {
  return MOSCOW_DATE_FORMAT.format(d);
}

/** Сегодня по Москве (YYYY-MM-DD) — для серверной логики и сравнения дат. */
export function todayMoscowIso(now: Date = new Date()): string {
  return moscowIsoDate(now);
}
