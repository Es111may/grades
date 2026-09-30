// Планирование грейдирования (Phase 23.2).
//
// Что решает: Pavel как админ должен видеть, когда у дизайнеров будут грейды
// и прошли ли они. Лид/стардиз вписывают дату руками; факт проведения
// выводится из опубликованной оценки, а не из флага — флаг пришлось бы гасить
// вручную, и он бы врал.
//
// К сезону оценок дата НЕ привязана: сезоны «примерно май и октябрь-ноябрь»,
// но смещаются, поэтому автоподстановки нет — только ручной ввод.
//
// Чистые функции, без Prisma и React — поведение проверяется тестами.

import { moscowIsoDate } from './dates';

/** Порог, после которого просрочка считается тревогой. Pavel: две недели. */
export const OVERDUE_AFTER_DAYS = 14;
/** Насколько заранее дата считается «на подходе». */
export const SOON_WITHIN_DAYS = 7;

export type GradingPlanState =
  /** Дату не ставили — для админа это сигнал «забыли запланировать». */
  | 'none'
  /** Запланировано, срок ещё не близко. */
  | 'planned'
  /** До даты ≤ 7 дней. */
  | 'soon'
  /** Дата прошла, но ещё в пределах двух недель — не тревога. */
  | 'due'
  /** Прошло больше двух недель, оценки нет — тревога. */
  | 'overdue'
  /** Оценка опубликована после постановки даты. */
  | 'done';

export type GradingPlanInput = {
  /** Запланированная дата грейдирования. */
  nextGradingAt: Date | string | null;
  /** Когда дату поставили — точка отсчёта для «проведено». */
  nextGradingSetAt?: Date | string | null;
  /** publishedAt последней опубликованной оценки. */
  lastPublishedAt?: Date | string | null;
};

export type GradingPlanStatus = {
  state: GradingPlanState;
  /** Плановая дата, если есть. */
  plannedAt: Date | null;
  /** Фактическая дата грейдирования — только для state === 'done'. */
  completedAt: Date | null;
  /**
   * Дней до плановой даты (положительное) или после неё (отрицательное).
   * null, если даты нет или грейдирование уже проведено.
   */
  daysLeft: number | null;
};

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** YYYY-MM-DD → номер дня (полночь UTC этой даты в сутках от эпохи). */
function isoDayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 864e5;
}

/**
 * Календарных дней между датами — по московскому календарю, без учёта времени.
 * Раньше считали по UTC-датам, и с 00:00 до 03:00 по Москве в день
 * грейдирования сервер (он в UTC) показывал «через 1 дн.» вместо «сегодня».
 * Плановая дата хранится как полночь UTC (input[type=date] → new Date('YYYY-MM-DD')),
 * по Москве это 03:00 того же дня — дата не сдвигается.
 */
function dayDiff(from: Date, to: Date): number {
  return isoDayNumber(moscowIsoDate(to)) - isoDayNumber(moscowIsoDate(from));
}

/**
 * Состояние плана грейдирования.
 *
 * «Проведено» = есть опубликованная оценка не раньше того момента, когда
 * поставили дату. Сравниваем именно с моментом постановки, а не с плановой
 * датой: иначе досрочное грейдирование (план 7 октября, провели 3-го)
 * читалось бы как «не проведено», а через две недели — как «просрочено».
 *
 * Если отметки постановки нет (данные до этой фазы), считаем проведённым
 * оценку не раньше плановой даты — консервативно, без ложных «проведено».
 */
export function gradingPlanStatus(
  input: GradingPlanInput,
  now: Date = new Date(),
): GradingPlanStatus {
  const plannedAt = toDate(input.nextGradingAt);
  const setAt = toDate(input.nextGradingSetAt);
  const published = toDate(input.lastPublishedAt);

  if (!plannedAt) {
    return { state: 'none', plannedAt: null, completedAt: null, daysLeft: null };
  }

  // С отметкой постановки сравниваем моменты. Без неё — календарные даты
  // по Москве: публикация в 01:00 МСК в сам плановый день (по UTC — ещё
  // вчера, раньше полуночи UTC плановой даты) тоже «не раньше плана».
  const isDone =
    published !== null &&
    (setAt
      ? published.getTime() >= setAt.getTime()
      : dayDiff(plannedAt, published) >= 0);
  if (isDone) {
    return {
      state: 'done',
      plannedAt,
      completedAt: published,
      daysLeft: null,
    };
  }

  const daysLeft = dayDiff(now, plannedAt);
  let state: GradingPlanState;
  if (daysLeft > SOON_WITHIN_DAYS) state = 'planned';
  else if (daysLeft >= 0) state = 'soon';
  else if (-daysLeft <= OVERDUE_AFTER_DAYS) state = 'due';
  else state = 'overdue';

  return { state, plannedAt, completedAt: null, daysLeft };
}

/** Тон для чипа/строки — совпадает с тонами фида «Требует внимания». */
export function gradingPlanTone(
  state: GradingPlanState,
): 'danger' | 'warn' | 'ok' | 'muted' {
  switch (state) {
    case 'overdue':
      return 'danger';
    case 'due':
    case 'soon':
      return 'warn';
    case 'done':
      return 'ok';
    default:
      return 'muted';
  }
}

/**
 * Кто может ставить дату грейдирования.
 *
 * Админ — всем; лид и стардиз — своим подопечным. Дизайнер свою дату видит,
 * но не меняет: иначе теряется смысл контроля.
 */
export function canSetGradingDate(
  me: { id: number; role: string } | null,
  target: { id: number; leadId: number | null; stardizId: number | null },
): boolean {
  if (!me) return false;
  if (me.role === 'admin') return true;
  if (me.role === 'lead' || me.role === 'stardiz') {
    return target.leadId === me.id || target.stardizId === me.id;
  }
  return false;
}

/**
 * Кто может видеть дату. Дизайнер и стардиз — свою; лид и стардиз —
 * подопечных; админ — всех.
 */
export function canSeeGradingDate(
  me: { id: number; role: string } | null,
  target: { id: number; leadId: number | null; stardizId: number | null },
): boolean {
  if (!me) return false;
  if (me.role === 'admin') return true;
  if (me.id === target.id) return true;
  return canSetGradingDate(me, target);
}
