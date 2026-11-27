// Реестр людей из HR-портала (Phase 23.6a) — чистые функции, без запросов.
//
// Сверка «HR → Грейды»: у каждого, кто в HR числится на дизайнерской
// позиции, должна быть карточка в Грейдах. Нынешние уже есть — совпадают по
// email; ушедшие заводятся неактивными (active = false, без пароля — войти
// нельзя), с поп-апом, как у всех.
//
// История. Решения Pavel, 01.10.2026 (что из них поменялось 27.11 — ниже):
//   • поля существующих людей не перетираем — Грейды главнее HR (отдел,
//     роль, оргисключения); дозаполняем только пустые даты найма и
//     увольнения, дату увольнения — только неактивным;
//   • никого не активируем и не деактивируем;
//   • ExcludedEmail уважаем: исключённых не создаём, они — в отчёте;
//   • активных в HR, которых нет в Грейдах, только перечисляем — создаём
//     их лишь по явному флагу: всех (includeActiveMissing) или поимённо
//     (includeHrIds);
//   • ушедших заводим только с начала 2025 года (REGISTRY_DEPARTED_SINCE):
//     ушедшие раньше и без даты увольнения не создаются, в отчёте — числом.
//     Существующих людей Грейдов граница не касается;
//   • БА/СА, UX-редакторы, исследователи — не сейчас: только позиции дизайна.
// И от 01.10.2026, вторым заходом:
//   • отдел Lite и позиция 29 «Дизайн-инженер» — дизайн-инженеры, не
//     дизайнеры: в контур дизайна не входят никогда, в отчёте — числом;
//   • в декрете (maternity_leave) активных не заводим, пока в декрете.
// Тип и причину ухода сюда не берём — их переносят из таблички отдельно.
//
// Решения владельца, 27.11.2026. Источник — набор HR (lib/hrDataset): живой
// ClickHouse или слепок через ida.hub. В набор входят учётки на позициях
// сверки (9, 20, 29) и учётки с почтой любого пользователя Грейдов — с
// любой позицией: по ним видно, ушёл ли человек.
//   • Новые. Работающие в HR в контуре дизайна, которых нет в Грейдах, —
//     «Заведём»: активная карточка без пароля, роль, отдел и билд — из HR.
//     Флаг больше не нужен: includeActiveMissing и includeHrIds убраны,
//     исключить человека — skipHrIds.
//   • Не дублировать. Человек уже есть в Грейдах — карточку не создаём:
//     по email (без регистра и пробелов — normalizeEmail; среди неактивных
//     и ExcludedEmail тоже) или по имени и фамилии (ru и en, без регистра,
//     «ё» = «е», порядок слов не важен — nameKey; в Грейдах и у совпавших по
//     email в HR). Совпало только имя — расхождение name_matches_user,
//     в отчёте группа «Похоже, уже есть» с парой HR ↔ Грейды. Пустую дату
//     найма такой паре дозаполняем, только если совпадение однозначное:
//     один человек в Грейдах, на него претендует одна учётка HR, и своей
//     учётки HR по email у него нет. Неоднозначное — только отчёт.
//     Второе правило (там же, 27.11): совпали фамилия (ru или en, как
//     nameKey) и дата найма по дню — тоже «Похоже, уже есть» (в Грейдах имя
//     бывает уменьшительным: «Вова» вместо «Владимир»). Для активных и
//     неактивных. Одна фамилия без даты найма — не дубль: в HR бывают
//     разные люди с одним именем и фамилией в разные годы.
//   • Ушедшие. Активный в Грейдах, у кого по email в HR нет ни одной живой
//     учётки (все в архиве или с наступившей датой увольнения), —
//     «Деактивируем»: как кнопкой в интерфейсе (lib/deactivation), дата
//     увольнения — из HR, если в Грейдах пусто.
//   • Никогда не деактивируем: админов (строка «Проверьте вручную»); тех, кого
//     нет в HR (числом); тех, кто в декрете (это не увольнение). Почасовщиков
//     тоже: выведенный из штата HR почасовщик работает (решение 01.10).
//   • Никого не активируем обратно; поля существующих людей не перетираем —
//     дозаполняются только пустые даты.
// И от 27.11.2026, после проверки отчёта: признак «ушёл» — архив, а не дата.
// При возвращении HR снимает учётку с архива, а старую дату увольнения не
// чистит. Поэтому:
//   • «Деактивируем» — только если все учётки HR с этой почтой в архиве;
//     есть учётка не в архиве, но с наступившей датой увольнения — «Проверьте
//     вручную» (возможно, вернулся), ничего не делаем. Админы, декрет,
//     почасовщики и те, кого нет в HR, — как выше;
//   • такую же учётку (не в архиве, дата увольнения в прошлом) человека,
//     которого нет в Грейдах, не заводим ни активным, ни неактивным —
//     тоже «Проверьте вручную»;
//   • граница ушедших и «ушли без даты увольнения» — как были: это учётки в
//     архиве. Ставки, «Экономика» и pickEmployee это решение не меняет.
// Выборка набора, отчёт и запись в БД — scripts/sync-hr-registry.ts.

import type { BuildCode } from './types';

// ── Справочники ─────────────────────────────────────────────────────────

/**
 * С какой даты увольнения ушедшие получают карточку (Pavel, 01.10.2026:
 * ушедших трекаем с начала 2025 года). Включительно. Меняется опцией
 * departedSince.
 */
export const REGISTRY_DEPARTED_SINCE = '2025-01-01';

/** Роль в Грейдах для человека из реестра: стардиза в HR нет. */
export type RegistryRole = 'designer' | 'lead';

/**
 * Дизайнерские позиции HR (`employee_position.id`) → роль. Остальные
 * позиции — не дизайн, в реестр не попадают.
 */
export const HR_DESIGN_POSITIONS: Readonly<Record<number, RegistryRole>> = {
  9: 'designer', // Design
  20: 'lead', // Lead Designer
};

/** id дизайнерских позиций — тот же список, что выше. */
export const HR_DESIGN_POSITION_IDS: readonly number[] = Object.keys(HR_DESIGN_POSITIONS).map(Number);

/**
 * Позиция 29 «Дизайн-инженер» — не дизайн (Pavel, 01.10.2026). Сверка
 * выбирает её вместе с дизайном только затем, чтобы посчитать в отчёте.
 */
export const HR_DESIGN_ENGINEER_POSITION = 29;

/** id позиций для WHERE в выборке сверки: дизайн и дизайн-инженеры. */
export const HR_REGISTRY_POSITION_IDS: readonly number[] = [...HR_DESIGN_POSITION_IDS, HR_DESIGN_ENGINEER_POSITION];

export function roleForPosition(positionId: unknown): RegistryRole | null {
  const id = Number(positionId);
  return Number.isInteger(id) ? HR_DESIGN_POSITIONS[id] ?? null : null;
}

/** Отдел HR Lite — дизайн-инженеры, не дизайнеры (Pavel, 01.10.2026). */
export function isLiteDepartment(name: unknown): boolean {
  return typeof name === 'string' && name.trim().toLowerCase() === 'lite';
}

/**
 * Контур дизайна: дизайнерская позиция (9, 20) и не отдел Lite. Одно
 * правило для сверки реестра и справки «Экономики» (lib/hrEconomics).
 */
export function isDesignContour(p: { positionId: unknown; department?: unknown }): boolean {
  return roleForPosition(p.positionId) !== null && !isLiteDepartment(p.department);
}

/**
 * Отделы HR (`employee_department.name`) → отдел и билд Грейдов. Билды
 * названы как отделы (lib/types → BUILD_NAMES), поэтому нынешним отделам
 * ставим оба поля. Ушедшие из прошлых отделов (Самолет, Ида.Бид) сохраняют
 * название отдела как есть, без билда: в «Отделах» канбана они — отдельной
 * колонкой с этим названием. Lite сюда не доходит — он вне контура.
 */
const HR_DEPARTMENTS: Readonly<Record<string, { department: string; buildCode: BuildCode }>> = {
  improve: { department: 'Импрув', buildCode: 'navigator' },
  create: { department: 'Криэйт', buildCode: 'visioner' },
  'design.inhouse': { department: 'Инхаус', buildCode: 'creator' },
};

export function mapHrDepartment(name: string | null | undefined): {
  department: string | null;
  buildCode: BuildCode | null;
} {
  const raw = (name ?? '').trim();
  if (!raw) return { department: null, buildCode: null };
  return HR_DEPARTMENTS[raw.toLowerCase()] ?? { department: raw, buildCode: null };
}

// ── Нормализация полей HR ───────────────────────────────────────────────

const clean = (s: unknown): string =>
  typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '';

/**
 * Латинские буквы-«двойники» кириллических: в HR встречаются имена, набранные
 * вперемешку («Aнacтacия» с латинскими a и c). Такое имя выглядит нормально,
 * но не совпадает при поиске и сравнении тёзок.
 */
const LATIN_LOOKALIKES: Readonly<Record<string, string>> = {
  A: 'А', a: 'а', B: 'В', C: 'С', c: 'с', E: 'Е', e: 'е', H: 'Н', K: 'К', k: 'к',
  M: 'М', O: 'О', o: 'о', P: 'Р', p: 'р', T: 'Т', X: 'Х', x: 'х', y: 'у', Y: 'У',
};
const LOOKALIKE_RE = new RegExp(`[${Object.keys(LATIN_LOOKALIKES).join('')}]`, 'g');

/** В слове с кириллицей двойники → кириллица; чисто латинские слова не трогаем. */
export function fixLatinLookalikes(name: string): string {
  return name
    .split(' ')
    .map((w) => (/[а-яё]/i.test(w) ? w.replace(LOOKALIKE_RE, (ch) => LATIN_LOOKALIKES[ch]) : w))
    .join(' ');
}

/**
 * «Имя Фамилия» — из русских полей; если в них нет имени или фамилии —
 * из латинских; если и там неполно — что есть (русское первым). Латинские
 * двойники внутри кириллических слов заменяем (fixLatinLookalikes). Пусто —
 * null: без имени карточку не заводим.
 */
export function hrFullName(p: {
  firstNameRu?: string | null;
  lastNameRu?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string | null {
  const ru = [clean(p.firstNameRu), clean(p.lastNameRu)];
  const lat = [clean(p.firstName), clean(p.lastName)];
  const full = (parts: string[]) => parts.every(Boolean);
  const pick = full(ru) ? ru : full(lat) ? lat : ru.some(Boolean) ? ru : lat;
  const name = fixLatinLookalikes(pick.filter(Boolean).join(' '));
  return name || null;
}

/**
 * Дата HR → YYYY-MM-DD. «Даты нет» в HR — 1970-01-01, поэтому всё раньше
 * 2000 года, пустое и нераспознанное — null. Тот же порог, что EMPTY_DATE
 * в lib/hrSalary.
 */
export function normalizeHrDate(v: unknown): string | null {
  if (v == null) return null;
  const s = v instanceof Date ? (Number.isNaN(v.getTime()) ? '' : v.toISOString()) : String(v);
  const day = s.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < '2000') return null;
  return Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? null : day;
}

/** Флаги ClickHouse приходят как 0/1, '0'/'1' или true/false. */
function flag(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 'true';
}

/**
 * Ключ сравнения имён: без регистра, «ё» как «е», порядок слов не важен —
 * «Иванова Анна» и «Анна Иванова» совпадут; латинские двойники внутри
 * кириллических слов — кириллицей (fixLatinLookalikes), с какой бы стороны
 * они ни были набраны.
 */
export function nameKey(fullName: string): string {
  return fixLatinLookalikes(clean(fullName))
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');
}

/** Почта для сравнения: без регистра и пробелов. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').replace(/\s+/g, '').toLowerCase();
}

/**
 * Ключи имени учётки HR для поиска совпадений: русское и латинское «Имя
 * Фамилия» — каждое, что заполнено (nameKey: без регистра, ё = е, порядок
 * слов не важен, латинские двойники в кириллице исправлены).
 */
export function hrNameKeys(p: {
  firstNameRu?: string | null;
  lastNameRu?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string[] {
  const ru = [clean(p.firstNameRu), clean(p.lastNameRu)].filter(Boolean).join(' ');
  const lat = [clean(p.firstName), clean(p.lastName)].filter(Boolean).join(' ');
  return Array.from(new Set([ru, lat].filter(Boolean).map(nameKey))).filter(Boolean);
}

/**
 * Фамилии учётки HR для второго правила дублей: русская и латинская —
 * каждая словами nameKey (составная фамилия — несколько слов).
 */
export function hrSurnameKeys(p: { lastNameRu?: string | null; lastName?: string | null }): string[][] {
  const out: string[][] = [];
  for (const raw of [p.lastNameRu, p.lastName]) {
    const words = nameKey(clean(raw)).split(' ').filter(Boolean);
    if (words.length && !out.some((w) => w.join(' ') === words.join(' '))) out.push(words);
  }
  return out;
}

// ── Входы и выходы планировщика ─────────────────────────────────────────

/** Учётка HR (`employee_employee`, отдел через команду) — строка набора HR. */
export type HrPerson = {
  id: string;
  email: string | null;
  firstNameRu?: string | null;
  lastNameRu?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  positionId: number | string | null;
  /** `employee_department.name` через `employee_team.department_id`. */
  department?: string | null;
  hiredAt?: string | null;
  dismissedAt?: string | null;
  isArchive?: number | string | boolean | null;
  isHourly?: number | string | boolean | null;
  /** `maternity_leave`: 1 — в декрете. */
  maternityLeave?: number | string | boolean | null;
};

/** Человек в Грейдах — минимум полей для сверки. Даты — ISO. */
export type GradesUser = {
  id: number;
  email: string;
  fullName: string;
  active: boolean;
  role?: string;
  employmentType?: string | null;
  hiredAt: string | null;
  dismissedAt: string | null;
};

/** Человек из HR после склейки дублей и нормализации. */
export type RegistryPerson = {
  hrId: string;
  email: string;
  fullName: string;
  role: RegistryRole;
  department: string | null;
  buildCode: BuildCode | null;
  hiredAt: string | null;
  dismissedAt: string | null;
  employmentType: 'staff' | 'hourly';
  /** Ушёл: учётка в архиве или дата увольнения уже наступила. */
  departed: boolean;
  /** Сколько учёток HR с этим email склеено в одну (больше 1 — дубли). */
  hrRows: number;
};

/** Новая карточка: работающие — активными («Заведём»), ушедшие — неактивными. */
export type RegistryCreate = RegistryPerson & { active: boolean };

/** Дозаполнение пустых дат у существующего человека. */
export type RegistryUpdate = {
  userId: number;
  hrId: string;
  set: { hiredAt?: string; dismissedAt?: string };
  /** Пара найдена по имени («Похоже, уже есть», однозначно), а не по email. */
  byName?: true;
};

/** «Деактивируем»: в Грейдах активен, в HR живых учёток с этим email нет. */
export type RegistryDeactivate = {
  userId: number;
  /** Учётка HR, по которой видно уход (живых нет — самая поздняя по найму). */
  hrId: string;
  email: string;
  fullName: string;
  /** Дата увольнения в HR — её получит пустая дата в Грейдах. */
  dismissedAt: string | null;
};

/** Почему «Проверьте вручную». */
export type RegistryManualReason =
  /** Ушёл по HR, но админ — сверка админов не деактивирует. */
  | 'admin'
  /** В HR дата увольнения, но учётка не в архиве — возможно, вернулся. */
  | 'returned';

/** «Проверьте вручную»: сверка не трогает, решает человек. */
export type RegistryManualCheck = {
  /** Человек в Грейдах; нет — в Грейдах его нет (по email). */
  userId?: number;
  hrId: string;
  email: string;
  fullName: string;
  reason: RegistryManualReason;
};

export type RegistryConflictKind =
  /** В HR нет email — сопоставить не с чем. */
  | 'no_email'
  /** В HR нет ни имени, ни фамилии. */
  | 'no_name'
  /** «Похоже, уже есть»: по email нет, но в Грейдах есть человек с тем же именем — старая учётка или сменённый email. */
  | 'name_matches_user'
  /** Несколько учёток HR с одним именем, ни одной в Грейдах — какая настоящая, неясно. */
  | 'duplicate_name_in_hr'
  /** В HR дата увольнения раньше найма (вернулся, а увольнение не сняли?). */
  | 'dismissal_before_hire'
  /** Справка: в HR работает, в Грейдах неактивен — не активируем. */
  | 'active_in_hr_inactive_in_grades';

export type RegistryConflict = {
  kind: RegistryConflictKind;
  hrId: string;
  email: string | null;
  /** Человек в Грейдах, с которым связано расхождение. */
  userId?: number;
  /** name_matches_user: тёзок в Грейдах несколько — все они. */
  userIds?: number[];
  /** name_matches_user: пара неоднозначна — даты не трогаем, только отчёт. */
  ambiguous?: true;
  /** name_matches_user: имя другое, совпали фамилия и дата найма. */
  bySurnameAndHire?: true;
};

export type RegistryPlan = {
  /** «Заведём» (active) и ушедшие с границы (неактивными). */
  create: RegistryCreate[];
  update: RegistryUpdate[];
  /** «Деактивируем». */
  deactivate: RegistryDeactivate[];
  /** «Проверьте вручную»: админы, ушедшие по HR. */
  manualCheck: RegistryManualCheck[];
  skipExcluded: RegistryPerson[];
  /** Ушли раньше departedSince — карточку не заводим. */
  skipDepartedBefore: RegistryPerson[];
  /** Ушли (учётка в архиве), но даты увольнения нет — когда ушли, неизвестно, не заводим. */
  skipDepartedUndated: RegistryPerson[];
  /** Работают в HR, нет в Грейдах, но в декрете: не заводим, пока в декрете. */
  onMaternity: RegistryPerson[];
  /** Кого не тронули из-за skipHrIds / skipUserIds — то, что иначе было бы сделано. */
  skipped: { hrIds: string[]; userIds: number[] };
  /** Id из skipHrIds / skipUserIds, которых нет ни в HR, ни в Грейдах — опечатка. */
  skipErrors: { hrIds: string[]; userIds: number[] };
  conflicts: RegistryConflict[];
  stats: {
    /** Строк HR на входе. */
    hrRows: number;
    /** Из них не на позициях дизайна и дизайн-инженеров — в реестр не идут (только сверка ушедших). */
    ignoredPositions: number;
    /** Людей после склейки дублей по email (вместе с Lite и дизайн-инженерами). */
    people: number;
    /** Учёток, склеенных с другой учёткой того же email. */
    mergedDuplicates: number;
    /** Людей из отдела Lite (дизайн-инженеры) — пропущены, вне контура. */
    skippedLite: number;
    /** Людей на позиции 29 «Дизайн-инженер» (вне Lite) — пропущены, вне контура. */
    skippedEngineer: number;
    /** Совпали с Грейдами по email. */
    matched: number;
    /** Активных в Грейдах, кого нет в HR по email, — не деактивируем. */
    notInHr: number;
    /** Ушли по HR, но в декрете — не деактивируем. */
    keptOnLeave: number;
    /** Ушли по HR, но в Грейдах почасовщики — не деактивируем. */
    keptHourly: number;
  };
};

export type RegistryOptions = {
  /** Сегодня (YYYY-MM-DD, по Москве) — увольнение в будущем ещё не уход. */
  today: string;
  /** Ушедших заводим с этой даты увольнения (YYYY-MM-DD, включительно). По умолчанию — REGISTRY_DEPARTED_SINCE. */
  departedSince?: string;
  /** Учётки HR, которые не трогаем: не заводим, не дозаполняем, не деактивируем по ним. */
  skipHrIds?: readonly string[];
  /** Люди Грейдов, которых не трогаем: ни дат, ни деактивации. */
  skipUserIds?: readonly number[];
};

// ── Склейка дублей ──────────────────────────────────────────────────────

/**
 * Одна учётка на email — то же правило, что pickEmployee в lib/hrSalary:
 * живая (не в архиве и без даты увольнения); если живых нет — самая поздняя
 * по дате найма. Дубли бывают, когда учётку пересоздали.
 */
export function pickHrRecord<T extends Pick<HrPerson, 'hiredAt' | 'dismissedAt' | 'isArchive'>>(
  rows: T[],
): T | null {
  if (!rows.length) return null;
  const live = rows.filter((r) => !flag(r.isArchive) && !normalizeHrDate(r.dismissedAt));
  const pool = live.length ? live : rows;
  const hired = (r: T) => normalizeHrDate(r.hiredAt) ?? '';
  return [...pool].sort((a, b) => (hired(a) < hired(b) ? 1 : hired(a) > hired(b) ? -1 : 0))[0];
}

/** Учётка ещё работает: не в архиве и увольнение не наступило (в будущем — ещё работает). */
function isWorking(r: Pick<HrPerson, 'dismissedAt' | 'isArchive'>, today: string): boolean {
  const dismissed = normalizeHrDate(r.dismissedAt);
  return !flag(r.isArchive) && !(dismissed && dismissed <= today);
}

/**
 * Учётка не в архиве, а дата увольнения уже наступила: так HR оставляет
 * вернувшегося — снимает архив, старую дату не чистит (27.11.2026).
 */
function isUnarchivedDismissed(r: Pick<HrPerson, 'dismissedAt' | 'isArchive'>, today: string): boolean {
  const dismissed = normalizeHrDate(r.dismissedAt);
  return !flag(r.isArchive) && !!dismissed && dismissed <= today;
}

/** Ни одной работающей учётки, но есть не в архиве с датой увольнения — возможно, вернулся. */
function maybeReturned<T extends Pick<HrPerson, 'dismissedAt' | 'isArchive' | 'hiredAt'>>(
  rows: T[],
  today: string,
): T | null {
  if (rows.some((r) => isWorking(r, today))) return null;
  return pickHrRecord(rows.filter((r) => isUnarchivedDismissed(r, today)));
}

const day = (iso: string) => iso.slice(0, 10);
const byEmail = <T extends { email: string | null }>(a: T, b: T) =>
  (a.email ?? '').localeCompare(b.email ?? '');
const hrKey = (id: string) => id.trim().toLowerCase();

// ── Планировщик ─────────────────────────────────────────────────────────

/**
 * План сверки реестра: кого завести, кому дозаполнить даты, кого
 * деактивировать, кого пропустить и где расхождения. Ничего не пишет —
 * запись делает скрипт по плану. Повторный прогон после записи даёт пустой
 * план (кроме справок и нерешённых расхождений).
 */
export function planRegistrySync({
  hr,
  users,
  excluded,
  options,
}: {
  hr: HrPerson[];
  users: GradesUser[];
  excluded: string[];
  options: RegistryOptions;
}): RegistryPlan {
  const today = day(options.today);
  const since = day(options.departedSince ?? REGISTRY_DEPARTED_SINCE);
  const plan: RegistryPlan = {
    create: [],
    update: [],
    deactivate: [],
    manualCheck: [],
    skipExcluded: [],
    skipDepartedBefore: [],
    skipDepartedUndated: [],
    onMaternity: [],
    skipped: { hrIds: [], userIds: [] },
    skipErrors: { hrIds: [], userIds: [] },
    conflicts: [],
    stats: {
      hrRows: hr.length,
      ignoredPositions: 0,
      people: 0,
      mergedDuplicates: 0,
      skippedLite: 0,
      skippedEngineer: 0,
      matched: 0,
      notInHr: 0,
      keptOnLeave: 0,
      keptHourly: 0,
    },
  };
  const conflict = (c: RegistryConflict) => plan.conflicts.push(c);
  const skipHr = new Set((options.skipHrIds ?? []).map(hrKey).filter(Boolean));
  const skipUser = new Set(options.skipUserIds ?? []);
  const skippedHr = new Set<string>();
  const skippedUser = new Set<number>();

  // Все учётки набора по email — с любой позицией: по ним видно, ушёл ли
  // человек и есть ли у него своя учётка в HR
  const hrByEmail = new Map<string, HrPerson[]>();
  for (const row of hr) {
    const em = normalizeEmail(row.email);
    if (em) hrByEmail.set(em, [...(hrByEmail.get(em) ?? []), row]);
  }

  // 1. Позиции дизайна и дизайн-инженеров; без email сопоставить не с чем
  const groups = new Map<string, HrPerson[]>();
  for (const row of hr) {
    if (!HR_REGISTRY_POSITION_IDS.includes(Number(row.positionId))) {
      plan.stats.ignoredPositions++;
      continue;
    }
    const email = normalizeEmail(row.email);
    if (!email) {
      conflict({ kind: 'no_email', hrId: row.id, email: null });
      continue;
    }
    groups.set(email, [...(groups.get(email) ?? []), row]);
  }

  // 2. Один человек на email, поля — в виде Грейдов. Контур — по выбранной
  // (живой) учётке: перешёл в Lite или в дизайн-инженеры — вне контура, даже
  // если старая учётка была дизайнерской. Lite проверяем первым: дизайн-
  // инженер из Lite — в счётчике Lite.
  const people: RegistryPerson[] = [];
  const onLeave = new Set<string>();
  /** email → учётка «не в архиве, но с датой увольнения» при отсутствии работающих. */
  const returned = new Map<string, HrPerson>();
  const keysByHrId = new Map<string, string[]>();
  const surnamesByHrId = new Map<string, string[][]>();
  for (const [email, rows] of groups) {
    const r = pickHrRecord(rows)!;
    plan.stats.mergedDuplicates += rows.length - 1;
    if (isLiteDepartment(r.department)) {
      plan.stats.skippedLite++;
      continue;
    }
    const role = roleForPosition(r.positionId);
    if (!role) {
      // Сюда доходит только позиция 29: прочие отсеяны в шаге 1
      plan.stats.skippedEngineer++;
      continue;
    }
    const fullName = hrFullName(r);
    if (!fullName) {
      conflict({ kind: 'no_name', hrId: r.id, email });
      continue;
    }
    const hiredAt = normalizeHrDate(r.hiredAt);
    const dismissedAt = normalizeHrDate(r.dismissedAt);
    if (hiredAt && dismissedAt && dismissedAt < hiredAt) {
      conflict({ kind: 'dismissal_before_hire', hrId: r.id, email });
      continue;
    }
    if (flag(r.maternityLeave)) onLeave.add(email);
    const back = maybeReturned(rows, today);
    if (back) returned.set(email, back);
    keysByHrId.set(r.id, Array.from(new Set([nameKey(fullName), ...hrNameKeys(r)])));
    surnamesByHrId.set(r.id, hrSurnameKeys(r));
    const { department, buildCode } = mapHrDepartment(r.department);
    people.push({
      hrId: r.id,
      email,
      fullName,
      role,
      department,
      buildCode,
      hiredAt,
      dismissedAt,
      employmentType: flag(r.isHourly) ? 'hourly' : 'staff',
      departed: flag(r.isArchive) || (!!dismissedAt && dismissedAt <= today),
      hrRows: rows.length,
    });
  }
  plan.stats.people = groups.size;
  const keysOf = (p: RegistryPerson) => keysByHrId.get(p.hrId) ?? [nameKey(p.fullName)];

  const userByEmail = new Map(users.map((u) => [normalizeEmail(u.email), u]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const excludedSet = new Set(excluded.map(normalizeEmail));
  // Имена, уже занятые в Грейдах: и как записаны в Грейдах, и как в HR у
  // совпавших по email (в Грейдах имя бывает короче — «Саша» вместо
  // «Александр»; русское и латинское), — чтобы старая учётка того же
  // человека не стала второй карточкой. Ключ → все люди с ним.
  const takenNames = new Map<string, Set<number>>();
  const take = (key: string, id: number) => {
    if (key) takenNames.set(key, (takenNames.get(key) ?? new Set<number>()).add(id));
  };
  for (const u of users) take(nameKey(u.fullName), u.id);
  // Второе правило: слова имени в Грейдах и дата найма в Грейдах — для
  // «фамилия + дата найма»
  const nameWords = new Map(users.map((u) => [u.id, new Set(nameKey(u.fullName).split(' ').filter(Boolean))]));
  const usersByHire = new Map<string, GradesUser[]>();
  for (const u of users) {
    if (u.hiredAt) usersByHire.set(day(u.hiredAt), [...(usersByHire.get(day(u.hiredAt)) ?? []), u]);
  }

  // 3. Совпавшие по email: только пустые даты, остальное — Грейды главнее
  const pending: RegistryPerson[] = [];
  for (const p of people) {
    const u = userByEmail.get(p.email);
    if (!u) {
      if (excludedSet.has(p.email)) plan.skipExcluded.push(p);
      else pending.push(p);
      continue;
    }
    plan.stats.matched++;
    for (const k of keysOf(p)) take(k, u.id);

    const set: RegistryUpdate['set'] = {};
    if (!u.hiredAt && p.hiredAt) set.hiredAt = p.hiredAt;
    if (!u.active && !u.dismissedAt && p.dismissedAt) {
      // Дата увольнения не раньше найма — иначе в карточке «уволен до прихода»
      const hire = u.hiredAt ? day(u.hiredAt) : p.hiredAt;
      if (!hire || p.dismissedAt >= hire) set.dismissedAt = p.dismissedAt;
      else conflict({ kind: 'dismissal_before_hire', hrId: p.hrId, email: p.email, userId: u.id });
    }
    if (set.hiredAt || set.dismissedAt) {
      if (skipHr.has(hrKey(p.hrId)) || skipUser.has(u.id)) {
        if (skipHr.has(hrKey(p.hrId))) skippedHr.add(p.hrId);
        else skippedUser.add(u.id);
      } else plan.update.push({ userId: u.id, hrId: p.hrId, set });
    }

    if (!p.departed && !u.active) {
      conflict({ kind: 'active_in_hr_inactive_in_grades', hrId: p.hrId, email: p.email, userId: u.id });
    }
  }

  // 4. Нет в Грейдах по email. Сначала граница: ушедшие раньше неё (и без
  // даты увольнения) не заводятся — и в проверке тёзок не участвуют, чтобы
  // старая учётка не заблокировала свежую. Так же работающие в декрете: пока
  // в декрете, не заводим. Дальше: тёзка уже есть в Грейдах — «Похоже, уже
  // есть», не создаём (дубль учётки или сменённый email); тёзки внутри HR —
  // тоже не создаём: какая учётка настоящая, решает человек. Остальных
  // заводим: работающих — активными, ушедших — неактивными.
  const candidates: RegistryPerson[] = [];
  for (const p of pending) {
    // Не в архиве, но с датой увольнения — возможно, вернулся: не заводим
    // ни активным, ни неактивным (27.11.2026)
    const back = returned.get(p.email);
    if (back) {
      plan.manualCheck.push({ hrId: back.id, email: p.email, fullName: p.fullName, reason: 'returned' });
      continue;
    }
    if (p.departed && !p.dismissedAt) plan.skipDepartedUndated.push(p);
    else if (p.departed && p.dismissedAt! < since) plan.skipDepartedBefore.push(p);
    else if (!p.departed && onLeave.has(p.email)) plan.onMaternity.push(p);
    else if (skipHr.has(hrKey(p.hrId))) skippedHr.add(p.hrId);
    else candidates.push(p);
  }
  const pendingByName = new Map<string, Set<string>>();
  for (const p of candidates) {
    for (const k of keysOf(p)) pendingByName.set(k, (pendingByName.get(k) ?? new Set<string>()).add(p.hrId));
  }
  const nameMatches: Array<{ p: RegistryPerson; userIds: number[]; bySurnameAndHire: boolean }> = [];
  for (const p of candidates) {
    const ids = new Set<number>();
    for (const k of keysOf(p)) for (const id of takenNames.get(k) ?? []) ids.add(id);
    // Фамилия и дата найма — только вместе: одна фамилия ещё не тот же человек
    const bySurname = new Set<number>();
    const surnames = surnamesByHrId.get(p.hrId) ?? [];
    for (const u of p.hiredAt ? usersByHire.get(p.hiredAt) ?? [] : []) {
      const words = nameWords.get(u.id) ?? new Set<string>();
      if (surnames.some((s) => s.every((w) => words.has(w)))) bySurname.add(u.id);
    }
    if (ids.size || bySurname.size) {
      const all = new Set([...ids, ...bySurname]);
      nameMatches.push({ p, userIds: Array.from(all).sort((a, b) => a - b), bySurnameAndHire: !ids.size });
      continue;
    }
    if (keysOf(p).some((k) => (pendingByName.get(k)?.size ?? 0) > 1)) {
      conflict({ kind: 'duplicate_name_in_hr', hrId: p.hrId, email: p.email });
      continue;
    }
    plan.create.push({ ...p, active: !p.departed });
  }

  // «Похоже, уже есть». Однозначно — один человек в Грейдах, на него
  // претендует одна учётка HR, и своей учётки HR по email у него нет: тогда
  // пустую дату найма берём из этой учётки. Иначе — только отчёт.
  const claims = new Map<number, number>();
  for (const m of nameMatches) for (const id of m.userIds) claims.set(id, (claims.get(id) ?? 0) + 1);
  for (const { p, userIds, bySurnameAndHire } of nameMatches) {
    const ambiguous = userIds.length > 1 || (claims.get(userIds[0]) ?? 0) > 1;
    conflict({
      kind: 'name_matches_user',
      hrId: p.hrId,
      email: p.email,
      ...(userIds.length === 1 ? { userId: userIds[0] } : { userIds }),
      ...(ambiguous ? { ambiguous: true as const } : {}),
      ...(bySurnameAndHire ? { bySurnameAndHire: true as const } : {}),
    });
    if (ambiguous) continue;
    const u = userById.get(userIds[0]);
    if (!u || u.hiredAt || !p.hiredAt || hrByEmail.has(normalizeEmail(u.email))) continue;
    if (skipUser.has(u.id)) skippedUser.add(u.id);
    else plan.update.push({ userId: u.id, hrId: p.hrId, set: { hiredAt: p.hiredAt }, byName: true });
  }

  // 5. Ушедшие: активный в Грейдах, у кого по email в HR нет ни одной живой
  // учётки. Кого нет в HR, админов, декрет и почасовщиков не деактивируем.
  // Деактивируем, только если все учётки в архиве: не в архиве, но с датой
  // увольнения — «Проверьте вручную», возможно, вернулся (27.11.2026).
  for (const u of users) {
    if (!u.active) continue;
    const recs = hrByEmail.get(normalizeEmail(u.email)) ?? [];
    if (!recs.length) {
      plan.stats.notInHr++;
      continue;
    }
    if (recs.some((r) => isWorking(r, today))) continue;
    const r = pickHrRecord(recs)!;
    const who = { userId: u.id, hrId: r.id, email: normalizeEmail(u.email), fullName: u.fullName };
    if (u.role === 'admin') plan.manualCheck.push({ ...who, reason: 'admin' });
    else if (recs.some((x) => flag(x.maternityLeave))) plan.stats.keptOnLeave++;
    else if (u.employmentType === 'hourly') plan.stats.keptHourly++;
    else if (!recs.every((x) => flag(x.isArchive))) {
      plan.manualCheck.push({ ...who, hrId: maybeReturned(recs, today)?.id ?? r.id, reason: 'returned' });
    } else if (skipUser.has(u.id)) skippedUser.add(u.id);
    else if (recs.some((x) => skipHr.has(hrKey(x.id)))) skippedHr.add(recs.find((x) => skipHr.has(hrKey(x.id)))!.id);
    else plan.deactivate.push({ ...who, dismissedAt: normalizeHrDate(r.dismissedAt) });
  }

  // 6. Id из флагов, которых нет ни в HR, ни в Грейдах, — скорее опечатка
  const knownHr = new Set(hr.map((r) => hrKey(r.id)));
  const knownUser = new Set(users.map((u) => u.id));
  plan.skipErrors = {
    hrIds: Array.from(skipHr).filter((id) => !knownHr.has(id)).sort(),
    userIds: Array.from(skipUser).filter((id) => !knownUser.has(id)).sort((a, b) => a - b),
  };
  plan.skipped = {
    hrIds: Array.from(skippedHr).sort(),
    userIds: Array.from(skippedUser).sort((a, b) => a - b),
  };

  // Порядок — по email: отчёты двух прогонов сравниваются построчно
  plan.create.sort(byEmail);
  plan.skipExcluded.sort(byEmail);
  plan.skipDepartedBefore.sort(byEmail);
  plan.skipDepartedUndated.sort(byEmail);
  plan.onMaternity.sort(byEmail);
  plan.update.sort((a, b) => a.userId - b.userId);
  plan.deactivate.sort((a, b) => a.userId - b.userId);
  // «Проверьте вручную»: сначала люди Грейдов по id, потом нет в Грейдах — по email
  plan.manualCheck.sort(
    (a, b) => (a.userId ?? Infinity) - (b.userId ?? Infinity) || a.email.localeCompare(b.email),
  );
  plan.conflicts.sort((a, b) => a.kind.localeCompare(b.kind) || byEmail(a, b));
  return plan;
}
