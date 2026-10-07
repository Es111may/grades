'use client';

import { useId, useState } from 'react';
import {
  gradingPlanStatus,
  gradingPlanTone,
  type GradingPlanState,
} from '@/lib/gradingPlan';
import { formatDateShort, todayLocalIso } from '@/lib/dates';
import { openYandexCalendarOnChange } from '@/lib/yandexCalendar';
import { CloseIcon, CoinsIcon, InfoIcon, TimerIcon } from '@/components/icons';
import { isGradingExempt, isHourly, nonGradingBuildNote } from '@/lib/employment';
import Tooltip from '@/components/Tooltip';
import InlineEditor from '@/components/InlineEditor';

export type GradingPlanSource = {
  /** 'hourly' — почасовщик: не грейдируется, таймера у него не бывает. */
  employmentType?: string;
  /** Билд: у билда без грейдов («Коммуникации») таймера тоже не бывает. */
  build: { code: string } | null;
  /** false — неактивный: таймера нет, даже если дата осталась с прошлого. */
  active?: boolean;
  nextGradingAt?: string | null;
  nextGradingSetAt?: string | null;
  /** publishedAt последней опубликованной оценки. */
  lastAssessedAt?: string | null;
};

const TONE_CLASS: Record<ReturnType<typeof gradingPlanTone>, string> = {
  danger: 'bg-blaze/10 text-blaze border-blaze/15',
  warn: 'bg-sunset/10 text-sunset border-sunset/15',
  ok: 'bg-emerald/10 text-emerald border-emerald/15',
  muted: 'bg-ink/5 text-stone border-ink/10',
};

// Ховер пилюли, которую можно открыть на правку, — тот же тон, плотнее.
const TONE_HOVER: Record<ReturnType<typeof gradingPlanTone>, string> = {
  danger: 'hover:bg-blaze/15',
  warn: 'hover:bg-sunset/15',
  ok: 'hover:bg-emerald/15',
  muted: 'hover:bg-ink/10',
};

/** План грейдирования из ответа PUT /api/users/[id]/grading-date. */
export type GradingPlanFields = {
  nextGradingAt: string | null;
  nextGradingSetAt: string | null;
  nextGradingSetBy: { id: number; fullName: string } | null;
};

/**
 * Поставить (YYYY-MM-DD) или снять (null) дату грейдирования. Отдельный
 * эндпоинт, а не PATCH карточки: PATCH стардизу закрыт, а дату своим
 * подопечным он ставить вправе. Ошибку отдаёт готовым текстом: служебные
 * ответы сервера («Forbidden», «Not found») — по-английски, вместо них
 * показываем fallback.
 */
export async function putGradingDate(
  userId: number,
  nextGradingAt: string | null,
  fallbackError: string,
): Promise<{ plan: GradingPlanFields } | { error: string }> {
  try {
    const res = await fetch(`/api/users/${userId}/grading-date`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nextGradingAt }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const own = typeof j.error === 'string' && /[а-яё]/i.test(j.error);
      return { error: own ? j.error : fallbackError };
    }
    return {
      plan: {
        nextGradingAt: j.nextGradingAt ?? null,
        nextGradingSetAt: j.nextGradingSetAt ?? null,
        nextGradingSetBy: j.nextGradingSetBy ?? null,
      },
    };
  } catch {
    return { error: fallbackError };
  }
}

/** Короткая подпись состояния — для чипа и для строки в поп-апе. */
export function gradingPlanLabel(
  state: GradingPlanState,
  daysLeft: number | null,
): string {
  switch (state) {
    case 'none':
      return 'Не запланировано';
    case 'planned':
      return `через ${daysLeft} дн.`;
    case 'soon':
      return daysLeft === 0 ? 'сегодня' : `через ${daysLeft} дн.`;
    case 'due':
      return 'срок подошёл';
    case 'overdue':
      return `просрочено на ${-(daysLeft ?? 0)} дн.`;
    case 'done':
      return 'проведено';
  }
}

/**
 * Иконка «грейдирование запланировано» — для списка команды.
 *
 * Pavel: в таблице нужна не колонка, а иконка у тех, у кого грейдирование
 * запланировано; по ховеру — дата; после проведения иконка исчезает.
 * Поэтому здесь ничего не рендерится в состояниях 'done' и 'none' — пустой
 * список читается как «планировать нечего или уже сделано», а разбор этих
 * двух случаев живёт в фиде «Требует внимания».
 *
 * Тон сохраняем: просроченное грейдирование подсвечивается, иначе контроль
 * «не забыли ли» пришлось бы держать только в фиде.
 */
export function GradingPlanIcon({ user }: { user: GradingPlanSource }) {
  // Ушедшего, почасовщика и билд без грейдов не грейдируют: оставшаяся
  // дата горела бы «просрочено»
  if (isGradingExempt(user) || user.active === false) return null;
  const st = gradingPlanStatus({
    nextGradingAt: user.nextGradingAt ?? null,
    nextGradingSetAt: user.nextGradingSetAt ?? null,
    lastPublishedAt: user.lastAssessedAt ?? null,
  });
  if (st.state === 'none' || st.state === 'done' || !st.plannedAt) return null;

  const tone = gradingPlanTone(st.state);
  const color =
    tone === 'danger' ? 'text-blaze' : tone === 'warn' ? 'text-sunset' : 'text-ash';

  // portal: иконка стоит в строке таблицы, а карточка таблицы —
  // overflow: hidden; CSS-хинт там обрезался и не был виден
  return (
    <Tooltip
      text={`Грейдирование — ${formatDateShort(st.plannedAt.toISOString())} · ${gradingPlanLabel(
        st.state,
        st.daysLeft,
      )}`}
      align="center"
      portal
      className="rounded-sm"
    >
      <TimerIcon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
    </Tooltip>
  );
}

/**
 * Полный чип с датой — для поп-апа 360 и портрета, где важна подробность:
 * Pavel хочет видеть по итогу, что грейдирование состоялось и когда именно.
 *
 * Состояние не хранится, а выводится: «проведено» = есть опубликованная
 * оценка после постановки даты (см. lib/gradingPlan). Поэтому чип не может
 * разойтись с реальностью, как разошёлся бы ручной флаг.
 */
export default function GradingPlanChip({
  user,
  size = 'sm',
  showLabel = true,
  onClear,
  onEdit,
  clearing = false,
}: {
  user: GradingPlanSource;
  size?: 'sm' | 'md';
  /** false — только дата, без пояснения в скобках (для тесных мест). */
  showLabel?: boolean;
  /**
   * Сброс даты. Передаём только тем, у кого есть права (см. canSetGradingDate) —
   * тогда в пилюле появляется крестик. Pavel: сбрасывать прямо в поп-апе.
   */
  onClear?: () => void;
  /**
   * Правка даты — по клику на пилюлю (права те же, что у onClear). Кнопка
   * «Изменить» рядом не влезает: «просрочено на 15 дн.» с крестиком уже
   * занимают почти всю ширину значения в поп-апе.
   */
  onEdit?: () => void;
  clearing?: boolean;
}) {
  const st = gradingPlanStatus({
    nextGradingAt: user.nextGradingAt ?? null,
    nextGradingSetAt: user.nextGradingSetAt ?? null,
    lastPublishedAt: user.lastAssessedAt ?? null,
  });
  const tone = gradingPlanTone(st.state);
  const label = gradingPlanLabel(st.state, st.daysLeft);
  // В пилюле подпись — отдельный элемент после даты, поэтому с заглавной
  // (Pavel: новые фразы — с заглавной везде). В подсказке таймера и aria-label
  // та же подпись идёт продолжением после «·» / запятой и остаётся строчной.
  const chipLabel = label.charAt(0).toUpperCase() + label.slice(1);

  if (st.state === 'none') {
    return (
      <span className={`text-ash ${size === 'md' ? 'text-sm' : 'text-xs'}`}>—</span>
    );
  }

  // Для «проведено» показываем фактическую дату — Pavel: важно видеть, что
  // грейдирование состоялось, и когда именно.
  const shown = st.state === 'done' ? st.completedAt : st.plannedAt;
  const shownText = shown ? formatDateShort(shown.toISOString()) : '—';
  // Проведённое — факт, его не правят: следующую дату назначают отдельно.
  const editable = !!onEdit && st.state !== 'done';

  const body = (
    <>
      <span className="tabular-nums">{shownText}</span>
      {showLabel && <span className="opacity-70">{chipLabel}</span>}
    </>
  );

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border px-2 h-6
                  whitespace-nowrap ${TONE_CLASS[tone]} ${
                    editable ? `transition-colors ${TONE_HOVER[tone]}` : ''
                  } ${size === 'md' ? 'text-xs' : 'text-[11px]'}`}
      title={
        st.state === 'done' && st.plannedAt
          ? `План — ${formatDateShort(st.plannedAt.toISOString())}`
          : undefined
      }
    >
      {editable ? (
        // Кнопка забирает левый отступ и всю высоту пилюли — хит-зона
        // от края до крестика
        <button
          type="button"
          onClick={onEdit}
          disabled={clearing}
          title="Изменить дату"
          aria-label={`Изменить дату грейдирования: ${shownText}, ${label}`}
          className="-ml-2 pl-2 self-stretch inline-flex items-center gap-1.5 rounded-l-pill"
        >
          {body}
        </button>
      ) : (
        body
      )}
      {/* Крестик — сброс даты. После проведения грейдирования сбрасывать
          нечего: там уже факт, а не план. */}
      {onClear && st.state !== 'done' && (
        <button
          type="button"
          onClick={onClear}
          disabled={clearing}
          aria-label="Сбросить дату грейдирования"
          title="Сбросить дату грейдирования"
          className="-mr-0.5 ml-0.5 p-0.5 rounded-full opacity-60 hover:opacity-100
                     hover:bg-ink/10 transition-opacity disabled:opacity-30"
        >
          <CloseIcon className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
}

/**
 * Инлайн-редактор даты грейдирования — встаёт на место строки в поп-апе 360.
 * Оболочка — общий InlineEditor (как у планового пересмотра в SalaryBlock):
 * Enter сохраняет, Escape отменяет и дальше не всплывает, чтобы поп-ап
 * не закрылся вместе с редактором.
 *
 * Поле без даты по умолчанию: подставленная дата легко уходит в сохранение
 * незамеченной. min — сегодня по часам браузера (поле тоже браузерное);
 * вписанную руками прошедшую дату ловим сами — сервер её не запрещает.
 *
 * Новая или сменённая дата открывает Я.Календарь на её неделе — встречу
 * создают там (lib/yandexCalendar).
 */
export function GradingDateEditor({
  userId,
  initial,
  onSaved,
  onCancel,
  returnFocus,
}: {
  userId: number;
  /** YYYY-MM-DD текущей плановой даты или '' — назначаем новую. */
  initial: string;
  onSaved: (plan: GradingPlanFields) => void;
  onCancel: () => void;
  /** Редактор закрылся — куда вернуть фокус (строка даты в поп-апе). */
  returnFocus?: () => HTMLElement | null | undefined;
}) {
  const inputId = useId();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = todayLocalIso();

  async function save() {
    if (busy || !value) return;
    // Дата та же — сохранять нечего (и просроченная не упрётся в min)
    if (value === initial) {
      onCancel();
      return;
    }
    if (value < today) {
      setErr('Выбери дату не раньше сегодняшней');
      return;
    }
    // Вкладку открываем до запроса, прямо в клике: после await браузер
    // заблокировал бы её как всплывающее окно
    openYandexCalendarOnChange(initial, value);
    setBusy(true);
    setErr(null);
    const r = await putGradingDate(userId, value, 'Не удалось сохранить дату');
    setBusy(false);
    if ('error' in r) {
      setErr(r.error);
      return;
    }
    onSaved(r.plan);
  }

  return (
    <InlineEditor
      title="Грейдирование"
      fieldId={inputId}
      error={err}
      pending={busy}
      canSave={!!value}
      onSave={() => void save()}
      onCancel={onCancel}
      returnFocus={returnFocus}
    >
      <input
        id={inputId}
        type="date"
        className="input"
        min={today}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setErr(null);
        }}
      />
      {/* -mt-1: подсказка — к полю (6px, как в карточке «Изменить»), а не
          на общем шаге редактора */}
      <p className="-mt-1 text-xs text-ash">После сохранения откроется Я.Календарь</p>
    </InlineEditor>
  );
}

/**
 * Статусная иконка у имени человека в списке (Phase 23.4). Одно место —
 * одна иконка: у почасовщика жёлтые монетки (залитые, 16px — чтобы
 * бросались в глаза), у билда без грейдов — серый информер с причиной
 * (иначе непонятно, почему у человека нет места и оценки), у остальных —
 * таймер грейдирования, если он запланирован. Вместе они не встречаются:
 * почасовщиков и билд без грейдов не грейдируют.
 */
export function PersonStatusIcon({ user }: { user: GradingPlanSource }) {
  if (isHourly(user)) {
    // portal — как у таймера: иначе хинт обрезает карточка таблицы.
    // «9-Box» не рвём по дефису — при ширине 280 он переносился «9-/Box»
    return (
      <Tooltip
        text={
          <>
            Почасовщик — не грейдируется, в рейтинг и{' '}
            <span className="whitespace-nowrap">9-Box</span> не входит
          </>
        }
        align="center"
        portal
        className="rounded-sm"
      >
        <CoinsIcon className="w-4 h-4 shrink-0 text-gold" />
      </Tooltip>
    );
  }
  const buildNote = nonGradingBuildNote(user);
  if (buildNote) {
    // Размер и цвет — как у таймера: признак справочный, не тревожный
    return (
      <Tooltip
        text={
          <>
            {buildNote}, в рейтинг и <span className="whitespace-nowrap">9-Box</span> не входит
          </>
        }
        align="center"
        portal
        className="rounded-sm"
      >
        <InfoIcon className="w-3.5 h-3.5 shrink-0 text-ash" />
      </Tooltip>
    );
  }
  return <GradingPlanIcon user={user} />;
}
