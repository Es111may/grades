// Реестр людей из HR-портала (Phase 23.6a) — чистые функции, без запросов.
//
// Сверка «HR → Грейды»: у каждого, кто в HR числится на дизайнерской
// позиции, должна быть карточка в Грейдах. Нынешние уже есть — совпадают по
// email; ушедшие заводятся неактивными (active = false, без пароля — войти
// нельзя), с поп-апом, как у всех. Решения Pavel, 01.10.2026:
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
// Выборка из ClickHouse и запись в БД — scripts/sync-hr-registry.ts.

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
 * «Иванова Анна» и «Анна Иванова» совпадут.
 */
export function nameKey(fullName: string): string {
  return clean(fullName)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');
}

// ── Входы и выходы планировщика ─────────────────────────────────────────

/** Строка `employee_employee` (с названием отдела через команду) — как из ClickHouse. */
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

/** Новая карточка: ушедшие — неактивными, активные — только по флагу. */
export type RegistryCreate = RegistryPerson & { active: boolean };

/** Дозаполнение пустых дат у существующего человека. */
export type RegistryUpdate = {
  userId: number;
  hrId: string;
  set: { hiredAt?: string; dismissedAt?: string };
};

export type RegistryConflictKind =
  /** В HR нет email — сопоставить не с чем. */
  | 'no_email'
  /** В HR нет ни имени, ни фамилии. */
  | 'no_name'
  /** По email нет, но есть человек с тем же именем: старая учётка или сменённый email. */
  | 'name_matches_user'
  /** Несколько учёток HR с одним именем, ни одной в Грейдах — какая настоящая, неясно. */
  | 'duplicate_name_in_hr'
  /** В HR дата увольнения раньше найма (вернулся, а увольнение не сняли?). */
  | 'dismissal_before_hire'
  /** Справка: в HR работает, в Грейдах неактивен — не активируем. */
  | 'active_in_hr_inactive_in_grades'
  /** Справка: в HR уволен, в Грейдах активен (не почасовщик) — не деактивируем. */
  | 'dismissed_in_hr_active_in_grades';

export type RegistryConflict = {
  kind: RegistryConflictKind;
  hrId: string;
  email: string | null;
  /** Человек в Грейдах, с которым связано расхождение. */
  userId?: number;
};

/** Почему HR id из includeHrIds не создаётся: его нет среди activeMissing. */
export type RegistryIncludeErrorReason =
  /** Такой учётки нет в выборке (позиции 9, 20, 29) — опечатка или другая позиция. */
  | 'not_found'
  /** Учётка склеена с другой учёткой того же email — нужен id из отчёта. */
  | 'merged'
  /** Lite или «Дизайн-инженер» — вне контура дизайна. */
  | 'outside_contour'
  /** Уже есть в Грейдах (совпал по email). */
  | 'in_grades'
  /** В ExcludedEmail. */
  | 'excluded'
  /** В декрете — пока в декрете, не заводим. */
  | 'on_maternity'
  /** Ушёл: заводится неактивным и без флага либо пропущен по границе. */
  | 'departed'
  /** Расхождение (нет email или имени, тёзка, увольнение раньше найма) — сначала разобрать. */
  | 'conflict';

export type RegistryIncludeError = { hrId: string; reason: RegistryIncludeErrorReason };

export type RegistryPlan = {
  create: RegistryCreate[];
  update: RegistryUpdate[];
  skipExcluded: RegistryPerson[];
  /** Ушли раньше departedSince — карточку не заводим. */
  skipDepartedBefore: RegistryPerson[];
  /** Ушли (учётка в архиве), но даты увольнения нет — когда ушли, неизвестно, не заводим. */
  skipDepartedUndated: RegistryPerson[];
  /**
   * Активные в HR, которых нет в Грейдах. Создаются только с
   * includeActiveMissing (все) или includeHrIds (перечисленные).
   */
  activeMissing: RegistryPerson[];
  /** Активные в HR, которых нет в Грейдах, но они в декрете: не заводим никогда, даже по флагам. */
  onMaternity: RegistryPerson[];
  /** HR id из includeHrIds, которых нет среди activeMissing: для них ничего не создаём. */
  includeErrors: RegistryIncludeError[];
  conflicts: RegistryConflict[];
  stats: {
    /** Строк HR на входе. */
    hrRows: number;
    /** Из них не на позициях дизайна и дизайн-инженеров — пропущены. */
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
  };
};

export type RegistryOptions = {
  /** Сегодня (YYYY-MM-DD, по Москве) — увольнение в будущем ещё не уход. */
  today: string;
  /** Создавать всех активных в HR, которых нет в Грейдах (активными, без пароля). */
  includeActiveMissing?: boolean;
  /**
   * Создавать только этих активных, которых нет в Грейдах (HR id). Id не из
   * activeMissing — в includeErrors, для него ничего не создаётся.
   */
  includeHrIds?: readonly string[];
  /** Ушедших заводим с этой даты увольнения (YYYY-MM-DD, включительно). По умолчанию — REGISTRY_DEPARTED_SINCE. */
  departedSince?: string;
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

const day = (iso: string) => iso.slice(0, 10);
const byEmail = <T extends { email: string | null }>(a: T, b: T) =>
  (a.email ?? '').localeCompare(b.email ?? '');

// ── Планировщик ─────────────────────────────────────────────────────────

/**
 * План сверки реестра: кого создать, кому дозаполнить даты, кого пропустить
 * и где расхождения. Ничего не пишет — запись делает скрипт по плану.
 * Повторный прогон после записи даёт пустой план (кроме справок
 * и нерешённых расхождений).
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
    skipExcluded: [],
    skipDepartedBefore: [],
    skipDepartedUndated: [],
    activeMissing: [],
    onMaternity: [],
    includeErrors: [],
    conflicts: [],
    stats: {
      hrRows: hr.length,
      ignoredPositions: 0,
      people: 0,
      mergedDuplicates: 0,
      skippedLite: 0,
      skippedEngineer: 0,
      matched: 0,
    },
  };
  const conflict = (kind: RegistryConflictKind, hrId: string, email: string | null, userId?: number) =>
    plan.conflicts.push(userId === undefined ? { kind, hrId, email } : { kind, hrId, email, userId });
  // Чем кончилась каждая учётка — чтобы объяснить, почему id из includeHrIds
  // не создаётся. null — в activeMissing, создать можно.
  const hrKey = (id: string) => id.trim().toLowerCase();
  const fate = new Map<string, RegistryIncludeErrorReason | null>();
  const mark = (hrId: string, reason: RegistryIncludeErrorReason | null) => fate.set(hrKey(hrId), reason);
  const includeIds = new Set((options.includeHrIds ?? []).map(hrKey).filter(Boolean));

  // 1. Позиции дизайна и дизайн-инженеров; без email сопоставить не с чем
  const groups = new Map<string, HrPerson[]>();
  for (const row of hr) {
    if (!HR_REGISTRY_POSITION_IDS.includes(Number(row.positionId))) {
      plan.stats.ignoredPositions++;
      continue;
    }
    const email = (row.email ?? '').trim().toLowerCase();
    if (!email) {
      conflict('no_email', row.id, null);
      mark(row.id, 'conflict');
      continue;
    }
    // Пока — «склеена с другой»; выбранная учётка ниже получит свой итог
    mark(row.id, 'merged');
    groups.set(email, [...(groups.get(email) ?? []), row]);
  }

  // 2. Один человек на email, поля — в виде Грейдов. Контур — по выбранной
  // (живой) учётке: перешёл в Lite или в дизайн-инженеры — вне контура, даже
  // если старая учётка была дизайнерской. Lite проверяем первым: дизайн-
  // инженер из Lite — в счётчике Lite.
  const people: RegistryPerson[] = [];
  const onLeave = new Set<string>();
  for (const [email, rows] of groups) {
    const r = pickHrRecord(rows)!;
    plan.stats.mergedDuplicates += rows.length - 1;
    if (isLiteDepartment(r.department)) {
      plan.stats.skippedLite++;
      mark(r.id, 'outside_contour');
      continue;
    }
    const role = roleForPosition(r.positionId);
    if (!role) {
      // Сюда доходит только позиция 29: прочие отсеяны в шаге 1
      plan.stats.skippedEngineer++;
      mark(r.id, 'outside_contour');
      continue;
    }
    const fullName = hrFullName(r);
    if (!fullName) {
      conflict('no_name', r.id, email);
      mark(r.id, 'conflict');
      continue;
    }
    const hiredAt = normalizeHrDate(r.hiredAt);
    const dismissedAt = normalizeHrDate(r.dismissedAt);
    if (hiredAt && dismissedAt && dismissedAt < hiredAt) {
      conflict('dismissal_before_hire', r.id, email);
      mark(r.id, 'conflict');
      continue;
    }
    if (flag(r.maternityLeave)) onLeave.add(email);
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

  const userByEmail = new Map(users.map((u) => [u.email.trim().toLowerCase(), u]));
  const excludedSet = new Set(excluded.map((e) => e.trim().toLowerCase()));
  // Имена, уже занятые в Грейдах: и как записаны в Грейдах, и как в HR у
  // совпавших по email (в Грейдах имя бывает короче — «Саша» вместо
  // «Александр»), — чтобы старая учётка того же человека не стала второй
  // карточкой.
  const takenNames = new Map<string, number>();
  for (const u of users) takenNames.set(nameKey(u.fullName), u.id);

  // 3. Совпавшие по email: только пустые даты, остальное — Грейды главнее
  const pending: RegistryPerson[] = [];
  for (const p of people) {
    const u = userByEmail.get(p.email);
    if (!u) {
      if (excludedSet.has(p.email)) {
        plan.skipExcluded.push(p);
        mark(p.hrId, 'excluded');
      } else pending.push(p);
      continue;
    }
    plan.stats.matched++;
    mark(p.hrId, 'in_grades');
    if (!takenNames.has(nameKey(p.fullName))) takenNames.set(nameKey(p.fullName), u.id);

    const set: RegistryUpdate['set'] = {};
    if (!u.hiredAt && p.hiredAt) set.hiredAt = p.hiredAt;
    if (!u.active && !u.dismissedAt && p.dismissedAt) {
      // Дата увольнения не раньше найма — иначе в карточке «уволен до прихода»
      const hire = u.hiredAt ? day(u.hiredAt) : p.hiredAt;
      if (!hire || p.dismissedAt >= hire) set.dismissedAt = p.dismissedAt;
      else conflict('dismissal_before_hire', p.hrId, p.email, u.id);
    }
    if (set.hiredAt || set.dismissedAt) plan.update.push({ userId: u.id, hrId: p.hrId, set });

    if (!p.departed && !u.active) conflict('active_in_hr_inactive_in_grades', p.hrId, p.email, u.id);
    if (p.departed && u.active && u.employmentType !== 'hourly') {
      conflict('dismissed_in_hr_active_in_grades', p.hrId, p.email, u.id);
    }
  }

  // 4. Нет в Грейдах. Сначала граница: ушедшие раньше неё (и без даты
  // увольнения) не заводятся — и в проверке тёзок не участвуют, чтобы
  // старая учётка не заблокировала свежую. Так же активные в декрете: пока
  // в декрете, не заводим, ни по каким флагам. Дальше: тёзка уже есть — не
  // создаём (дубль учётки или сменённый email), тёзки внутри HR — тоже:
  // какая учётка настоящая, решает человек. Остальных — ушедших создаём,
  // активных перечисляем (и создаём по флагу).
  const candidates: RegistryPerson[] = [];
  for (const p of pending) {
    if (p.departed && !p.dismissedAt) {
      plan.skipDepartedUndated.push(p);
      mark(p.hrId, 'departed');
    } else if (p.departed && p.dismissedAt! < since) {
      plan.skipDepartedBefore.push(p);
      mark(p.hrId, 'departed');
    } else if (!p.departed && onLeave.has(p.email)) {
      plan.onMaternity.push(p);
      mark(p.hrId, 'on_maternity');
    } else candidates.push(p);
  }
  const pendingByName = new Map<string, number>();
  for (const p of candidates) {
    const key = nameKey(p.fullName);
    pendingByName.set(key, (pendingByName.get(key) ?? 0) + 1);
  }
  for (const p of candidates) {
    const key = nameKey(p.fullName);
    const userId = takenNames.get(key);
    if (userId !== undefined) {
      conflict('name_matches_user', p.hrId, p.email, userId);
      mark(p.hrId, 'conflict');
      continue;
    }
    if ((pendingByName.get(key) ?? 0) > 1) {
      conflict('duplicate_name_in_hr', p.hrId, p.email);
      mark(p.hrId, 'conflict');
      continue;
    }
    if (p.departed) {
      plan.create.push({ ...p, active: false });
      mark(p.hrId, 'departed');
    } else {
      plan.activeMissing.push(p);
      mark(p.hrId, null);
      if (options.includeActiveMissing || includeIds.has(hrKey(p.hrId))) plan.create.push({ ...p, active: true });
    }
  }

  // 5. Id из includeHrIds не из activeMissing — ошибка в отчёт, ничего не создаём
  for (const id of includeIds) {
    const reason = fate.has(id) ? fate.get(id) ?? null : 'not_found';
    if (reason) plan.includeErrors.push({ hrId: id, reason });
  }

  // Порядок — по email: отчёты двух прогонов сравниваются построчно
  plan.create.sort(byEmail);
  plan.skipExcluded.sort(byEmail);
  plan.skipDepartedBefore.sort(byEmail);
  plan.skipDepartedUndated.sort(byEmail);
  plan.activeMissing.sort(byEmail);
  plan.onMaternity.sort(byEmail);
  plan.update.sort((a, b) => a.userId - b.userId);
  plan.conflicts.sort((a, b) => a.kind.localeCompare(b.kind) || byEmail(a, b));
  return plan;
}
