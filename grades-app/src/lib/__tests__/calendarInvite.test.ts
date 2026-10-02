import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MEETING_DURATION,
  DEFAULT_MEETING_TIME,
  MEETING_DURATIONS,
  buildGradingIcs,
  escapeIcsText,
  foldIcsLine,
  formatIcsUtc,
  gradingMeetingDescription,
  gradingMeetingTitle,
  gradingPopupUrl,
  icsFileName,
  moscowToUtc,
  type GradingMeeting,
} from '../calendarInvite';

/** Развернуть свёрнутые строки (RFC 5545, 3.1) — обратная операция. */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, '').split('\r\n').filter(Boolean);
}

const NOW = new Date('2026-10-03T08:15:42.123Z');

function meeting(over: Partial<GradingMeeting> = {}): GradingMeeting {
  return {
    uid: 'grading-12-2026-10-15-abc123@grades.local',
    start: moscowToUtc('2026-10-15', '12:00')!,
    durationMin: 60,
    summary: gradingMeetingTitle('Иван Иванов'),
    description: gradingMeetingDescription('https://grades.local', 12),
    url: gradingPopupUrl('https://grades.local', 12),
    organizer: { name: 'Павел Гавриченко', email: 'pg@idaproject.com' },
    attendees: [
      { name: 'Иван Иванов', email: 'ivan@idaproject.com' },
      { name: 'Пётр Петров', email: 'petr@idaproject.com' },
    ],
    ...over,
  };
}

describe('Время встречи — по Москве в UTC', () => {
  it('12:00 МСК — 09:00 UTC того же дня', () => {
    expect(moscowToUtc('2026-10-15', '12:00')!.toISOString()).toBe('2026-10-15T09:00:00.000Z');
  });

  it('ночь по Москве — ещё вчера по UTC', () => {
    expect(moscowToUtc('2026-10-15', '01:30')!.toISOString()).toBe('2026-10-14T22:30:00.000Z');
    expect(moscowToUtc('2027-01-01', '00:00')!.toISOString()).toBe('2026-12-31T21:00:00.000Z');
  });

  it('зимой и летом одинаково: перехода на летнее время нет', () => {
    expect(moscowToUtc('2026-01-15', '12:00')!.toISOString()).toBe('2026-01-15T09:00:00.000Z');
    expect(moscowToUtc('2026-07-15', '12:00')!.toISOString()).toBe('2026-07-15T09:00:00.000Z');
  });

  it('секунды из поля времени не мешают', () => {
    expect(moscowToUtc('2026-10-15', '12:00:00')!.toISOString()).toBe('2026-10-15T09:00:00.000Z');
  });

  it('несуществующие дата и время — null', () => {
    for (const [d, t] of [
      ['2026-02-30', '12:00'],
      ['2026-13-01', '12:00'],
      ['2026-10-15', '24:00'],
      ['2026-10-15', '12:60'],
      ['', '12:00'],
      ['2026-10-15', ''],
      ['15.10.2026', '12:00'],
    ]) {
      expect(moscowToUtc(d, t), `${d} ${t}`).toBeNull();
    }
  });

  it('DATE-TIME в UTC без миллисекунд', () => {
    expect(formatIcsUtc(NOW)).toBe('20261003T081542Z');
  });

  it('по умолчанию — 12:00 и час; длительности 30–120', () => {
    expect(DEFAULT_MEETING_TIME).toBe('12:00');
    expect(DEFAULT_MEETING_DURATION).toBe(60);
    expect([...MEETING_DURATIONS]).toEqual([30, 60, 90, 120]);
  });
});

describe('Тексты события', () => {
  it('название и описание со ссылками на поп-ап и портрет', () => {
    expect(gradingMeetingTitle('  Иван Иванов ')).toBe('Грейдирование — Иван Иванов');
    expect(gradingMeetingDescription('https://grades.local/', 12)).toBe(
      'Грейды: https://grades.local/admin/users?person=12\n' +
        'Портрет: https://grades.local/lead/portrait?id=12',
    );
  });

  it('имя файла — фамилия и дата', () => {
    expect(icsFileName('Иван Иванов', '2026-10-15')).toBe('grading-Иванов-2026-10-15.ics');
    expect(icsFileName('Анна Мария Смит-Петрова', '2026-10-15')).toBe(
      'grading-Смит-Петрова-2026-10-15.ics',
    );
    expect(icsFileName('Иван Ива/нов:', '2026-10-15')).toBe('grading-Иванов-2026-10-15.ics');
    expect(icsFileName('  ', '2026-10-15')).toBe('grading-2026-10-15.ics');
  });
});

describe('Экранирование и свёртка (RFC 5545)', () => {
  it('TEXT: слеш, «;», «,» и перевод строки', () => {
    expect(escapeIcsText('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf');
  });

  it('строки не длиннее 75 октетов, буквы не режутся, свёртка обратима', () => {
    const long = `DESCRIPTION:${'Грейдирование, ссылка; '.repeat(12)}`;
    const folded = foldIcsLine(long);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const [i, part] of parts.entries()) {
      expect(Buffer.byteLength(part, 'utf8'), part).toBeLessThanOrEqual(75);
      if (i > 0) expect(part.startsWith(' ')).toBe(true);
      // Разрезанный двухбайтовый символ дал бы U+FFFD при декодировании
      expect(Buffer.from(part, 'utf8').toString('utf8')).toBe(part);
    }
    expect(folded.replace(/\r\n /g, '')).toBe(long);
  });

  it('короткая строка не сворачивается', () => {
    expect(foldIcsLine('VERSION:2.0')).toBe('VERSION:2.0');
    const exactly75 = `X:${'a'.repeat(73)}`;
    expect(foldIcsLine(exactly75)).toBe(exactly75);
    expect(foldIcsLine(`${exactly75}b`)).toBe(`${exactly75}\r\n b`);
  });
});

describe('Файл .ics встречи по грейдированию', () => {
  it('каркас VCALENDAR/VEVENT, CRLF, время в UTC', () => {
    const ics = buildGradingIcs(meeting({ durationMin: 90 }), NOW);
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    const lines = unfold(ics);
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines.some((l) => l.startsWith('PRODID:'))).toBe(true);
    expect(lines).toContain('BEGIN:VEVENT');
    expect(lines).toContain('UID:grading-12-2026-10-15-abc123@grades.local');
    expect(lines).toContain('DTSTAMP:20261003T081542Z');
    expect(lines).toContain('DTSTART:20261015T090000Z');
    expect(lines).toContain('DTEND:20261015T103000Z');
    expect(lines).toContain('SUMMARY:Грейдирование — Иван Иванов');
    expect(lines).toContain(
      'DESCRIPTION:Грейды: https://grades.local/admin/users?person=12\\nПортрет: https://grades.local/lead/portrait?id=12',
    );
    expect(lines).toContain('URL:https://grades.local/admin/users?person=12');
    expect(lines.at(-2)).toBe('END:VEVENT');
    expect(lines.at(-1)).toBe('END:VCALENDAR');
    // Не приглашение iTIP, а событие для импорта
    expect(lines.some((l) => l.startsWith('METHOD:'))).toBe(false);
    for (const raw of ics.split('\r\n')) {
      expect(Buffer.byteLength(raw, 'utf8'), raw).toBeLessThanOrEqual(75);
    }
  });

  it('организатор и участники с именами и mailto', () => {
    const lines = unfold(buildGradingIcs(meeting(), NOW));
    expect(lines).toContain('ORGANIZER;CN="Павел Гавриченко":mailto:pg@idaproject.com');
    expect(lines).toContain(
      'ATTENDEE;CN="Иван Иванов";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:ivan@idaproject.com',
    );
    expect(lines).toContain(
      'ATTENDEE;CN="Пётр Петров";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:petr@idaproject.com',
    );
  });

  it('организатор среди участников — уже принял, без запроса ответа', () => {
    const lines = unfold(
      buildGradingIcs(
        meeting({
          organizer: { name: 'Пётр Петров', email: 'Petr@idaproject.com' },
        }),
        NOW,
      ),
    );
    expect(lines).toContain(
      'ATTENDEE;CN="Пётр Петров";ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:petr@idaproject.com',
    );
  });

  it('без участников нет и организатора: событие личное', () => {
    const lines = unfold(buildGradingIcs(meeting({ attendees: [] }), NOW));
    expect(lines.some((l) => l.startsWith('ORGANIZER'))).toBe(false);
    expect(lines.some((l) => l.startsWith('ATTENDEE'))).toBe(false);
  });

  it('без почты организатора участники остаются', () => {
    const lines = unfold(
      buildGradingIcs(meeting({ organizer: { name: 'Без почты', email: '' } }), NOW),
    );
    expect(lines.some((l) => l.startsWith('ORGANIZER'))).toBe(false);
    expect(lines.filter((l) => l.startsWith('ATTENDEE'))).toHaveLength(2);
  });

  it('дубли по почте и кривые почты выкидываются', () => {
    const lines = unfold(
      buildGradingIcs(
        meeting({
          attendees: [
            { name: 'Иван Иванов', email: 'ivan@idaproject.com' },
            { name: 'Иван (лид)', email: 'IVAN@idaproject.com' },
            { name: 'Без почты', email: '' },
            { name: 'Кривая', email: 'not-an-email' },
            { name: 'Взлом', email: 'x@y.ru\r\nATTENDEE:mailto:evil@z.ru' },
          ],
        }),
        NOW,
      ),
    );
    expect(lines.filter((l) => l.startsWith('ATTENDEE'))).toHaveLength(1);
    expect(lines.join('\n')).not.toContain('evil');
  });

  it('спецсимволы в названии и имени не ломают разметку', () => {
    const lines = unfold(
      buildGradingIcs(
        meeting({
          summary: 'Грейдирование; итог, «план»\nвторая строка',
          attendees: [{ name: 'Имя "в кавычках"; с: двоеточием', email: 'q@idaproject.com' }],
        }),
        NOW,
      ),
    );
    expect(lines).toContain('SUMMARY:Грейдирование\\; итог\\, «план»\\nвторая строка');
    expect(lines).toContain(
      'ATTENDEE;CN="Имя в кавычках; с: двоеточием";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:q@idaproject.com',
    );
  });
});
