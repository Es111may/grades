import { beforeEach, describe, expect, it, vi } from 'vitest';

// Подменяем набор HR (lib/hrDataset): живой ClickHouse или слепок — здесь всё равно.
const loadHrDataset = vi.fn();
vi.mock('../hrDataset', () => ({ loadHrDataset: (...args: unknown[]) => loadHrDataset(...args) }));

import {
  arrayParam,
  economicsFromDataset,
  fetchHrEconomics,
  loadHrEconomics,
  resetHrEconomicsForTests,
  toCompany,
  toDesignWorking,
  toEmployee,
  toReason,
} from '../hrEconomics';
import type { HrDataset } from '../hrDataset';
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

const WAGE = [
  { m: '2026-08-01', v: '31000000' },
  { m: '2026-09-01', v: 32000000 },
];
const MONTHLY = [
  { id: '1', date: '2026-08-01', all_employees: '620', active_employees: '510', new_employees: '9', dismissed_employees: '7' },
  { id: '2', date: '2026-09-01', all_employees: '625', active_employees: '512', new_employees: '6', dismissed_employees: '4' },
];

/**
 * Те же строки — в виде набора HR: все значения строками, как их отдаёт SQL
 * набора (toString), Bool — 'true'/'false'. Учётки контура и справка по
 * позициям 9, 20 — в одной таблице, как в наборе.
 */
const s = (v: unknown) => (v == null ? '' : String(v));
const DATASET: HrDataset = {
  employees: [
    ...EMPLOYEES.map((e) => ({
      id: e.id,
      email: e.em,
      firstNameRu: e.fn,
      lastNameRu: e.ln,
      firstName: '',
      lastName: '',
      positionId: e.pos,
      department: e.dept,
      hiredAt: e.hired,
      dismissedAt: e.dismissed,
      isArchive: s(e.arch),
      isHourly: '0',
      maternityLeave: '0',
      salary: s(e.salary),
      reasonId: s(e.reason),
      subId: s(e.sub),
    })),
    ...DESIGN.filter((d) => d.em !== 'anna@ida.test').map((d, i) => ({
      id: `d-${i}`,
      email: d.em,
      firstNameRu: 'Тест',
      lastNameRu: 'Тестов',
      firstName: '',
      lastName: '',
      positionId: d.pos,
      department: d.dept,
      hiredAt: '2023-01-01',
      dismissedAt: d.dismissed,
      isArchive: s(d.arch),
      isHourly: '0',
      maternityLeave: s(d.mat),
      salary: '100000',
      reasonId: '',
      subId: '',
    })),
  ],
  salaryLog: [
    ...LOGS.map((l) => ({ employeeId: l.id, date: l.d, salaryFrom: l.f, salaryTo: l.t })),
    // Журнал учётки вне контура — в «Экономику» не попадает
    { employeeId: 'd-0', date: '2025-01-01', salaryFrom: '0', salaryTo: '100000' },
  ],
  reasons: REASONS.map((r) => ({ id: r.id, initiator: s(r.initiator), title: r.title })),
  subs: SUBS.map((x) => ({ id: x.id, reasonId: x.rid, title: x.title })),
  wageFundByMonth: WAGE.map((w) => ({ month: w.m, wageFund: s(w.v) })),
  monthlyStats: MONTHLY.map((m) => ({
    id: m.id,
    date: m.date,
    new_employees_cnt: m.new_employees,
    dismissed_employees_cnt: m.dismissed_employees,
    active_employees_cnt: m.active_employees,
    all_employees_cnt: m.all_employees,
  })),
  source: 'snapshot',
  takenAt: '2026-11-27T07:00:00.000Z',
};

beforeEach(() => {
  // Ошибки HR в тестах ожидаемы — не шумим в выводе
  vi.spyOn(console, 'error').mockImplementation(() => {});
  clearCache();
  resetHrEconomicsForTests();
  loadHrDataset.mockReset();
  loadHrDataset.mockResolvedValue(DATASET);
});

describe('fetchHrEconomics', () => {
  it('один заход в набор, строки приведены к типам — как раньше из семи запросов', async () => {
    const raw = await fetchHrEconomics(EMAILS);
    expect(loadHrDataset).toHaveBeenCalledTimes(1);
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
    // Дата данных — дата набора (у слепка — дата слепка), источник — для подписи на странице
    expect(raw.fetchedAt).toBe('2026-11-27T07:00:00.000Z');
    expect(raw.source).toBe('snapshot');
  });

  it('сотрудники и журнал — по email контура с любой позицией; позиции 9, 20 — только для справки', async () => {
    const raw = await fetchHrEconomics(EMAILS);
    // Учётки дизайнерских позиций не из контура — не в сотрудниках и не в журнале
    expect(raw.employees.map((e) => e.email)).toEqual(['anna@ida.test', 'oleg@ida.test']);
    expect(raw.logs.map((l) => l.employeeId)).toEqual(['e-1']);
    // Охват набора — почты контура: если набор собран до появления человека, он перечитается
    expect(loadHrDataset).toHaveBeenCalledWith(['anna@ida.test', 'oleg@ida.test']);
  });

  it('в наборе нет дизайнерских позиций — справки нет, страница живёт', async () => {
    loadHrDataset.mockResolvedValue({ ...DATASET, employees: DATASET.employees.filter((e) => e.id.startsWith('e-')) });
    const raw = await fetchHrEconomics(EMAILS);
    expect(raw.employees).toHaveLength(2);
    expect(raw.designWorkingEmails).toEqual(['anna@ida.test']);
  });

  it('второй заход с тем же набором email (в другом порядке) — из кэша', async () => {
    const a = await fetchHrEconomics(EMAILS);
    const b = await fetchHrEconomics(['OLEG@ida.test', 'anna@ida.test']);
    expect(loadHrDataset).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
    await fetchHrEconomics(['new@ida.test']);
    expect(loadHrDataset).toHaveBeenCalledTimes(2);
  });

  it('пустой контур — без сотрудников и журнала, компания и справка на месте', async () => {
    const raw = await fetchHrEconomics([]);
    expect(raw.employees).toEqual([]);
    expect(raw.logs).toEqual([]);
    expect(raw.company.fotByMonth).toEqual({ '2026-08': 31000000, '2026-09': 32000000 });
  });

  it('справочник причин и статистика компании — по возможности (живой набор без них)', async () => {
    loadHrDataset.mockResolvedValue({ ...DATASET, reasons: [], subs: [], wageFundByMonth: [], monthlyStats: [] });
    const raw = await fetchHrEconomics(EMAILS);
    expect(raw.employees).toHaveLength(2);
    expect(raw.reasons).toEqual([]);
    expect(raw.designWorkingEmails.sort()).toEqual(['anna@ida.test', 'lead@ida.test']);
    expect(raw.company).toEqual({ fotByMonth: {}, headcountByMonth: {}, exitsByMonth: {} });
  });

  it('набор недоступен — вся выборка падает', async () => {
    loadHrDataset.mockRejectedValue(new Error('HR: данные недоступны'));
    await expect(fetchHrEconomics(EMAILS)).rejects.toThrow('HR: данные недоступны');
  });

  it('живой набор — источник clickhouse', () => {
    const raw = economicsFromDataset({ ...DATASET, source: 'clickhouse' }, EMAILS);
    expect(raw.source).toBe('clickhouse');
  });
});

describe('loadHrEconomics', () => {
  it('HR лежит и данных ещё не было — пусто и ошибка', async () => {
    loadHrDataset.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const r = await loadHrEconomics(EMAILS);
    expect(r).toMatchObject({ raw: null, stale: false });
    expect(r.error).toContain('ECONNREFUSED');
  });

  it('HR упал после удачной выборки — последняя удачная с пометкой', async () => {
    const ok = await loadHrEconomics(EMAILS);
    expect(ok.stale).toBe(false);
    clearCache();
    loadHrDataset.mockRejectedValue(new Error('timeout'));
    const r = await loadHrEconomics(EMAILS);
    expect(r.stale).toBe(true);
    expect(r.raw).toBe(ok.raw);
  });

  it('не уложились в бюджет — не ждём', async () => {
    loadHrDataset.mockImplementation(() => new Promise(() => {}));
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
