// Правила изменения карточки человека, общие для PATCH /api/users/[id],
// DELETE (деактивация) и PUT /api/users/[id]/grading-date. Чистые функции —
// поведение проверяется тестами, роуты только применяют результат.

import { todayMoscowIso } from './dates';
import { isGradingExempt, type WithBuild } from './employment';

type DateLike = Date | null;

/** YYYY-MM-DD по UTC — так даты хранятся (input[type=date] → полночь UTC). */
function dayKey(d: DateLike): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

// ── Дата увольнения при деактивации ──────────────────────────────────────
//
// Решение Pavel: деактивация сама ставит дату увольнения. Ставим, если даты
// нет или она раньше даты найма — это вернувшийся человек, и старая дата
// относится к прошлому трудоустройству.

/** Нужна ли человеку новая дата увольнения при деактивации. */
export function needsDismissalDate(u: { dismissedAt: DateLike; hiredAt: DateLike }): boolean {
  if (!u.dismissedAt) return true;
  return !!u.hiredAt && u.dismissedAt.getTime() < u.hiredAt.getTime();
}

/**
 * Сегодняшняя дата по Москве как полночь UTC — в том же виде, в каком
 * хранится дата из input[type=date]. Сервер живёт в UTC: с 00:00 до 03:00
 * по Москве UTC-дата ещё вчерашняя.
 */
export function todayMoscowDate(now: Date = new Date()): Date {
  return new Date(`${todayMoscowIso(now)}T00:00:00.000Z`);
}

// ── Дата грейдирования ───────────────────────────────────────────────────
//
// Сравниваем по дню, а не по моменту: повторное сохранение карточки без
// правки даты не должно переписывать «кто и когда поставил» — от этой
// отметки зависит «проведено» (lib/gradingPlan).

const DATE_RE = /^\d{4}-\d{2}-\d{2}(T.*)?$/;

export type GradingDateChange =
  | { error: string }
  | { changed: false }
  | { changed: true; nextGradingAt: Date | null };

/**
 * Разбирает новую дату (YYYY-MM-DD или ISO; пусто/null — снять) и решает,
 * меняется ли она относительно текущей.
 */
export function gradingDateChange(
  current: DateLike,
  raw: string | null,
): GradingDateChange {
  let next: Date | null = null;
  if (raw) {
    next = DATE_RE.test(raw) ? new Date(raw) : null;
    if (!next || Number.isNaN(next.getTime())) {
      return { error: 'Некорректная дата грейдирования' };
    }
  }
  if (dayKey(current) === dayKey(next)) return { changed: false };
  return { changed: true, nextGradingAt: next };
}

/**
 * Кому вообще ставят дату грейдирования: дизайнерам и стардизам на штате.
 * Почасовщик и билд без грейдов не грейдируются (lib/employment). Снять
 * дату можно у любого.
 */
export function canHaveGradingDate(
  u: { role: string; employmentType?: string | null } & WithBuild,
): boolean {
  return (u.role === 'designer' || u.role === 'stardiz') && !isGradingExempt(u);
}

// ── Наставники: лид и стардиз ────────────────────────────────────────────
//
// Кого можно назначить — тот же список, что в выпадашках карточки
// (admin/users/page.tsx): лид — активный лид или админ, стардиз — активный
// стардиз, лид или админ. Сервер проверяет сам: запрос можно собрать руками.

const MENTOR_ROLES = {
  lead: ['lead', 'admin'],
  stardiz: ['stardiz', 'lead', 'admin'],
} as const;

const MENTOR_ERROR = {
  lead: 'Лидом можно назначить только активного лида или админа',
  stardiz: 'Стардизом можно назначить только активного стардиза, лида или админа',
} as const;

/**
 * Текст ошибки, если `mentor` нельзя назначить лидом/стардизом человеку
 * `targetId` (у нового человека id ещё нет), иначе null.
 */
export function mentorError(
  kind: 'lead' | 'stardiz',
  mentor: { id: number; role: string; active: boolean } | null,
  targetId?: number,
): string | null {
  if (mentor && targetId !== undefined && mentor.id === targetId) {
    return 'Нельзя назначить человека наставником самому себе';
  }
  if (!mentor || !mentor.active) return MENTOR_ERROR[kind];
  return (MENTOR_ROLES[kind] as readonly string[]).includes(mentor.role) ? null : MENTOR_ERROR[kind];
}

// ── Правка своей карточки ────────────────────────────────────────────────
//
// Лид правит у себя только имя и аватар (lib/permissions → canEditOwnProfile).
// Модалка в этом случае их одни и шлёт, но запрос можно собрать руками —
// поэтому остальные поля сервер сверяет с текущими, как и при обычной правке:
// пришло то же значение — не правка.

/** Поля, которые можно менять в своей карточке. */
export const SELF_EDITABLE_FIELDS: readonly string[] = ['fullName', 'avatarUrl'];

const DATE_FIELDS = new Set(['hiredAt', 'nextGradingAt', 'dismissedAt']);

/** Значение для сравнения: пустое — null, даты — по дню, email — без регистра. */
function comparable(key: string, v: unknown): unknown {
  if (v === undefined || v === null || v === '') return null;
  if (DATE_FIELDS.has(key)) {
    const d = v instanceof Date ? v : new Date(String(v));
    return Number.isNaN(d.getTime()) ? `invalid:${String(v)}` : dayKey(d);
  }
  if (key === 'email' && typeof v === 'string') return v.toLowerCase();
  return v;
}

/**
 * Поля, кроме имени и аватара, которые запрос на правку своей карточки
 * меняет относительно текущих значений. Пусто — правку можно пропускать.
 */
export function selfEditLockedFields(
  data: Record<string, unknown>,
  existing: Record<string, unknown>,
): string[] {
  return Object.keys(data).filter(
    (k) =>
      data[k] !== undefined &&
      !SELF_EDITABLE_FIELDS.includes(k) &&
      comparable(k, data[k]) !== comparable(k, existing[k]),
  );
}
