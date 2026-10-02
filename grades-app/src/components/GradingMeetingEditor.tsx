'use client';

import { useId, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import {
  DEFAULT_MEETING_DURATION,
  DEFAULT_MEETING_TIME,
  MEETING_DURATIONS,
  YANDEX_CALENDAR_URL,
  buildGradingIcs,
  gradingMeetingDescription,
  gradingMeetingTitle,
  gradingPopupUrl,
  icsFileName,
  moscowToUtc,
  type CalendarPerson,
  type MeetingDuration,
} from '@/lib/calendarInvite';
import { CheckIcon, CloseIcon } from '@/components/icons';

/** Человек в списке участников: почта может быть неизвестна. */
export type MeetingPerson = { id: number; fullName: string; email: string | null };

const DURATION_LABEL: Record<MeetingDuration, string> = {
  30: '30 мин',
  60: '1 ч',
  90: '1,5 ч',
  120: '2 ч',
};

const PERSON_ROLE_LABEL: Record<string, string> = {
  designer: 'Дизайнер',
  stardiz: 'Стардиз',
};

/**
 * Скачать текст файлом — через Blob URL, без сервера. Ссылку отзываем не
 * сразу: Safari начинает скачивание асинхронно и с отозванной ссылкой
 * сохранял пустой файл.
 */
function downloadTextFile(text: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * «В календарь» — встреча по грейдированию (Phase 25, Грейды → Календарь).
 * Встаёт под строкой «Грейдирование» в поп-апе 360, разметка — как у
 * GradingDateEditor: карточка с полями, без своего поповера (поп-ап
 * скроллится и обрезал бы его).
 *
 * Дата — плановая дата грейдирования (прошла — сегодня: встреча в прошлом
 * бесполезна), время 12:00 по Москве, час. Участники — сам человек, его
 * лид и стардиз: отмечены, если есть почта. Почты на экране не показываем —
 * только имена.
 *
 * Ссылки с параметрами на создание события у Я.Календаря нет (см.
 * lib/calendarInvite), поэтому «Открыть в Я.Календаре» скачивает .ics и
 * открывает календарь — файл там импортируют. «Скачать .ics» — для
 * любого другого календаря. Escape закрывает карточку и дальше не
 * всплывает, чтобы поп-ап не закрылся вместе с ней.
 */
export default function GradingMeetingEditor({
  person,
  personRole,
  lead,
  stardiz,
  organizer,
  initialDate,
  onClose,
}: {
  person: MeetingPerson;
  /** Роль человека — подпись в списке участников. */
  personRole: string;
  lead: MeetingPerson | null;
  stardiz: MeetingPerson | null;
  /** Тот, кто ставит встречу: организатор в файле. */
  organizer: CalendarPerson | null;
  /** YYYY-MM-DD — с какой даты начать. */
  initialDate: string;
  onClose: () => void;
}) {
  const ids = useId();
  const [title, setTitle] = useState(() => gradingMeetingTitle(person.fullName));
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(DEFAULT_MEETING_TIME);
  const [duration, setDuration] = useState<MeetingDuration>(DEFAULT_MEETING_DURATION);
  // Что уже сделали — подсказка под кнопками. Правка полей её сбрасывает:
  // скачанный файл уже не про эти дату и время.
  const [done, setDone] = useState<'yandex' | 'file' | null>(null);

  // Лид бывает и стардизом (формальный лид) — тогда это один участник
  const people = useMemo(() => {
    const sameLeadAndStardiz = !!lead && !!stardiz && lead.id === stardiz.id;
    const list: (MeetingPerson & { role: string })[] = [
      { ...person, role: PERSON_ROLE_LABEL[personRole] ?? 'Дизайнер' },
    ];
    if (lead) list.push({ ...lead, role: sameLeadAndStardiz ? 'Лид и стардиз' : 'Лид' });
    if (stardiz && !sameLeadAndStardiz) list.push({ ...stardiz, role: 'Стардиз' });
    // Человек сам себе не лид, но защитимся от кривых данных
    return list.filter((p, i) => list.findIndex((q) => q.id === p.id) === i);
  }, [person, personRole, lead, stardiz]);

  const [checked, setChecked] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(people.map((p) => [p.id, !!p.email])),
  );

  const start = moscowToUtc(date, time);
  const valid = !!start && title.trim().length > 0;

  function touch() {
    setDone(null);
  }

  /** Собрать файл по текущим полям. null — дата или время не разобрались. */
  function makeFile(): { text: string; fileName: string } | null {
    if (!start || !title.trim()) return null;
    const { origin, host } = window.location;
    // UID: человек и дата — читаемо; хвост — чтобы два разных файла на
    // одну дату не слились в одно событие при импорте
    const tail = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const attendees = people
      .filter((p) => checked[p.id] && p.email)
      .map((p) => ({ name: p.fullName, email: p.email! }));
    const text = buildGradingIcs({
      uid: `grading-${person.id}-${date}-${tail}@${host}`,
      start,
      durationMin: duration,
      summary: title.trim(),
      description: gradingMeetingDescription(origin, person.id),
      url: gradingPopupUrl(origin, person.id),
      organizer,
      attendees,
    });
    return { text, fileName: icsFileName(person.fullName, date) };
  }

  function download(): boolean {
    const file = makeFile();
    if (!file) return false;
    downloadTextFile(file.text, file.fileName, 'text/calendar;charset=utf-8');
    return true;
  }

  // Ссылка, а не window.open: новая вкладка открывается самим браузером
  // по клику — блокировщик всплывающих окон её не трогает. Файл
  // скачивается в том же клике.
  function openYandex(e: MouseEvent<HTMLAnchorElement>) {
    if (!valid || !download()) {
      e.preventDefault();
      return;
    }
    setDone('yandex');
  }

  function downloadOnly() {
    if (download()) setDone('file');
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      // preventDefault — ещё и метка для оконного обработчика поп-апа
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  }

  return (
    <div
      data-comment-anchor="popup-360-grading-meeting"
      className="rounded-card border border-cloud p-3 flex flex-col gap-3
                 origin-top-right animate-scale-in"
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center gap-3">
        <span className="text-stone">Встреча в календаре</span>
        {/* Хит-зона 32px, крестик — по краю поля, как у полей ниже */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="ml-auto -my-1.5 -mr-1.5 w-8 h-8 rounded-pill inline-flex items-center
                     justify-center text-stone hover:text-ink hover:bg-ink/5
                     transition-[color,background-color,transform] duration-150 ease-apple-out
                     active:scale-[0.96]"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-title`} className="text-xs text-stone">
          Название
        </label>
        <input
          id={`${ids}-title`}
          className="input"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            touch();
          }}
        />
      </div>

      <div className="flex gap-2">
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <label htmlFor={`${ids}-date`} className="text-xs text-stone">
            Дата
          </label>
          <input
            id={`${ids}-date`}
            type="date"
            className="input tabular-nums"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              touch();
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5 w-[112px] shrink-0">
          <label htmlFor={`${ids}-time`} className="text-xs text-stone">
            Время, МСК
          </label>
          <input
            id={`${ids}-time`}
            type="time"
            step={900}
            className="input tabular-nums"
            value={time}
            autoFocus
            onChange={(e) => {
              setTime(e.target.value);
              touch();
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5" role="group" aria-labelledby={`${ids}-dur`}>
        <span id={`${ids}-dur`} className="text-xs text-stone">
          Длительность
        </span>
        <div className="segmented h-8 p-0.5 w-full">
          {MEETING_DURATIONS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={duration === m}
              onClick={() => {
                setDuration(m);
                touch();
              }}
              className={`segmented-item flex-1 justify-center h-7 px-2 text-xs tabular-nums
                          active:scale-[0.96] transition-[color,background-color,transform]
                          duration-150 ${duration === m ? 'segmented-item-active' : ''}`}
            >
              {DURATION_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-0.5" role="group" aria-labelledby={`${ids}-who`}>
        <span id={`${ids}-who`} className="text-xs text-stone mb-1">
          Участники
        </span>
        {people.map((p) => (
          // Строка целиком — хит-зона чекбокса
          <label
            key={p.id}
            className={`flex items-center gap-2.5 py-1.5 select-none ${
              p.email ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
            }`}
          >
            <input
              type="checkbox"
              checked={!!checked[p.id]}
              disabled={!p.email}
              onChange={(e) => {
                setChecked((prev) => ({ ...prev, [p.id]: e.target.checked }));
                touch();
              }}
              className="w-4 h-4 rounded border-cloud accent-ink focus:ring-ink/30 shrink-0"
            />
            <span className="text-ink truncate min-w-0">{p.fullName}</span>
            <span className="ml-auto pl-2 text-xs text-stone whitespace-nowrap">
              {p.email ? p.role : 'Нет почты'}
            </span>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <a
          href={YANDEX_CALENDAR_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={openYandex}
          aria-disabled={!valid}
          className={`btn-primary ${valid ? '' : 'opacity-40 pointer-events-none'}`}
        >
          Открыть в Я.Календаре
        </a>
        <button
          type="button"
          className="btn-ghost active:scale-[0.98]"
          disabled={!valid}
          onClick={downloadOnly}
        >
          Скачать .ics
        </button>
      </div>

      {/* Подсказка: до клика — что произойдёт, после — что сделать дальше.
          aria-live — смену услышит и скринридер. */}
      <p className="text-xs text-stone leading-relaxed -mt-1" aria-live="polite">
        {done === 'yandex' ? (
          <>
            <CheckIcon className="inline w-3.5 h-3.5 -mt-0.5 mr-1 text-emerald" />
            Файл скачан. В Я.Календаре: «Добавить» → «Импорт» → «Из файла».
          </>
        ) : done === 'file' ? (
          <>
            <CheckIcon className="inline w-3.5 h-3.5 -mt-0.5 mr-1 text-emerald" />
            Файл скачан — открой его в своём календаре.
          </>
        ) : !start ? (
          'Укажи дату и время встречи.'
        ) : !title.trim() ? (
          'Укажи название встречи.'
        ) : (
          'Я.Календарь откроется в новой вкладке, файл встречи скачается — импортируй его там.'
        )}
      </p>
    </div>
  );
}
