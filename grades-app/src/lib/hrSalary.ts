// Ставки и журнал изменений из HR-портала (Phase 23.4) — только сервер.
//
// Источник — ClickHouse-копия HR-портала (`hr_portal_current`), та же, что у
// перформанса. Суммы берём из журнала `salary_changesalarylog`: в старых
// запросах на повышение они пустые. Логика расчёта — в lib/compensation.ts,
// здесь только выборка.

import { chQuery } from './clickhouse';
import { getOrCompute, makeEmailsCacheKey, DEFAULT_TTL_MS } from './perfCache';
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

/** Ставка и журнал одного человека по рабочему email. Кэш 15 минут. */
export async function fetchHrCompensation(email: string): Promise<HrCompensation> {
  const key = `hr-comp:${email.trim().toLowerCase()}`;
  return getOrCompute(
    key,
    async () => {
      const emps = await chQuery<EmpRow>(
        `SELECT toString(id) AS id, salary,
                toString(toDate(date_of_employee)) AS hired,
                toString(toDate(date_of_dismissal)) AS dismissed,
                is_archive AS arch
           FROM hr_portal_current.employee_employee
          WHERE lowerUTF8(email) = lowerUTF8({email:String})`,
        { email },
      );
      const e = pickEmployee(emps);
      if (!e) return { hr: null, log: [] };
      const log = await chQuery<LogRow>(
        `SELECT toString(toDate(date_start)) AS d, salary_start AS f, salary AS t
           FROM hr_portal_current.salary_changesalarylog
          WHERE employee_id = toUUID({id:String})
          ORDER BY date_start`,
        { id: e.id },
      );
      return {
        hr: {
          salary: Number(e.salary),
          hiredAt: EMPTY_DATE(e.hired) ? null : e.hired,
          dismissedAt: EMPTY_DATE(e.dismissed) ? null : e.dismissed,
        },
        log: log.map(toLog),
      };
    },
    DEFAULT_TTL_MS,
  );
}

/** Литерал Array(String) для параметра ClickHouse: ['a','b']. */
function arrayParam(values: string[]): string {
  return `[${values.map((v) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`).join(',')}]`;
}

/**
 * Журналы сразу по нескольким людям — чтобы в списке понять, выполнен ли
 * плановый пересмотр. Запрашиваем только тех, у кого статус стоит.
 */
export async function fetchHrLogsByEmail(
  emails: string[],
): Promise<Map<string, { hiredAt: string | null; log: HrLogRow[] }>> {
  const unique = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  const out = new Map<string, { hiredAt: string | null; log: HrLogRow[] }>();
  if (!unique.length) return out;
  const rows = await getOrCompute(
    makeEmailsCacheKey('hr-logs', unique),
    () =>
      chQuery<{ em: string; hired: string; d: string; f: number | string; t: number | string }>(
        `SELECT lowerUTF8(e.email) AS em, toString(toDate(e.date_of_employee)) AS hired,
                toString(toDate(l.date_start)) AS d, l.salary_start AS f, l.salary AS t
           FROM hr_portal_current.salary_changesalarylog AS l
           INNER JOIN hr_portal_current.employee_employee AS e ON e.id = l.employee_id
          WHERE lowerUTF8(e.email) IN {emails:Array(String)}
          ORDER BY l.date_start`,
        { emails: arrayParam(unique) },
      ),
    DEFAULT_TTL_MS,
  );
  for (const r of rows) {
    const cur = out.get(r.em) ?? { hiredAt: EMPTY_DATE(r.hired) ? null : r.hired, log: [] };
    cur.log.push(toLog(r));
    out.set(r.em, cur);
  }
  return out;
}
