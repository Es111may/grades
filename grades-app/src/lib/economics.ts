// «Экономика» (Phase 23.6b) — чистые функции без запросов.
//
// Контур — как в Грейдах (решение Pavel «оргисключения — как в Грейдах»):
// человек входит, если он есть в «Команде» с ролью designer/stardiz/lead —
// работает или ушёл не раньше TRACK_SINCE. Даты найма и увольнения, отдел,
// роль, грейд, почасовщик, тип и причина ухода, плановые пересмотры — из
// Грейдов; из HR-портала (lib/hrEconomics) по email, с любой позицией, —
// только ставки, журнал и причина ухода из справочника HR. На выходе —
// люди (EconPerson) и всё, что рисует страница /admin/economics.
//
// Правила, общие с поп-апом «Зарплата» (lib/compensation):
//   • суммы — только из журнала изменений; «→ 0», «не изменилась» и точные
//     дубли — мусор журнала, ставкой не считаем;
//   • изменение в первую неделю после найма — стартовая ставка, не повышение;
//   • журнала нет — ставка приближена текущей из карточки HR (покрытие
//     показываем подписью «История ставок есть по N из M»).
// Свои правила «Экономики»:
//   • период — с 1 января текущего года, сравнение — с тем же днём прошлого
//     года; YoY только у общих цифр (на группах до 6 человек он шумит);
//   • почасовщики входят в ФОТ и численность, но не в медианы и вилки;
//   • билд без грейдов («Коммуникации», lib/employment) — в ФОТ и
//     численности, уровень — «Без грейда» (даже если осталась оценка из
//     прошлого билда): вилки нет, в медианы входит, как другие без грейда;
//   • активен на дату — работает в Грейдах или уволен в Грейдах позже этой
//     даты (точка месяца — его последний день);
//   • ушедших трекаем с TRACK_SINCE (решение Pavel, 01.10.2026): ушедшие
//     раньше не участвуют ни в рядах, ни в расчётах, помесячный ряд
//     начинается с этого месяца.
// Все суммы — ₽/мес «на руки», как в HR. «Для компании» умножает интерфейс.

import { bandFor, bandState, type BandState, type SalaryBand } from './salaryBands';
import { plannedRaiseState, type HrLogRow } from './compensation';
import { DISMISSAL_TYPE_LABELS, isDismissalType, type DismissalType } from './dismissal';
import { isNonGradingBuild } from './employment';
import { GRADE_NAMES, type GradeCode } from './types';

// ═══════════════════════════ Типы ═══════════════════════════

export type EconDept = 'navigator' | 'visioner' | 'creator' | 'leads';
export type DeptFilter = 'all' | EconDept | 'none';
export type EconLevel = GradeCode | 'stardiz' | 'lead';
export type Initiator = 'employee' | 'company';

/** Ставка с даты (включительно), ₽. Первая — стартовая. */
export type SalaryStep = { date: string; salary: number };
/** Период работы: с даты найма по дату увольнения (последний рабочий день). */
export type Stint = { from: string; to: string | null };

export type ExitInfo = {
  /** Причина и подкатегория из HR (employee_dismissalreason*), если заполнены. */
  reasonId: string | null;
  subId: string | null;
  /** Тип увольнения из Грейдов — запасной инициатор, если в HR причины нет. */
  gradesType: DismissalType | null;
  /** Причина из Грейдов (перенос из таблички) — свободный текст. */
  note: string | null;
};

export type EconPerson = {
  /** id записи HR — стабильный ключ строк. */
  key: string;
  name: string;
  avatarUrl: string | null;
  dept: EconDept | null;
  /** Уровень для «По уровням»: грейд дизайнера, стардиз, лид; null — без грейда. */
  level: EconLevel | null;
  hourly: boolean;
  stints: Stint[];
  steps: SalaryStep[];
  /** Журнала ставок в HR нет — история приближена текущей ставкой. */
  noHistory: boolean;
  /** Невыполненный плановый пересмотр из Грейдов (сумма — новая ставка). */
  planned: { at: string | null; salary: number } | null;
  /** Причина ухода — к последнему закрытому периоду. */
  exit: ExitInfo | null;
};

export type ReasonGroup = {
  id: string;
  title: string;
  initiator: Initiator | null;
  subs: Array<{ id: string; title: string }>;
};

/** ФОТ и численность компании по месяцам (ключ — YYYY-MM). */
export type CompanyStats = {
  fotByMonth: Record<string, number>;
  headcountByMonth: Record<string, number>;
  exitsByMonth: Record<string, number>;
};

// ─── Сырые данные HR (их собирает lib/hrEconomics) ────────────────────

export type HrEmployeeRaw = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  positionId: string;
  /** Отдел HR (`employee_department.name` через команду): improve, create, design.inhouse… */
  department: string;
  hiredAt: string | null;
  dismissedAt: string | null;
  archived: boolean;
  /** Ставка из карточки, ₽ — запасной источник, если журнала нет. */
  salary: number;
  reasonId: string | null;
  subId: string | null;
};
export type HrLogRaw = { employeeId: string; date: string; from: number; to: number };
export type HrReasonRaw = { id: string; initiator: number | null; title: string };
export type HrSubRaw = { id: string; reasonId: string; title: string };

export type HrEconomicsRaw = {
  /** Записи HR по email людей контура — с любой позицией. */
  employees: HrEmployeeRaw[];
  /**
   * Email работающих в HR в контуре дизайна — только для справки «нет
   * в «Команде»»: позиции 9 и 20, без Lite и декрета (lib/hrEconomics →
   * toDesignWorking).
   */
  designWorkingEmails: string[];
  logs: HrLogRaw[];
  reasons: HrReasonRaw[];
  subs: HrSubRaw[];
  company: CompanyStats;
  /** Когда выборка пришла из HR (ISO). */
  fetchedAt: string;
};

/** Что Грейды знают о человеке — накладывается поверх HR по email. */
export type GradesOverlay = {
  email: string;
  fullName: string;
  role: string;
  department: string | null;
  buildCode: string | null;
  employmentType: string | null;
  active: boolean;
  /** Даты из Грейдов (YYYY-MM-DD или ISO) — главнее HR. */
  hiredAt: string | null;
  dismissedAt: string | null;
  /** Грейд последней опубликованной оценки (effectiveGrade). */
  grade: string | null;
  avatarUrl: string | null;
  dismissalType: string | null;
  dismissalReason: string | null;
  plannedRaise: {
    setAt: string;
    baselineAt: string | null;
    at: string | null;
    salary: number | null;
  } | null;
};

export type EconomicsDataset = {
  today: string;
  people: EconPerson[];
  reasons: ReasonGroup[];
  company: CompanyStats;
  notes: {
    /** Люди контура, которых нет в HR: без ставок, в цифры не входят. */
    missingInHr: number;
    /**
     * Работают в HR на дизайнерских позициях (9, 20; не Lite, не в декрете),
     * но в «Команде» их нет — даже неактивной карточкой.
     */
    hrOnlyDesign: number;
  };
};

// ═══════════════════════════ Даты ═══════════════════════════

const EPOCH = '1970-01-01';

/**
 * С какой даты трекаем уходы (решение Pavel): люди и периоды, закончившиеся
 * раньше, в «Экономику» не попадают; «Динамика по месяцам» — с этого месяца.
 */
export const TRACK_SINCE = '2025-01-01';
const day = (iso: string) => iso.slice(0, 10);
const DAY_MS = 864e5;

export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(day(iso) + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
}

function lastDayOfMonth(y: number, m: number): string {
  // День 0 следующего месяца — последний день текущего
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** Окно страницы: сегодня, 1 января и тот же день год назад. */
export type EconWindow = { today: string; jan1: string; yearAgo: string; yearEnd: string };

export function econWindow(today: string): EconWindow {
  const t = day(today);
  const y = Number(t.slice(0, 4));
  const md = t.slice(5);
  // 29 февраля год назад — 28-е
  const yearAgo = `${y - 1}-${md === '02-29' ? '02-28' : md}`;
  return { today: t, jan1: `${y}-01-01`, yearAgo, yearEnd: `${y}-12-31` };
}

export type MonthSlot = { key: string; y: number; m: number; at: string };

/**
 * Месяцы с месяца `since` (по умолчанию TRACK_SINCE) по текущий
 * включительно. Точка месяца — его последний день, у текущего — сегодня.
 */
export function monthSlots(today: string, since: string = TRACK_SINCE): MonthSlot[] {
  const t = day(today);
  const end = Number(t.slice(0, 4)) * 12 + Number(t.slice(5, 7)) - 1;
  const start = Number(since.slice(0, 4)) * 12 + Number(since.slice(5, 7)) - 1;
  const out: MonthSlot[] = [];
  for (let idx = start; idx <= end; idx++) {
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    const last = lastDayOfMonth(y, m);
    out.push({ key: `${y}-${String(m).padStart(2, '0')}`, y, m, at: last < t ? last : t });
  }
  return out;
}

// ═══════════════════════ Журнал ставок ═══════════════════════

/** Сколько дней после найма изменение ставки — стартовая ставка (как в compensation). */
const HIRE_WINDOW_DAYS = 7;

/**
 * Журнал без мусора, по возрастанию даты — те же правила, что у поп-апа
 * (lib/compensation): «не изменилась», «→ 0» и точные дубли выкидываем.
 */
export function normalizeLog(log: Array<{ date: string; from: number; to: number }>): HrLogRow[] {
  const seen = new Set<string>();
  const rows: HrLogRow[] = [];
  for (const r of log) {
    if (r.to === r.from || r.to <= 0) continue;
    const row = { date: day(r.date), from: r.from, to: r.to };
    const key = `${row.date}|${row.from}|${row.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * К какому найму относится запись как стартовая ставка: дата найма, если
 * запись в первую неделю после него или «с нуля» (from ≤ 0). null — обычное
 * изменение ставки.
 */
function hireDateOf(r: HrLogRow, hires: string[]): string | null {
  const before = hires.filter((h) => h <= r.date).sort();
  const last = before[before.length - 1] ?? null;
  if (r.from <= 0) return last ?? r.date;
  if (last && r.date <= addDays(last, HIRE_WINDOW_DAYS)) return last;
  return null;
}

/**
 * Ступени ставки из журнала. Стартовая ставка встаёт на дату найма; если
 * первая запись — повышение, до неё действовала ставка «было». Журнала нет —
 * одна ступень с текущей ставкой из карточки HR (приближение).
 */
export function salarySteps(
  log: Array<{ date: string; from: number; to: number }>,
  hires: string[],
  fallback: number,
): SalaryStep[] {
  const rows = normalizeLog(log);
  if (!rows.length) return fallback > 0 ? [{ date: EPOCH, salary: fallback }] : [];
  const steps: SalaryStep[] = [];
  if (!hireDateOf(rows[0], hires)) steps.push({ date: EPOCH, salary: rows[0].from });
  for (const r of rows) steps.push({ date: hireDateOf(r, hires) ?? r.date, salary: r.to });
  // Сортировка устойчивая: при равной дате побеждает более поздняя запись журнала
  return steps.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Ставка на дату, ₽. До первой ступени — стартовая; ступеней нет — 0. */
export function salaryAt(p: Pick<EconPerson, 'steps'>, d: string): number {
  let v = p.steps[0]?.salary ?? 0;
  for (const s of p.steps) if (s.date <= d) v = s.salary;
  return v;
}

// ═══════════════════════ Люди и периоды ═══════════════════════

export function isActiveAt(p: Pick<EconPerson, 'stints'>, d: string): boolean {
  return p.stints.some((s) => s.from <= d && (s.to == null || s.to >= d));
}

export function inDept(p: Pick<EconPerson, 'dept'>, f: DeptFilter): boolean {
  if (f === 'all') return true;
  if (f === 'none') return p.dept == null;
  return p.dept === f;
}

const BUILD_DEPT: Record<string, EconDept> = {
  Импрув: 'navigator',
  Криэйт: 'visioner',
  Инхаус: 'creator',
  navigator: 'navigator',
  visioner: 'visioner',
  creator: 'creator',
};

/**
 * Отдел по отделу HR — запасной вариант, если в Грейдах не указан. В HR
 * отделы называются improve, create, design.inhouse (как в lib/hrRegistry);
 * русские названия — на случай переименования.
 */
export function deptFromHr(department: string): EconDept | null {
  const t = department.toLowerCase();
  if (/импрув|improve|navigator/.test(t)) return 'navigator';
  if (/криэйт|креэйт|create|visioner/.test(t)) return 'visioner';
  if (/инхаус|in-?house|creator/.test(t)) return 'creator';
  return null;
}

/** id позиции «Lead Designer» в HR. */
export const HR_LEAD_POSITION = '20';

function levelOf(g: GradesOverlay, positionIds: string[]): EconLevel | null {
  if (g?.role === 'lead') return 'lead';
  if (g?.role === 'stardiz') return 'stardiz';
  if (g?.role === 'designer') {
    // Билд без грейдов — «Без грейда», старая оценка не в счёт
    if (isNonGradingBuild(g)) return null;
    return (g.grade as GradeCode | null) ?? null;
  }
  return positionIds.includes(HR_LEAD_POSITION) ? 'lead' : null;
}

function deptOf(g: GradesOverlay, level: EconLevel | null, hrDepartment: string): EconDept | null {
  if (level === 'lead') return 'leads';
  const fromGrades = (g?.department && BUILD_DEPT[g.department]) || (g?.buildCode && BUILD_DEPT[g.buildCode]);
  return fromGrades || deptFromHr(hrDepartment);
}

/** Роли контура «Экономики». */
export const ECON_ROLES = ['designer', 'stardiz', 'lead'] as const;

/** Входит в «Экономику»: роль дизайна и работает или ушёл не раньше TRACK_SINCE. */
export function inEconomicsContour(g: Pick<GradesOverlay, 'role' | 'active' | 'dismissedAt'>): boolean {
  if (!(ECON_ROLES as readonly string[]).includes(g.role)) return false;
  return g.active || (!!g.dismissedAt && day(g.dismissedAt) >= TRACK_SINCE);
}

const stintOf = (r: HrEmployeeRaw): Stint => ({ from: r.hiredAt ?? EPOCH, to: r.dismissedAt });

/**
 * Люди контура: Грейды + ставки HR по email. Нет записи в HR — человека
 * нет в цифрах, считаем в missingInHr. Записи одного email (возвращения,
 * пересозданная карточка) — один журнал.
 */
export function buildEconPeople(input: {
  employees: HrEmployeeRaw[];
  logs: HrLogRaw[];
  grades: GradesOverlay[];
  today: string;
}): { people: EconPerson[]; missingInHr: number } {
  const byEmail = new Map<string, HrEmployeeRaw[]>();
  for (const r of input.employees) {
    const email = r.email.trim().toLowerCase();
    if (email) byEmail.set(email, [...(byEmail.get(email) ?? []), r]);
  }
  const logById = new Map<string, HrLogRaw[]>();
  for (const l of input.logs) logById.set(l.employeeId, [...(logById.get(l.employeeId) ?? []), l]);

  let missingInHr = 0;
  const people: EconPerson[] = [];
  for (const g of input.grades) {
    if (!inEconomicsContour(g)) continue;
    const recs = byEmail.get(g.email.trim().toLowerCase());
    if (!recs?.length) {
      missingInHr++;
      continue;
    }
    // Основная запись — живая, иначе с самым поздним наймом (как pickEmployee в hrSalary)
    const live = recs.filter((r) => !r.archived && !r.dismissedAt);
    const picked = [...(live.length ? live : recs)].sort((a, b) =>
      (a.hiredAt ?? '') < (b.hiredAt ?? '') ? 1 : -1,
    )[0];
    // Даты — из Грейдов; нет даты найма — из HR
    const from = g.hiredAt ? day(g.hiredAt) : picked.hiredAt ?? EPOCH;
    const to = g.active ? null : day(g.dismissedAt!);
    const stints: Stint[] = [{ from, to }];
    // Стартовая ставка — относительно любого найма: и в HR, и в Грейдах
    const hires = Array.from(new Set([from, ...recs.map((r) => stintOf(r).from)]));
    const log = normalizeLog(recs.flatMap((r) => logById.get(r.id) ?? []));
    const level = levelOf(g, recs.map((r) => r.positionId));
    // Причина из справочника HR — у записи с самым поздним увольнением
    const leftRec = [...recs]
      .filter((r) => r.dismissedAt)
      .sort((a, b) => ((a.dismissedAt ?? '') < (b.dismissedAt ?? '') ? 1 : -1))[0];

    let planned: EconPerson['planned'] = null;
    const pr = g.plannedRaise;
    if (pr && pr.salary != null && pr.salary > 0) {
      const state = plannedRaiseState({ setAt: pr.setAt, baselineAt: pr.baselineAt }, log, from);
      if (state === 'active') planned = { at: pr.at ? day(pr.at) : null, salary: pr.salary };
    }

    people.push({
      key: picked.id,
      name: g.fullName || `${picked.firstName} ${picked.lastName}`.trim() || g.email,
      avatarUrl: g.avatarUrl,
      dept: deptOf(g, level, picked.department),
      level,
      hourly: g.employmentType === 'hourly',
      stints,
      steps: salarySteps(log, hires, picked.salary),
      noHistory: log.length === 0,
      planned,
      exit:
        to != null
          ? {
              reasonId: leftRec?.reasonId ?? null,
              subId: leftRec?.subId ?? null,
              gradesType: isDismissalType(g.dismissalType) ? (g.dismissalType as DismissalType) : null,
              note: g.dismissalReason?.trim() || null,
            }
          : null,
    });
  }
  return { people: people.sort((a, b) => a.name.localeCompare(b.name, 'ru')), missingInHr };
}

// ═══════════════════════ Причины ухода ═══════════════════════

const COMPANY_MARKERS = /оптимизац|испытательн|сокращ|плохое исполнение|софт/i;
const EMPLOYEE_MARKERS = /услови[яей]* труда|сфер[аы] деятельности|процесс/i;

/**
 * Инициатор причины. В HR поле initiator: 1 — сотрудник, 0 — компания;
 * проверяем по смыслу названий («Оптимизация», «Не прошёл испытательный
 * срок» — компания, «Условия труда» — сотрудник) и, если справочник
 * размечен наоборот, переворачиваем всё целиком.
 */
export function resolveInitiators(reasons: HrReasonRaw[]): Map<string, Initiator | null> {
  let agree = 0;
  let disagree = 0;
  for (const r of reasons) {
    if (r.initiator !== 0 && r.initiator !== 1) continue;
    const asIs: Initiator = r.initiator === 1 ? 'employee' : 'company';
    if (COMPANY_MARKERS.test(r.title)) asIs === 'company' ? agree++ : disagree++;
    else if (EMPLOYEE_MARKERS.test(r.title)) asIs === 'employee' ? agree++ : disagree++;
  }
  const flip = disagree > agree;
  const out = new Map<string, Initiator | null>();
  for (const r of reasons) {
    if (r.initiator !== 0 && r.initiator !== 1) {
      out.set(r.id, null);
      continue;
    }
    const employee = (r.initiator === 1) !== flip;
    out.set(r.id, employee ? 'employee' : 'company');
  }
  return out;
}

/** Справочник HR → группы: сначала инициатива сотрудника, затем компании. */
export function buildReasonGroups(reasons: HrReasonRaw[], subs: HrSubRaw[]): ReasonGroup[] {
  const init = resolveInitiators(reasons);
  const rank = (i: Initiator | null) => (i === 'employee' ? 0 : i === 'company' ? 1 : 2);
  return reasons
    .map((r) => ({
      id: r.id,
      title: capitalize(r.title.trim()) || 'Без названия',
      initiator: init.get(r.id) ?? null,
      subs: subs
        .filter((s) => s.reasonId === r.id)
        .map((s) => ({ id: s.id, title: capitalize(s.title.trim()) || 'Без названия' }))
        .sort((a, b) => a.title.localeCompare(b.title, 'ru')),
    }))
    .sort((a, b) => rank(a.initiator) - rank(b.initiator) || a.title.localeCompare(b.title, 'ru'));
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Инициатор по типу увольнения из Грейдов. */
export function initiatorFromGrades(t: DismissalType | null): Initiator | null {
  if (t === 'voluntary') return 'employee';
  if (t === 'company' || t === 'probation') return 'company';
  return null;
}

// ═══════════════════════ Сборка набора ═══════════════════════

export function buildEconomicsDataset(input: {
  raw: HrEconomicsRaw;
  grades: GradesOverlay[];
  today: string;
}): EconomicsDataset {
  const { people, missingInHr } = buildEconPeople({
    employees: input.raw.employees,
    logs: input.raw.logs,
    grades: input.grades,
    today: input.today,
  });
  // Работают в HR дизайнерами, а в «Команде» их нет вовсе — только число.
  // Контур (без Lite, дизайн-инженеров и декрета) уже отобран при выборке
  const known = new Set(input.grades.map((g) => g.email.trim().toLowerCase()));
  const hrOnlyDesign = new Set(
    input.raw.designWorkingEmails.map((e) => e.trim().toLowerCase()).filter((e) => e && !known.has(e)),
  ).size;
  return {
    today: day(input.today),
    people,
    reasons: buildReasonGroups(input.raw.reasons, input.raw.subs),
    company: input.raw.company,
    notes: { missingInHr, hrOnlyDesign },
  };
}

// ═══════════════════════ Агрегаты ═══════════════════════

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** Изменение в процентах; null, если базы нет. */
export function pctDelta(from: number | null | undefined, to: number | null | undefined): number | null {
  if (from == null || to == null || from <= 0) return null;
  return ((to - from) / from) * 100;
}

/** Ставка входит в медианы и вилки: не почасовщик и ставка известна. */
const paid = (p: EconPerson, salary: number) => !p.hourly && salary > 0;

export type Snapshot = {
  count: number;
  fot: number;
  /** Медиана и среднее — без почасовщиков и без нулевых ставок. */
  median: number | null;
  mean: number | null;
  paidCount: number;
};

export function snapshot(people: EconPerson[], d: string): Snapshot {
  const act = people.filter((p) => isActiveAt(p, d));
  const sal = act.map((p) => salaryAt(p, d));
  const paidSal = act.map((p, i) => [p, sal[i]] as const).filter(([p, s]) => paid(p, s)).map(([, s]) => s);
  return {
    count: act.length,
    fot: sum(sal),
    median: median(paidSal),
    mean: paidSal.length ? sum(paidSal) / paidSal.length : null,
    paidCount: paidSal.length,
  };
}

/** YoY показываем только у общих цифр: на маленьких группах он шумит. */
export const YOY_MIN_COUNT = 6;
/** Малая группа — медиану показываем с подписью «n = 2». */
export const SMALL_N = 3;

export function showYoY(now: Snapshot, ago: Snapshot): boolean {
  return now.count >= YOY_MIN_COUNT && ago.count >= YOY_MIN_COUNT;
}

/** ФОТ компании за месяц; нет данных — берём предыдущий месяц (HR пишет с задержкой). */
export function companyFotAt(company: CompanyStats, key: string): number | null {
  const v = company.fotByMonth[key];
  if (v != null && v > 0) return v;
  const [y, m] = key.split('-').map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const p = company.fotByMonth[prev];
  return p != null && p > 0 ? p : null;
}

export type MonthPoint = MonthSlot & {
  fot: number;
  count: number;
  /** Доля в ФОТ компании, %; null — нет данных о компании. */
  share: number | null;
  companyFot: number | null;
};

export function monthlySeries(
  people: EconPerson[],
  company: CompanyStats,
  today: string,
  since: string = TRACK_SINCE,
): MonthPoint[] {
  return monthSlots(today, since).map((slot) => {
    const s = snapshot(people, slot.at);
    const companyFot = companyFotAt(company, slot.key);
    return { ...slot, fot: s.fot, count: s.count, companyFot, share: companyFot ? (s.fot / companyFot) * 100 : null };
  });
}

// ─── «Куда ушли деньги с 1 января» ────────────────────────────────────

export type Bridge = {
  start: number;
  startCount: number;
  end: number;
  endCount: number;
  /** ГПЗП: Σ (текущая − на 1 января) по людям с ростом. */
  raises: number;
  raiseCount: number;
  cuts: number;
  cutCount: number;
  /** Текущие ставки нанятых с 1 января, кто работает сейчас. */
  hires: number;
  hireCount: number;
  /** Ставки ушедших на 1 января. */
  leavers: number;
  leaverCount: number;
  /** Нанят и ушёл в этом году — в разложение не входит. */
  inOut: number;
  /** Плановые пересмотры до конца года: новая ставка − текущая. */
  planned: number;
  plannedCount: number;
  growthPct: number | null;
  plannedGrowthPct: number | null;
};

export function bridge(people: EconPerson[], w: EconWindow): Bridge {
  const b: Bridge = {
    start: 0, startCount: 0, end: 0, endCount: 0, raises: 0, raiseCount: 0, cuts: 0, cutCount: 0,
    hires: 0, hireCount: 0, leavers: 0, leaverCount: 0, inOut: 0, planned: 0, plannedCount: 0,
    growthPct: null, plannedGrowthPct: null,
  };
  for (const p of people) {
    const a0 = isActiveAt(p, w.jan1);
    const a1 = isActiveAt(p, w.today);
    const s0 = a0 ? salaryAt(p, w.jan1) : 0;
    const s1 = a1 ? salaryAt(p, w.today) : 0;
    if (a0) {
      b.start += s0;
      b.startCount++;
    }
    if (a1) {
      b.end += s1;
      b.endCount++;
    }
    if (a0 && a1) {
      const d = s1 - s0;
      if (d > 0) {
        b.raises += d;
        b.raiseCount++;
      } else if (d < 0) {
        b.cuts += d;
        b.cutCount++;
      }
    } else if (a1) {
      b.hires += s1;
      b.hireCount++;
    } else if (a0) {
      b.leavers += s0;
      b.leaverCount++;
    } else if (p.stints.some((s) => s.from > w.jan1 && s.from <= w.today)) {
      b.inOut++;
    }
    if (a1 && p.planned && (p.planned.at == null || p.planned.at <= w.yearEnd)) {
      const delta = p.planned.salary - s1;
      if (delta > 0) {
        b.planned += delta;
        b.plannedCount++;
      }
    }
  }
  b.growthPct = pctDelta(b.start, b.end);
  b.plannedGrowthPct = pctDelta(b.start, b.end + b.planned);
  return b;
}

/** СГПЗП — ГПЗП на человека с ростом. */
export function avgRaise(b: Bridge): number | null {
  return b.raiseCount ? b.raises / b.raiseCount : null;
}

/** Ориентир роста ФОТ на год (не бюджет): к 31 декабря относительно 1 января. */
export function guideline(b: Bridge, targetRate: number) {
  return {
    targetPct: targetRate * 100,
    targetFot: b.start * (1 + targetRate),
    nowPct: b.growthPct,
    withPlansPct: b.plannedGrowthPct,
  };
}

/**
 * Медиана у тех же людей: кто работал и на 1 января, и сейчас. Медиана
 * всех может упасть из-за найма джунов — эта цифра показывает, что было со
 * ставками у оставшихся.
 */
export function cohortMedianChange(people: EconPerson[], from: string, to: string): { pct: number | null; n: number } {
  const a: number[] = [];
  const b: number[] = [];
  for (const p of people) {
    if (!isActiveAt(p, from) || !isActiveAt(p, to)) continue;
    const s0 = salaryAt(p, from);
    const s1 = salaryAt(p, to);
    if (!paid(p, s0) || !paid(p, s1)) continue;
    a.push(s0);
    b.push(s1);
  }
  return { pct: pctDelta(median(a), median(b)), n: a.length };
}

/** История ставок есть по N из M работающих. */
export function coverage(people: EconPerson[], d: string): { have: number; total: number } {
  const act = people.filter((p) => isActiveAt(p, d));
  return { have: act.filter((p) => !p.noHistory).length, total: act.length };
}

// ─── По уровням ───────────────────────────────────────────────────────

export const LEVEL_ORDER: EconLevel[] = [
  'junior', 'junior_plus', 'premiddle', 'middle', 'middle_plus', 'senior', 'stardiz', 'lead',
];
// Грейды — из GRADE_NAMES, плюс уровни ролей без грейда
export const LEVEL_LABEL: Record<EconLevel, string> = { ...GRADE_NAMES, stardiz: 'Стардиз', lead: 'Лид' };

export function bandOfLevel(level: EconLevel | null): SalaryBand | null {
  if (!level) return null;
  if (level === 'stardiz' || level === 'lead') return bandFor({ role: level, grade: null });
  return bandFor({ role: 'designer', grade: level });
}

export type LevelRowKey = EconLevel | 'none' | 'hourly';

export type LevelPerson = {
  p: EconPerson;
  salary: number;
  /** Ставка на 1 января; null — нанят позже. */
  jan1: number | null;
  state: BandState | null;
  planned: EconPerson['planned'];
};

export type LevelRow = {
  key: LevelRowKey;
  label: string;
  level: EconLevel | null;
  band: SalaryBand | null;
  people: LevelPerson[];
  median: number | null;
  small: boolean;
  above: number;
  below: number;
  /** ССЗП уровня: средняя стартовая ставка нанятых с 1 января (и уже ушедших). */
  hire: { count: number; avg: number } | null;
};

/** Стартовая ставка периодов, начатых в окне (from, to]. */
function hireSalaries(p: EconPerson, from: string, to: string): number[] {
  return p.stints.filter((s) => s.from > from && s.from <= to).map((s) => salaryAt(p, s.from)).filter((v) => v > 0);
}

export function levelRows(people: EconPerson[], w: EconWindow): LevelRow[] {
  const groups: Array<{ key: LevelRowKey; label: string; level: EconLevel | null; match: (p: EconPerson) => boolean }> = [
    ...LEVEL_ORDER.map((l) => ({ key: l, label: LEVEL_LABEL[l], level: l, match: (p: EconPerson) => !p.hourly && p.level === l })),
    { key: 'none', label: 'Без грейда', level: null, match: (p) => !p.hourly && p.level == null },
    { key: 'hourly', label: 'Почасовщики', level: null, match: (p) => p.hourly },
  ];
  const rows: LevelRow[] = [];
  for (const g of groups) {
    const members = people.filter(g.match);
    const band = g.key === 'hourly' ? null : bandOfLevel(g.level);
    const list: LevelPerson[] = members
      .filter((p) => isActiveAt(p, w.today))
      .map((p) => {
        const salary = salaryAt(p, w.today);
        return {
          p,
          salary,
          jan1: isActiveAt(p, w.jan1) ? salaryAt(p, w.jan1) : null,
          state: band && salary > 0 ? bandState(salary, band) : null,
          planned: p.planned,
        };
      })
      .sort((a, b) => b.salary - a.salary || a.p.name.localeCompare(b.p.name, 'ru'));
    if (!list.length) continue;
    const hired = members.flatMap((p) => hireSalaries(p, w.jan1, w.today));
    const medianSal = g.key === 'hourly' ? null : median(list.map((x) => x.salary).filter((v) => v > 0));
    rows.push({
      key: g.key,
      label: g.label,
      level: g.level,
      band,
      people: list,
      median: medianSal,
      small: list.length <= SMALL_N,
      above: list.filter((x) => x.state === 'above').length,
      below: list.filter((x) => x.state === 'below').length,
      hire: hired.length ? { count: hired.length, avg: sum(hired) / hired.length } : null,
    });
  }
  return rows;
}

/** Сколько людей с вилкой и сколько из них выше — для карточки медианы. */
export function bandSummary(rows: LevelRow[]): { banded: number; above: number } {
  const banded = rows.filter((r) => r.band).flatMap((r) => r.people.filter((x) => x.state));
  return { banded: banded.length, above: banded.filter((x) => x.state === 'above').length };
}

/** ССЗП — средняя стартовая ставка всех нанятых с 1 января. */
export function avgHireSalary(people: EconPerson[], w: EconWindow): { count: number; avg: number } | null {
  const xs = people.filter((p) => !p.hourly).flatMap((p) => hireSalaries(p, w.jan1, w.today));
  return xs.length ? { count: xs.length, avg: sum(xs) / xs.length } : null;
}

// ─── Найм и уходы за 12 месяцев ───────────────────────────────────────

export const NO_REASON_GROUP = 'none';

export type ExitRow = {
  p: EconPerson;
  date: string;
  initiator: Initiator | null;
  groupId: string;
  subId: string | null;
  /** Подпись причины: подкатегория HR, иначе причина HR, иначе тип из Грейдов. */
  reason: string | null;
  note: string | null;
};

export type ChurnGroup = {
  id: string;
  title: string;
  initiator: Initiator | null;
  exits: ExitRow[];
  subs: Array<{ id: string; title: string; count: number }>;
};

export type Churn = {
  hires: number;
  exits: number;
  /** Уходы к средней численности за те же 12 месяцев, %. */
  turnoverPct: number | null;
  byEmployee: number;
  byCompany: number;
  unknown: number;
  groups: ChurnGroup[];
};

export function churn(people: EconPerson[], reasons: ReasonGroup[], w: EconWindow, series: MonthPoint[]): Churn {
  const inWindow = (d: string) => d > w.yearAgo && d >= TRACK_SINCE && d <= w.today;
  const hires = people.reduce((n, p) => n + p.stints.filter((s) => inWindow(s.from)).length, 0);
  const groupById = new Map(reasons.map((g) => [g.id, g]));
  const subTitle = new Map(reasons.flatMap((g) => g.subs.map((s) => [s.id, s.title] as const)));

  const exits: ExitRow[] = [];
  for (const p of people) {
    const ended = p.stints.filter((s) => s.to != null && inWindow(s.to));
    const last = p.stints[p.stints.length - 1];
    for (const s of ended) {
      // Причина из HR и Грейдов относится к последнему уходу
      const info = s === last ? p.exit : null;
      const hrGroup = info?.reasonId ? groupById.get(info.reasonId) : undefined;
      const gradesInit = initiatorFromGrades(info?.gradesType ?? null);
      exits.push({
        p,
        date: s.to!,
        groupId: hrGroup ? hrGroup.id : NO_REASON_GROUP,
        subId: hrGroup && info?.subId && hrGroup.subs.some((x) => x.id === info.subId) ? info.subId : null,
        initiator: hrGroup?.initiator ?? gradesInit,
        reason: hrGroup
          ? (info?.subId && subTitle.get(info.subId)) || hrGroup.title
          : info?.gradesType
            ? DISMISSAL_TYPE_LABELS[info.gradesType]
            : null,
        note: info?.note ?? null,
      });
    }
  }
  exits.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const groups: ChurnGroup[] = reasons.map((g) => {
    const list = exits.filter((x) => x.groupId === g.id);
    const subs = g.subs.map((s) => ({ ...s, count: list.filter((x) => x.subId === s.id).length }));
    const noSub = list.filter((x) => !x.subId).length;
    if (noSub) subs.push({ id: `${g.id}:none`, title: 'Без подкатегории', count: noSub });
    return { id: g.id, title: g.title, initiator: g.initiator, exits: list, subs };
  });
  const none = exits.filter((x) => x.groupId === NO_REASON_GROUP);
  if (none.length) {
    groups.push({
      id: NO_REASON_GROUP,
      title: 'Без причины в HR',
      initiator: null,
      exits: none,
      subs: [],
    });
  }

  const last12 = series.slice(-12);
  const avg = last12.length ? sum(last12.map((m) => m.count)) / last12.length : 0;
  return {
    hires,
    exits: exits.length,
    turnoverPct: avg > 0 ? (exits.length / avg) * 100 : null,
    byEmployee: exits.filter((x) => x.initiator === 'employee').length,
    byCompany: exits.filter((x) => x.initiator === 'company').length,
    unknown: exits.filter((x) => x.initiator == null).length,
    groups,
  };
}

/** Отток компании за 12 последних месяцев (stats_monthlyemployeestats), %. */
export function companyTurnover(company: CompanyStats, today: string): number | null {
  const cur = monthKey(day(today));
  const keys = Object.keys(company.headcountByMonth)
    .filter((k) => k <= cur && company.exitsByMonth[k] != null && company.headcountByMonth[k] > 0)
    .sort();
  const last12 = keys.slice(-12);
  if (last12.length < 12) return null;
  const avg = sum(last12.map((k) => company.headcountByMonth[k])) / last12.length;
  return avg > 0 ? (sum(last12.map((k) => company.exitsByMonth[k])) / avg) * 100 : null;
}

// ─── Суммы «На руки · Для компании» ───────────────────────────────────

export type MoneyMode = 'hand' | 'company';

/** Множитель сумм: «На руки» — 1, «Для компании» — 1 + налоговая нагрузка. */
export function taxMultiplier(mode: MoneyMode, payrollTaxRate: number): number {
  return mode === 'company' ? 1 + payrollTaxRate : 1;
}

// ═══════════════════════ Форматирование ═══════════════════════

export function nf(v: number, digits = 0): string {
  return v.toLocaleString('ru-RU', { maximumFractionDigits: digits });
}

const MINUS = '−';
const signOf = (v: number) => (v > 0 ? '+' : v < 0 ? MINUS : '');

/**
 * Ставка в тысячах: «на руки» — как в HR, до десятых («104,9»); «для
 * компании» — целыми тысячами, иначе ×1,36 даёт «163,2–190,4».
 */
export function fmtRate(rub: number, k = 1): string {
  return k === 1 ? nf(rub / 1000, 1) : nf(Math.round((rub * k) / 1000));
}

/** Сумма в тысячах целыми: «3 414». */
export function fmtSumK(rub: number): string {
  return nf(Math.round(rub / 1000));
}

/** Миллионы с сотыми: «3,41». */
export function fmtMln(rub: number): string {
  return nf(rub / 1e6, 2);
}

/** «+6,9%», «−2%», «0%». */
export function fmtSignedPct(p: number, digits = 1): string {
  const r = Math.round(p * 10 ** digits) / 10 ** digits;
  return `${signOf(r)}${nf(Math.abs(r), digits)}%`;
}

/** «+0,4 п.п.» */
export function fmtPp(p: number): string {
  const r = Math.round(p * 10) / 10;
  return `${signOf(r)}${nf(Math.abs(r), 1)} п.п.`;
}

/** Доля с десятыми всегда: «11,0». */
export function fmtShare(p: number): string {
  return p.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function fmtSigned(v: number): string {
  return `${signOf(v)}${nf(Math.abs(v))}`;
}

export function fmtDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

export function fmtDay(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

export function plural(n: number, f: [string, string, string]): string {
  const a = Math.abs(n);
  const l = a % 10;
  const t = a % 100;
  if (t >= 11 && t <= 14) return f[2];
  if (l === 1) return f[0];
  if (l >= 2 && l <= 4) return f[1];
  return f[2];
}

export const PEOPLE_FORMS: [string, string, string] = ['человек', 'человека', 'человек'];

export const MONTH_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
export const MONTH_FULL = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
export const MONTH_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
