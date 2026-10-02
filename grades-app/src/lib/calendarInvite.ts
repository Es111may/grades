// Встреча по грейдированию — в календарь (Phase 25, направление
// «Грейды → Календарь»). Без интеграции и секретов: собираем файл .ics
// (RFC 5545), а его уже принимает любой календарь.
//
// Почему не ссылка на создание события в Я.Календаре: у Я.Календаря нет
// документированной ссылки с параметрами (название, время, участники), как
// у Google Calendar. Без входа calendar.yandex.ru/event?… уводит на
// лендинг 360.yandex.ru/calendar, проверить разбор параметров нечем. Поэтому
// «Открыть в Я.Календаре» = скачать .ics + открыть календарь, где файл
// импортируют: «Добавить» → «Импорт» → «Из файла» (справка Яндекса).
//
// Время встречи вводят по Москве, в файл пишем UTC: так календарь любого
// пояса покажет встречу в верный момент и не нужен блок VTIMEZONE.
//
// Чистые функции, без React и DOM — поведение проверяется тестами.

import { withPersonParam } from './personParam';

export const MOSCOW_TZ = 'Europe/Moscow';

/** Куда ведёт «Открыть в Я.Календаре»: там импортируют скачанный файл. */
export const YANDEX_CALENDAR_URL = 'https://calendar.yandex.ru/';

/** Длительности встречи на выбор, минуты. */
export const MEETING_DURATIONS = [30, 60, 90, 120] as const;
export type MeetingDuration = (typeof MEETING_DURATIONS)[number];
export const DEFAULT_MEETING_DURATION: MeetingDuration = 60;
/** Время по умолчанию, по Москве: середина дня — свободное окно чаще всего. */
export const DEFAULT_MEETING_TIME = '12:00';

export type CalendarPerson = { name: string; email: string };

export type GradingMeeting = {
  /** Уникальный id события: по нему календарь узнаёт повторный импорт. */
  uid: string;
  /** Начало — момент времени (UTC), см. moscowToUtc. */
  start: Date;
  durationMin: number;
  summary: string;
  description?: string;
  /** Ссылка на поп-ап в Грейдах — отдельным полем события. */
  url?: string;
  /** Тот, кто ставит встречу. В файле — только если есть участники. */
  organizer?: CalendarPerson | null;
  attendees: CalendarPerson[];
};

// ─── Время ─────────────────────────────────────────────────────────────

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// input[type=time] отдаёт HH:MM, а при шаге меньше минуты — HH:MM:SS
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

let moscowParts: Intl.DateTimeFormat | null = null;

/** Смещение пояса в момент `at`, мс: местное время минус UTC. */
function moscowOffsetMs(at: number): number {
  moscowParts ??= new Intl.DateTimeFormat('en-US', {
    timeZone: MOSCOW_TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = moscowParts.formatToParts(new Date(at));
  const n = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  // % 24 — на случай движка, который пишет полночь как «24»
  const wall = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'), n('second'));
  return wall - Math.floor(at / 1000) * 1000;
}

/**
 * Дата и время по Москве (YYYY-MM-DD и HH:MM) → момент в UTC.
 * Смещение берём из базы поясов, а не «+3» руками: Москва живёт без
 * перехода на летнее время с 2014-го, но правило может поменяться снова.
 * Вторая итерация — на случай, если смещение в найденный момент другое
 * (стык перехода). null — дата или время не разбираются (31 февраля,
 * «24:00»).
 */
export function moscowToUtc(date: string, time: string): Date | null {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time);
  if (!d || !t) return null;
  const [y, m, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const wall = Date.UTC(y, m - 1, day, Number(t[1]), Number(t[2]));
  const probe = new Date(wall);
  if (probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== day) return null;
  let utc = wall - moscowOffsetMs(wall);
  const again = wall - moscowOffsetMs(utc);
  if (again !== utc) utc = again;
  return new Date(utc);
}

/** Момент → DATE-TIME в UTC: 20261015T090000Z. */
export function formatIcsUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// ─── Тексты события ────────────────────────────────────────────────────

/** Название встречи: «Грейдирование — Имя Фамилия». */
export function gradingMeetingTitle(fullName: string): string {
  return `Грейдирование — ${fullName.trim()}`;
}

/**
 * Описание: ссылки на поп-ап человека в Грейдах и на его портрет —
 * открыть перед встречей. origin — без слеша на конце.
 */
export function gradingMeetingDescription(origin: string, personId: number): string {
  const base = origin.replace(/\/+$/, '');
  return [
    `Грейды: ${gradingPopupUrl(base, personId)}`,
    `Портрет: ${base}/lead/portrait?id=${personId}`,
  ].join('\n');
}

/** Ссылка на поп-ап 360 — тот же адрес, что даёт ?person= (lib/personParam). */
export function gradingPopupUrl(origin: string, personId: number): string {
  return `${origin.replace(/\/+$/, '')}${withPersonParam('/admin/users', personId)}`;
}

/**
 * Имя файла: grading-<фамилия>-<дата>.ics. Фамилия — последнее слово
 * ФИО (в команде имена записаны «Имя Фамилия»). Символы, которые нельзя
 * в имени файла, выкидываем; не осталось ничего — без фамилии.
 */
export function icsFileName(fullName: string, date: string): string {
  const words = fullName.trim().split(/\s+/);
  const surname = (words[words.length - 1] ?? '').replace(/[\\/:*?"<>|.]+/g, '');
  return surname ? `grading-${surname}-${date}.ics` : `grading-${date}.ics`;
}

// ─── Сборка .ics ───────────────────────────────────────────────────────

/**
 * Значение типа TEXT (RFC 5545, 3.3.11): обратный слеш, «;» и «,»
 * экранируются, перевод строки — литералом \n. Слеш первым — иначе
 * задвоились бы слеши, добавленные следом.
 */
export function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Значение параметра (CN=…): всегда в кавычках — тогда «:», «;» и «,» в
 * имени безопасны. Кавычек и управляющих символов (переводов строки)
 * внутри быть не может — выкидываем.
 */
function paramValue(s: string): string {
  const clean = Array.from(s)
    .filter((ch) => ch !== '"' && ch.codePointAt(0)! >= 0x20 && ch !== '\u007f')
    .join('');
  return `"${clean.trim()}"`;
}

/** Длина символа в UTF-8, байт. */
function utf8Len(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/**
 * Свёртка строки (RFC 5545, 3.1): не длиннее 75 октетов без CRLF,
 * продолжение — с новой строки через пробел (пробел входит в 75).
 * Режем по границе символа: кириллица — два байта, и разрезанная буква
 * превратилась бы в мусор.
 */
export function foldIcsLine(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const len = utf8Len(ch.codePointAt(0)!);
    if (bytes + len > limit) {
      out.push(current);
      current = ' ';
      bytes = 1;
      limit = 75;
    }
    current += ch;
    bytes += len;
  }
  out.push(current);
  return out.join('\r\n');
}

const EMAIL_RE = /^[^\s@:;,<>"]+@[^\s@:;,<>"]+\.[^\s@:;,<>"]+$/;

/**
 * Файл .ics одного события. METHOD не ставим: это не приглашение по
 * iTIP (RFC 5546), а событие для импорта. С METHOD:REQUEST клиенты
 * показывали бы его как входящее приглашение от самого себя, а
 * METHOD:PUBLISH по RFC 5546 участников не допускает.
 *
 * Участники — без дублей по почте и без тех, у кого почта не похожа на
 * почту. ORGANIZER — только при участниках (RFC 5545, 3.8.4.3: он есть у
 * групповых событий, у личных — нет). Организатор среди участников —
 * сразу «принял», без запроса ответа. Почты организатора нет (в Грейдах
 * не бывает: почта — логин) — участников всё равно оставляем: календари
 * такой файл принимают, а встреча без приглашённых бесполезна.
 */
export function buildGradingIcs(meeting: GradingMeeting, now: Date = new Date()): string {
  const end = new Date(meeting.start.getTime() + meeting.durationMin * 60_000);

  const seen = new Set<string>();
  const attendees = meeting.attendees.filter((p) => {
    const key = p.email.trim().toLowerCase();
    if (!EMAIL_RE.test(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const organizer =
    meeting.organizer && EMAIL_RE.test(meeting.organizer.email.trim()) && attendees.length > 0
      ? meeting.organizer
      : null;
  const organizerKey = organizer?.email.trim().toLowerCase() ?? null;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//idaproject//Grades//RU',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(meeting.uid)}`,
    `DTSTAMP:${formatIcsUtc(now)}`,
    `DTSTART:${formatIcsUtc(meeting.start)}`,
    `DTEND:${formatIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(meeting.summary)}`,
  ];
  if (meeting.description) lines.push(`DESCRIPTION:${escapeIcsText(meeting.description)}`);
  // URL — тип URI, не TEXT: не экранируется
  if (meeting.url) lines.push(`URL:${meeting.url}`);
  if (organizer) {
    lines.push(`ORGANIZER;CN=${paramValue(organizer.name)}:mailto:${organizer.email.trim()}`);
  }
  for (const p of attendees) {
    const isOrganizer = p.email.trim().toLowerCase() === organizerKey;
    const status = isOrganizer ? 'PARTSTAT=ACCEPTED' : 'PARTSTAT=NEEDS-ACTION;RSVP=TRUE';
    lines.push(
      `ATTENDEE;CN=${paramValue(p.name)};ROLE=REQ-PARTICIPANT;${status}:mailto:${p.email.trim()}`,
    );
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
