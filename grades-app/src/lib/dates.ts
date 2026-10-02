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

/** «год / года / лет» к числу лет. */
function yearsWord(n: number): string {
  const last = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'лет';
  if (last === 1) return 'год';
  if (last >= 2 && last <= 4) return 'года';
  return 'лет';
}

/**
 * Календарная дата (YYYY-MM-DD) из строки: дату как есть, момент — по
 * Москве (как todayMoscowIso). null — не дата.
 */
function calendarDay(iso: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : moscowIsoDate(d);
}

/**
 * Сколько прошло с даты до сегодня (по Москве): «Сегодня», «Вчера»,
 * «12 дн. назад», «6 мес. назад», «1 год назад», «1 год 3 мес. назад»,
 * «5 лет назад». Месяцы — полные, как у возраста: месяц прошёл, когда
 * наступило то же число; 31-е в коротком месяце наступает в его последний
 * день. Меньше месяца — в днях: «Меньше месяца назад» в строке поп-апа
 * рядом с «Историей» не помещался (147px при 137 свободных).
 * Дата в будущем — «Вступит в силу 1 окт. 2026». Не дата — «—».
 * Первое применение — «Последний пересмотр» в блоке «Зарплата».
 */
export function elapsedSince(dateIso: string, todayIso: string = todayMoscowIso()): string {
  const from = calendarDay(dateIso);
  const to = calendarDay(todayIso);
  if (!from || !to) return '—';
  if (from > to) return `Вступит в силу ${formatDateShort(from)}`;

  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  // Последний день текущего месяца: Date.UTC с днём 0 — конец месяца m2
  const lastDay = new Date(Date.UTC(y2, m2, 0)).getUTCDate();
  let months = (y2 - y1) * 12 + (m2 - m1);
  if (d2 < Math.min(d1, lastDay)) months -= 1;

  if (months < 1) {
    const days = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
    if (days === 0) return 'Сегодня';
    if (days === 1) return 'Вчера';
    return `${days} дн. назад`;
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} мес. назад`;
  if (rest === 0) return `${years} ${yearsWord(years)} назад`;
  return `${years} ${yearsWord(years)} ${rest} мес. назад`;
}
