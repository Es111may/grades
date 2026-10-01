import { beforeEach, describe, expect, it, vi } from 'vitest';

// Подменяем HTTP-клиент ClickHouse: ответ выбираем по таблице в SQL.
const chQuery = vi.fn();
vi.mock('../clickhouse', () => ({ chQuery: (...args: unknown[]) => chQuery(...args) }));

import {
  arrayParam,
  fetchHrEconomics,
  loadHrEconomics,
  resetHrEconomicsForTests,
  toCompany,
  toDesignWorking,
  toEmployee,
  toReason,
} from '../hrEconomics';
import { clearCache } from '../perfCache';
import { buildEconomicsDataset, type GradesOverlay, type HrEconomicsRaw } from '../economics';

// Выдуманные строки в том виде, в каком их отдаёт ClickHouse (FORMAT JSON):
// 64-битные числа — строками, «нет даты» — 1970-01-01.
const EMPLOYEES = [
  {
    id: 'e-1', em: 'Anna@Ida.test', fn: 'Анна ', ln: 'Пример', pos: '9', dept: 'improve',
    hired: '2024-03-01', dismissed: '1970-01-01', arch: 0, salary: '110000',
    reason: null, sub: '0',
  },
  {
    id: 'e-2', em: 'oleg@ida.test', fn: 'Олег', ln: 'Тест', pos: '20', dept: '',
    hired: '2020-01-10', dismissed: '2026-05-15', arch: 1, salary: 150000,
    reason: '3', sub: '00000000-0000-0000-0000-000000000000',
  },
];
const LOGS = [{ id: 'e-1', d: '2026-04-01', f: '100000', t: '110000' }];
const REASONS = [
  { id: '1', initiator: true, title: 'Условия труда' },
  { id: '3', initiator: '0', title: 'Оптимизация' },
];
const SUBS = [{ id: 's1', rid: '1', title: 'Выгорание' }];
// Дизайнерские позиции: двое работают; уволенный, архивный дубль, Lite
// и декрет — не в справке
const DESIGN = [
  { em: 'anna@ida.test', pos: '9', dept: 'improve', dismissed: '1970-01-01', arch: 0, mat: 0 },
  { em: 'lead@ida.test', pos: '20', dept: 'design.inhouse', dismissed: '1970-01-01', arch: false, mat: '0' },
  { em: 'lite@ida.test', pos: '9', dept: 'Lite', dismissed: '1970-01-01', arch: 0, mat: 0 },
  { em: 'mat@ida.test', pos: '9', dept: 'create', dismissed: '1970-01-01', arch: 0, mat: 1 },
  { em: 'gone@ida.test', pos: '9', dept: 'create', dismissed: '2025-04-01', arch: 1, mat: 0 },
  { em: 'dup@ida.test', pos: '9', dept: 'create', dismissed: '1970-01-01', arch: 1, mat: 0 },
];
const EMAILS = ['Anna@ida.test', 'oleg@ida.test'];

// Какой из запросов пришёл — по характерному куску SQL
const isEmployees = (sql: string) => sql.includes('e.first_name_ru');
const isDesign = (sql: string) => sql.includes("IN ('9', '20')") && !sql.includes('salary_changesalarylog');
const WAGE = [
  { m: '2026-08-01', v: '31000000' },
  { m: '2026-09-01', v: 32000000 },
];
const MONTHLY = [
  { id: '1', date: '2026-08-01', all_employees: '620', active_employees: '510', new_employees: '9', dismissed_employees: '7' },
  { id: '2', date: '2026-09-01', all_employees: '625', active_employees: '512', new_employees: '6', dismissed_employees: '4' },
];

function answer(sql: string) {
  if (sql.includes('salary_changesalarylog')) return LOGS;
  if (sql.includes('employee_dismissalreasonsubcategory')) return SUBS;
  if (sql.includes('employee_dismissalreason')) return REASONS;
  if (sql.includes('stats_wagefundstats')) return WAGE;
  if (sql.includes('stats_monthlyemployeestats')) return MONTHLY;
  if (isDesign(sql)) return DESIGN;
  if (isEmployees(sql)) return EMPLOYEES;
  throw new Error('unexpected SQL');
}

beforeEach(() => {
  // Ошибки HR в тестах ожидаемы — не шумим в выводе
  vi.spyOn(console, 'error').mockImplementation(() => {});
  clearCache();
  resetHrEconomicsForTests();
  chQuery.mockReset();
  chQuery.mockImplementation(async (sql: string) => answer(sql));
});

describe('fetchHrEconomics', () => {
  it('семь запросов параллельно, строки приведены к типам', async () => {
    const raw = await fetchHrEconomics(EMAILS);
    expect(chQuery).toHaveBeenCalledTimes(7);
    expect(raw.designWorkingEmails.sort()).toEqual(['anna@ida.test', 'lead@ida.test']);
    expect(raw.employees).toEqual([
      {
        id: 'e-1', email: 'anna@ida.test', firstName: 'Анна', lastName: 'Пример', positionId: '9', department: 'improve',
        hiredAt: '2024-03-01', dismissedAt: null, archived: false, salary: 110000,
        reasonId: null, subId: null,
      },
      {
        id: 'e-2', email: 'oleg@ida.test', firstName: 'Олег', lastName: 'Тест', positionId: '20', department: '',
        hiredAt: '2020-01-10', dismissedAt: '2026-05-15', archived: true, salary: 150000,
        reasonId: '3', subId: null,
      },
    ]);
    expect(raw.logs).toEqual([{ employeeId: 'e-1', date: '2026-04-01', from: 100000, to: 110000 }]);
    expect(raw.reasons).toEqual([
      { id: '1', initiator: 1, title: 'Условия труда' },
      { id: '3', initiator: 0, title: 'Оптимизация' },
    ]);
    expect(raw.subs).toEqual([{ id: 's1', reasonId: '1', title: 'Выгорание' }]);
    expect(raw.company).toEqual({
      fotByMonth: { '2026-08': 31000000, '2026-09': 32000000 },
      headcountByMonth: { '2026-08': 510, '2026-09': 512 },
      exitsByMonth: { '2026-08': 7, '2026-09': 4 },
    });
    expect(typeof raw.fetchedAt).toBe('string');
  });

  it('сотрудники и журнал — по email контура с любой позицией; позиции 9, 20 — только для справки', async () => {
    await fetchHrEconomics(EMAILS);
    const calls = chQuery.mock.calls.map((c) => ({ sql: String(c[0]), params: c[1] as Record<string, string> | undefined }));
    const emp = calls.find((c) => isEmployees(c.sql))!;
    const log = calls.find((c) => c.sql.includes('salary_changesalarylog'))!;
    const design = calls.find((c) => isDesign(c.sql))!;
    for (const c of [emp, log]) {
      expect(c.sql).toContain('IN {emails:Array(String)}');
      expect(c.sql).not.toContain("IN ('9', '20')");
      expect(c.params).toEqual({ emails: "['anna@ida.test','oleg@ida.test']" });
    }
    // Справка: без 29 «Дизайн-инженер», с отделом (Lite) и декретом
    expect(design.sql).toContain("IN ('9', '20')");
    expect(design.sql).not.toContain("'29'");
    expect(design.sql).toContain('employee_department');
    expect(design.sql).toContain('maternity_leave');
  });

  it('справка не прошла (например, нет справочника отделов) — справки нет, страница живёт', async () => {
    chQuery.mockImplementation(async (sql: string) => {
      if (isDesign(sql)) throw new Error('ClickHouse 404: Unknown identifier: t.department_id');
      return answer(sql);
    });
    const raw = await fetchHrEconomics(EMAILS);
    expect(raw.employees).toHaveLength(2);
    expect(raw.designWorkingEmails).toEqual([]);
  });

  it('второй заход с тем же набором email (в другом порядке) — из кэша', async () => {
    const a = await fetchHrEconomics(EMAILS);
    const b = await fetchHrEconomics(['OLEG@ida.test', 'anna@ida.test']);
    expect(chQuery).toHaveBeenCalledTimes(7);
    expect(b).toBe(a);
    await fetchHrEconomics(['new@ida.test']);
    expect(chQuery).toHaveBeenCalledTimes(14);
  });

  it('пустой контур — без запросов сотрудников и журнала', async () => {
    const raw = await fetchHrEconomics([]);
    expect(raw.employees).toEqual([]);
    expect(raw.logs).toEqual([]);
    expect(chQuery).toHaveBeenCalledTimes(5);
  });

  it('справочник причин и статистика компании — по возможности', async () => {
    chQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('dismissalreason') || sql.includes('stats_')) throw new Error('ClickHouse 500');
      return answer(sql);
    });
    const raw = await fetchHrEconomics(EMAILS);
    expect(raw.employees).toHaveLength(2);
    expect(raw.reasons).toEqual([]);
    expect(raw.designWorkingEmails).toEqual(['anna@ida.test', 'lead@ida.test']);
    expect(raw.company).toEqual({ fotByMonth: {}, headcountByMonth: {}, exitsByMonth: {} });
  });

  it('нет справочника отделов — повтор без него', async () => {
    let first = true;
    chQuery.mockImplementation(async (sql: string) => {
      if (isEmployees(sql) && sql.includes('employee_department') && first) {
        first = false;
        throw new Error('ClickHouse 404: Code: 47. DB::Exception: Unknown identifier: t.department_id');
      }
      return answer(sql);
    });
    const raw = await fetchHrEconomics(EMAILS);
    expect(raw.employees).toHaveLength(2);
    const retried = chQuery.mock.calls.map((c) => String(c[0])).filter((s) => isEmployees(s) && !s.includes('employee_department'));
    expect(retried).toHaveLength(1);
  });

  it('другая ошибка сотрудников — без повтора, вся выборка падает', async () => {
    chQuery.mockImplementation(async (sql: string) => {
      if (isEmployees(sql)) throw new Error('ClickHouse 503');
      return answer(sql);
    });
    await expect(fetchHrEconomics(EMAILS)).rejects.toThrow('ClickHouse 503');
  });
});

describe('loadHrEconomics', () => {
  it('HR лежит и данных ещё не было — пусто и ошибка', async () => {
    chQuery.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const r = await loadHrEconomics(EMAILS);
    expect(r).toMatchObject({ raw: null, stale: false });
    expect(r.error).toContain('ECONNREFUSED');
  });

  it('HR упал после удачной выборки — последняя удачная с пометкой', async () => {
    const ok = await loadHrEconomics(EMAILS);
    expect(ok.stale).toBe(false);
    clearCache();
    chQuery.mockRejectedValue(new Error('timeout'));
    const r = await loadHrEconomics(EMAILS);
    expect(r.stale).toBe(true);
    expect(r.raw).toBe(ok.raw);
  });

  it('не уложились в бюджет — не ждём', async () => {
    chQuery.mockImplementation(() => new Promise(() => {}));
    const t0 = Date.now();
    const r = await loadHrEconomics(EMAILS, 30);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(r.raw).toBeNull();
    expect(r.error).toContain('не уложились');
  });
});

describe('приведение строк', () => {
  it('initiator: true/false, 1/0, строки; мусор — null', () => {
    expect(toReason({ id: 'a', initiator: false, title: 'x' }).initiator).toBe(0);
    expect(toReason({ id: 'a', initiator: '1', title: 'x' }).initiator).toBe(1);
    expect(toReason({ id: 'a', initiator: 2, title: 'x' }).initiator).toBeNull();
    expect(toReason({ id: 'a', initiator: null, title: 'x' }).initiator).toBeNull();
  });

  it('работающие в контуре дизайна: без даты увольнения, не архив, не Lite, не декрет, без повторов', () => {
    const extra = [
      { em: 'Anna@Ida.test', pos: '9', dept: 'improve', dismissed: null, arch: 0 },
      { em: '', pos: '9', arch: 0 },
      // 29 «Дизайн-инженер» — не дизайн, даже если просочится мимо SQL
      { em: 'eng@ida.test', pos: '29', dept: 'create', dismissed: '1970-01-01', arch: 0, mat: 0 },
      { em: 'lite2@ida.test', pos: '20', dept: ' LITE ', dismissed: '1970-01-01', arch: 0 },
      { em: 'mat2@ida.test', pos: '20', dept: 'create', dismissed: '1970-01-01', arch: 0, mat: true },
    ];
    expect(toDesignWorking([...DESIGN, ...extra]).sort()).toEqual(['anna@ida.test', 'lead@ida.test']);
  });

  it('справка «нет в «Команде»»: Lite, дизайн-инженер, декрет не в счёт; добавили дизайнера — 0', () => {
    const rows = [
      { em: 'team@ida.test', pos: '9', dept: 'create', dismissed: '1970-01-01', arch: 0, mat: 0 },
      { em: 'inhouse.new@ida.test', pos: '9', dept: 'design.inhouse', dismissed: '1970-01-01', arch: 0, mat: 0 },
      { em: 'lite@ida.test', pos: '9', dept: 'Lite', dismissed: '1970-01-01', arch: 0, mat: 0 },
      { em: 'eng@ida.test', pos: '29', dept: 'create', dismissed: '1970-01-01', arch: 0, mat: 0 },
      { em: 'mat@ida.test', pos: '9', dept: 'improve', dismissed: '1970-01-01', arch: 0, mat: 1 },
      { em: 'gone@ida.test', pos: '9', dept: 'create', dismissed: '2026-02-01', arch: 0, mat: 0 },
    ];
    const raw: HrEconomicsRaw = {
      employees: [],
      designWorkingEmails: toDesignWorking(rows),
      logs: [],
      reasons: [],
      subs: [],
      company: { fotByMonth: {}, headcountByMonth: {}, exitsByMonth: {} },
      fetchedAt: '2026-10-01T06:40:00.000Z',
    };
    const card = (email: string): GradesOverlay => ({
      email, fullName: 'Тест Тестов', role: 'designer', department: 'Инхаус', buildCode: null,
      employmentType: 'staff', active: true, hiredAt: '2024-03-01', dismissedAt: null, grade: null,
      avatarUrl: null, dismissalType: null, dismissalReason: null, plannedRaise: null,
    });
    const note = (grades: GradesOverlay[]) =>
      buildEconomicsDataset({ raw, grades, today: '2026-10-01' }).notes.hrOnlyDesign;
    expect(note([card('team@ida.test')])).toBe(1);
    expect(note([card('team@ida.test'), card('inhouse.new@ida.test')])).toBe(0);
  });

  it('arrayParam экранирует кавычки и обратный слеш', () => {
    expect(arrayParam(["o'neil@ida.test", 'a\\b'])).toBe("['o\\'neil@ida.test','a\\\\b']");
  });

  it('пустой email и даты до 2000 года', () => {
    const e = toEmployee({ id: 'x', em: null, hired: '1970-01-01', dismissed: null, salary: 'abc' });
    expect(e).toMatchObject({ email: '', hiredAt: null, dismissedAt: null, salary: 0, reasonId: null });
  });

  it('статистика компании без понятных колонок — пусто, а не мусор', () => {
    expect(toCompany([], [{ foo: '1', bar: '2' }])).toEqual({ fotByMonth: {}, headcountByMonth: {}, exitsByMonth: {} });
    // Колонка численности называется all_* — берём её, если active_* нет
    expect(toCompany([], [{ date: '2026-09-01', all_count: '600', dismissed_count: '5' }]).headcountByMonth).toEqual({ '2026-09': 600 });
  });
});
