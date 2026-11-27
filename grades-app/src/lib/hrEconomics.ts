// Выборка HR-портала для «Экономики» (Phase 23.6b) — только сервер.
//
// Источник — набор HR (lib/hrDataset): живая ClickHouse-копия HR
// (`hr_portal_current`) или последний слепок. Кэш perfCache под одним ключом
// на набор email (stale-while-revalidate до 6 ч). Расчёты — в lib/economics,
// здесь только выборка из набора и приведение строк к типам.
//
// Контур задают Грейды: сотрудников и журнал ставок берём по email людей
// контура — с любой позицией в HR (лид может числиться в Backoffice).
// Позиции 9 «Design» и 20 «Lead Designer» — только для справки «работают
// в HR дизайнерами, но нет в «Команде»», с тем же контуром, что у сверки
// реестра (lib/hrRegistry): без Lite и дизайн-инженеров, без декрета.
// Справочник причин и статистика компании в живом наборе — по возможности:
// без них страница рисуется, но без причин и доли в ФОТ.
//
// Если набор недоступен, а кэш perfCache уже выдохся, страница берёт
// последнюю удачную выборку процесса (lastGood) с меткой «Данные от …».

import { loadHrDataset, type HrDataset } from './hrDataset';
import { HR_DESIGN_POSITION_IDS, isDesignContour } from './hrRegistry';
import { DEFAULT_TTL_MS, PAGE_BUDGET_MS, getOrCompute, makeEmailsCacheKey, withTimeout } from './perfCache';
import type {
  CompanyStats,
  HrEconomicsRaw,
  HrEmployeeRaw,
  HrLogRaw,
  HrReasonRaw,
  HrSubRaw,
} from './economics';

/** Дизайнерские позиции — из справочника сверки реестра: 9 и 20, без 29. */
export const DESIGN_POSITION_IDS: readonly string[] = HR_DESIGN_POSITION_IDS.map(String);
// v4: из набора HR (живой ClickHouse или слепок)
const CACHE_PREFIX = 'hr-economics:v4';

/** Последняя удачная выборка — живёт, пока жив процесс. */
let lastGood: HrEconomicsRaw | null = null;

type Cell = string | number | boolean | null | undefined;

const str = (v: Cell): string => (v == null ? '' : String(v));
const numOr0 = (v: Cell): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const flag = (v: Cell): boolean => v === true || v === 1 || v === '1' || v === 'true';
/** 1970-01-01 и пустое в HR — «даты нет». */
const date = (v: Cell): string | null => {
  const s = str(v).slice(0, 10);
  return s && s >= '2000' ? s : null;
};
/** Ссылка на справочник: пусто, 0 и нулевой UUID — «не заполнено». */
const id = (v: Cell): string | null => {
  const s = str(v).trim();
  return s && s !== '\\N' && !/^[0-]+$/.test(s) ? s : null;
};

export function toEmployee(r: Record<string, Cell>): HrEmployeeRaw {
  return {
    id: str(r.id),
    email: str(r.em).trim().toLowerCase(),
    firstName: str(r.fn).trim(),
    lastName: str(r.ln).trim(),
    positionId: str(r.pos),
    department: str(r.dept),
    hiredAt: date(r.hired),
    dismissedAt: date(r.dismissed),
    archived: flag(r.arch),
    salary: numOr0(r.salary),
    reasonId: id(r.reason),
    subId: id(r.sub),
  };
}

export function toLog(r: Record<string, Cell>): HrLogRaw {
  return { employeeId: str(r.id), date: str(r.d).slice(0, 10), from: numOr0(r.f), to: numOr0(r.t) };
}

export function toReason(r: Record<string, Cell>): HrReasonRaw {
  const v = r.initiator;
  // В наборе все колонки — строки: Bool приходит как 'true'/'false'
  const initiator =
    v === true || v === 'true' ? 1 : v === false || v === 'false' ? 0 : v == null || v === '' ? null : Number(v);
  return {
    id: str(r.id),
    initiator: initiator === 0 || initiator === 1 ? initiator : null,
    title: str(r.title),
  };
}

export function toSub(r: Record<string, Cell>): HrSubRaw {
  return { id: str(r.id), reasonId: str(r.rid), title: str(r.title) };
}

/**
 * Помесячная статистика компании. Колонки stats_monthlyemployeestats
 * берём по смыслу имени (dismissed / active / all): точные названия в HR
 * менялись, а запрос «SELECT *» переживает переименование.
 */
export function toCompany(
  wage: Array<Record<string, Cell>>,
  monthly: Array<Record<string, Cell>>,
): CompanyStats {
  const fotByMonth: Record<string, number> = {};
  for (const r of wage) {
    const m = str(r.m).slice(0, 7);
    const v = numOr0(r.v);
    if (m && v > 0) fotByMonth[m] = v;
  }
  const headcountByMonth: Record<string, number> = {};
  const exitsByMonth: Record<string, number> = {};
  const cols = monthly.length ? Object.keys(monthly[0]) : [];
  const pick = (re: RegExp) => cols.find((c) => re.test(c));
  const dateCol = pick(/^date$/i) ?? pick(/date|month/i);
  const exitsCol = pick(/dismiss/i);
  const activeCol = pick(/active/i) ?? pick(/^all|total/i);
  if (dateCol && exitsCol && activeCol) {
    for (const r of monthly) {
      const m = str(r[dateCol]).slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(m)) continue;
      headcountByMonth[m] = numOr0(r[activeCol]);
      exitsByMonth[m] = numOr0(r[exitsCol]);
    }
  }
  return { fotByMonth, headcountByMonth, exitsByMonth };
}

/** Литерал Array(String) для ClickHouse: ['a','b'] — общий с SQL набора. */
export { arrayParam } from './hrDatasetQueries';

/**
 * Email работающих в HR в контуре дизайна: позиция 9 или 20, не отдел Lite
 * (isDesignContour), не в декрете, не архив и без даты увольнения.
 */
export function toDesignWorking(rows: Array<Record<string, Cell>>): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    const em = str(r.em).trim().toLowerCase();
    if (!em || date(r.dismissed) || flag(r.arch) || flag(r.mat)) continue;
    if (isDesignContour({ positionId: r.pos, department: r.dept })) out.add(em);
  }
  return Array.from(out);
}

/**
 * Выборка «Экономики» из набора по email людей контура — то же, что раньше
 * давали семь SQL-запросов: учётки контура (с любой позицией) и их журнал,
 * справка по позициям 9 и 20, справочники причин, статистика компании.
 */
export function economicsFromDataset(ds: HrDataset, emails: string[]): HrEconomicsRaw {
  const contour = new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  const emps = ds.employees.filter((e) => contour.has(e.email.trim().toLowerCase()));
  const ids = new Set(emps.map((e) => e.id));
  return {
    employees: emps.map((e) =>
      toEmployee({
        id: e.id,
        em: e.email,
        fn: e.firstNameRu,
        ln: e.lastNameRu,
        pos: e.positionId,
        dept: e.department,
        hired: e.hiredAt,
        dismissed: e.dismissedAt,
        arch: e.isArchive,
        salary: e.salary,
        reason: e.reasonId,
        sub: e.subId,
      }),
    ),
    // Справка — по всем учёткам набора: контур (позиции 9, 20, не Lite)
    // проверяет toDesignWorking
    designWorkingEmails: toDesignWorking(
      ds.employees
        .filter((e) => DESIGN_POSITION_IDS.includes(e.positionId.trim()))
        .map((e) => ({
          em: e.email,
          pos: e.positionId,
          dept: e.department,
          dismissed: e.dismissedAt,
          arch: e.isArchive,
          mat: e.maternityLeave,
        })),
    ),
    logs: ds.salaryLog
      .filter((l) => ids.has(l.employeeId))
      .map((l) => toLog({ id: l.employeeId, d: l.date, f: l.salaryFrom, t: l.salaryTo })),
    reasons: ds.reasons.map((r) => toReason({ id: r.id, initiator: r.initiator, title: r.title })),
    subs: ds.subs.map((x) => toSub({ id: x.id, rid: x.reasonId, title: x.title })),
    company: toCompany(
      ds.wageFundByMonth.map((w) => ({ m: w.month, v: w.wageFund })),
      ds.monthlyStats,
    ),
    fetchedAt: ds.takenAt,
    source: ds.source,
  };
}

/**
 * Вся выборка «Экономики» одним заходом по email людей контура. Кэш 15 минут
 * на набор email (порядок не важен).
 */
export async function fetchHrEconomics(emails: string[]): Promise<HrEconomicsRaw> {
  const unique = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  return getOrCompute(
    makeEmailsCacheKey(CACHE_PREFIX, unique),
    async () => {
      const raw = economicsFromDataset(await loadHrDataset(unique), unique);
      lastGood = raw;
      return raw;
    },
    DEFAULT_TTL_MS,
  );
}

export type HrEconomicsLoad = {
  raw: HrEconomicsRaw | null;
  /** HR сейчас не ответил — показываем последнюю удачную выборку. */
  stale: boolean;
  error: string | null;
};

/**
 * Для страницы: ждём не дольше бюджета. Не успели или набор недоступен — отдаём
 * последнюю удачную выборку процесса, если она есть (набор email мог с тех
 * пор измениться: новые люди тогда временно «нет в HR»); запрос, не
 * уложившийся в бюджет, дорабатывает в фоне и кладёт результат в кэш.
 */
export async function loadHrEconomics(
  emails: string[],
  budgetMs: number = PAGE_BUDGET_MS,
): Promise<HrEconomicsLoad> {
  try {
    const raw = await withTimeout(fetchHrEconomics(emails), budgetMs, 'HR economics');
    return { raw, stale: false, error: null };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[hrEconomics] load failed:', error);
    return { raw: lastGood, stale: lastGood != null, error };
  }
}

/** Только для тестов. */
export function resetHrEconomicsForTests(): void {
  lastGood = null;
}
