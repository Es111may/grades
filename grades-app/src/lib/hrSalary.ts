// Ставки и журнал изменений из HR-портала (Phase 23.4) — только сервер.
//
// Источник — набор HR (lib/hrDataset): живой ClickHouse-копии HR-портала
// (`hr_portal_current`) или последний слепок. Суммы берём из журнала
// `salary_changesalarylog`: в старых запросах на повышение они пустые.
// Логика расчёта — в lib/compensation.ts, здесь только выборка из набора —
// та же, что раньше делали SQL-запросы.

import { loadHrDataset, type HrDataset, type HrRow } from './hrDataset';
import { getOrCompute, makeEmailsCacheKey, setCached, DEFAULT_TTL_MS } from './perfCache';
import type { HrEmployee, HrLogRow } from './compensation';

type EmpRow = { id: string; salary: number | string; hired: string; dismissed: string; arch: number | string };
type LogRow = { d: string; f: number | string; t: number | string };

const EMPTY_DATE = (s: string | null | undefined) => !s || s < '2000';
const toLog = (r: LogRow): HrLogRow => ({ date: r.d, from: Number(r.f), to: Number(r.t) });

/**
 * Одна живая учётка на человека. В HR бывают дубли — например, учётку
 * пересоздали со сменой email, а старую отправили в архив. Берём живую;
 * если живых нет — самую позднюю по дате найма.
 */
function pickEmployee(rows: EmpRow[]): EmpRow | null {
  if (!rows.length) return null;
  const live = rows.filter((r) => Number(r.arch) === 0 && EMPTY_DATE(r.dismissed));
  const pool = live.length ? live : rows;
  return [...pool].sort((a, b) => (a.hired < b.hired ? 1 : -1))[0];
}

export type HrCompensation = { hr: HrEmployee | null; log: HrLogRow[] };

/** Ключ кэша одного человека — общий для fetchHrCompensation и батча. */
const compKey = (email: string) => `hr-comp:${email.trim().toLowerCase()}`;
const emailKey = (email: string) => email.trim().toLowerCase();

// ── Набор → строки в прежнем виде ───────────────────────────────────────

/** Флаг набора — строка: '1'/'0' (UInt8) или 'true'/'false' (Bool). */
const isSet = (v: string) => v === '1' || v === 'true';

type Index = {
  /** Учётки по email (нижний регистр), с дублями. */
  byEmail: Map<string, EmpRow[]>;
  /** Учётка по id. */
  byId: Map<string, EmpRow>;
  /** Журнал по id учётки — в порядке набора (по моменту пересмотра). */
  logById: Map<string, LogRow[]>;
};

const indexes = new WeakMap<HrDataset, Index>();

const toEmpRow = (e: HrRow<'employees'>): EmpRow => ({
  id: e.id,
  salary: e.salary,
  hired: e.hiredAt,
  dismissed: e.dismissedAt,
  arch: isSet(e.isArchive) ? 1 : 0,
});

/** Индекс набора — один на набор: набор в кэше один и тот же объект. */
function indexOf(ds: HrDataset): Index {
  const hit = indexes.get(ds);
  if (hit) return hit;
  const byEmail = new Map<string, EmpRow[]>();
  const byId = new Map<string, EmpRow>();
  for (const e of ds.employees) {
    const row = toEmpRow(e);
    const em = emailKey(e.email);
    if (em) byEmail.set(em, [...(byEmail.get(em) ?? []), row]);
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  const logById = new Map<string, LogRow[]>();
  for (const l of ds.salaryLog) {
    logById.set(l.employeeId, [...(logById.get(l.employeeId) ?? []), { d: l.date, f: l.salaryFrom, t: l.salaryTo }]);
  }
  const ix = { byEmail, byId, logById };
  indexes.set(ds, ix);
  return ix;
}

/** Ставка и журнал одной живой учётки — как в одиночном запросе. */
function compensationOf(ix: Index, email: string): HrCompensation {
  const e = pickEmployee(ix.byEmail.get(emailKey(email)) ?? []);
  if (!e) return { hr: null, log: [] };
  return {
    hr: {
      salary: Number(e.salary),
      hiredAt: EMPTY_DATE(e.hired) ? null : e.hired,
      dismissedAt: EMPTY_DATE(e.dismissed) ? null : e.dismissed,
    },
    log: (ix.logById.get(e.id) ?? []).map(toLog),
  };
}

// ── Выборки ─────────────────────────────────────────────────────────────

/** Ставка и журнал одного человека по рабочему email. Кэш 15 минут. */
export async function fetchHrCompensation(email: string): Promise<HrCompensation> {
  return getOrCompute(
    compKey(email),
    async () => compensationOf(indexOf(await loadHrDataset([email])), email),
    DEFAULT_TTL_MS,
  );
}

/**
 * Журналы сразу по нескольким людям — чтобы в списке понять, выполнен ли
 * плановый пересмотр. Запрашиваем только тех, у кого статус стоит.
 * Журнал — всех учёток с этим email (и архивных), по дате; дата найма — у
 * учётки первой записи журнала. Нет записей журнала — человека нет в ответе.
 */
export async function fetchHrLogsByEmail(
  emails: string[],
): Promise<Map<string, { hiredAt: string | null; log: HrLogRow[] }>> {
  const unique = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  const out = new Map<string, { hiredAt: string | null; log: HrLogRow[] }>();
  if (!unique.length) return out;
  const rows = await getOrCompute(
    makeEmailsCacheKey('hr-logs', unique),
    async () => {
      const ds = await loadHrDataset(unique);
      const ix = indexOf(ds);
      const emailById = new Map<string, string>();
      for (const em of unique) for (const e of ix.byEmail.get(em) ?? []) emailById.set(e.id, em);
      // Порядок — набора, то есть по моменту пересмотра, как ORDER BY date_start
      const picked: Array<{ em: string; hired: string } & LogRow> = [];
      for (const l of ds.salaryLog) {
        const em = emailById.get(l.employeeId);
        if (em) picked.push({ em, hired: ix.byId.get(l.employeeId)!.hired, d: l.date, f: l.salaryFrom, t: l.salaryTo });
      }
      return picked;
    },
    DEFAULT_TTL_MS,
  );
  for (const r of rows) {
    const cur = out.get(r.em) ?? { hiredAt: EMPTY_DATE(r.hired) ? null : r.hired, log: [] };
    cur.log.push(toLog(r));
    out.set(r.em, cur);
  }
  return out;
}

/**
 * Ставки и журналы сразу по многим людям — для колонки «Зарплата» в таблице
 * у админа. Один заход в набор на всю страницу, кэш 15 минут. Текущую ставку
 * считает тот же buildCompensation, что и поп-ап, — цифры в таблице и в
 * карточке не могут разойтись.
 *
 * Результат заодно раскладываем по ключам fetchHrCompensation: поп-ап,
 * открытый после списка, берёт ставку из кэша. Выборка та же — одна живая
 * учётка через pickEmployee и её журнал, для email без учётки —
 * `{ hr: null, log: [] }`, как и в одиночном запросе.
 */
export async function fetchHrCompensationBatch(
  emails: string[],
): Promise<Map<string, HrCompensation>> {
  const unique = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  const out = new Map<string, HrCompensation>();
  if (!unique.length) return out;
  return getOrCompute(
    makeEmailsCacheKey('hr-comp-batch', unique),
    async () => {
      const ix = indexOf(await loadHrDataset(unique));
      const result = new Map<string, HrCompensation>();
      for (const em of unique) result.set(em, compensationOf(ix, em));
      for (const [em, c] of result) setCached(compKey(em), c, DEFAULT_TTL_MS);
      return result;
    },
    DEFAULT_TTL_MS,
  );
}
