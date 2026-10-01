import { describe, expect, it } from 'vitest';
import { buildCompensation } from '../compensation';
import {
  addDays,
  avgHireSalary,
  avgRaise,
  bandSummary,
  bridge,
  buildEconPeople,
  buildEconomicsDataset,
  buildReasonGroups,
  churn,
  cohortMedianChange,
  companyFotAt,
  companyTurnover,
  coverage,
  deptFromHr,
  econWindow,
  fmtMln,
  fmtPp,
  fmtRate,
  fmtShare,
  fmtSignedPct,
  fmtSumK,
  guideline,
  inDept,
  isActiveAt,
  levelRows,
  inEconomicsContour,
  median,
  monthSlots,
  monthlySeries,
  normalizeLog,
  plural,
  resolveInitiators,
  TRACK_SINCE,
  salaryAt,
  salarySteps,
  showYoY,
  snapshot,
  taxMultiplier,
  NO_REASON_GROUP,
  type CompanyStats,
  type EconPerson,
  type GradesOverlay,
  type HrEmployeeRaw,
  type HrLogRaw,
  type HrEconomicsRaw,
  type ReasonGroup,
} from '../economics';

// Все люди, суммы и причины выдуманы.
const K = 1000;
const TODAY = '2026-10-01';
const W = econWindow(TODAY);

function person(over: Partial<EconPerson> & { salary?: number; hired?: string; left?: string | null }): EconPerson {
  const { salary = 100 * K, hired = '2024-03-01', left = null, ...rest } = over;
  return {
    key: rest.key ?? Math.random().toString(36).slice(2),
    name: rest.name ?? 'Тест Тестов',
    avatarUrl: null,
    dept: 'navigator',
    level: 'middle',
    hourly: false,
    stints: [{ from: hired, to: left }],
    steps: [{ date: '1970-01-01', salary }],
    noHistory: false,
    planned: null,
    exit: null,
    ...rest,
  };
}

const steps = (...xs: Array<[string, number]>) => xs.map(([date, s]) => ({ date, salary: s * K }));

const EMPTY_COMPANY: CompanyStats = { fotByMonth: {}, headcountByMonth: {}, exitsByMonth: {} };

// ─── Даты ─────────────────────────────────────────────────────────────

describe('econWindow и monthSlots', () => {
  it('1 января, тот же день год назад, конец года', () => {
    expect(W).toEqual({ today: '2026-10-01', jan1: '2026-01-01', yearAgo: '2025-10-01', yearEnd: '2026-12-31' });
  });

  it('29 февраля год назад — 28-е', () => {
    expect(econWindow('2028-02-29').yearAgo).toBe('2027-02-28');
  });

  it('месяцы с января 2025 (TRACK_SINCE) по текущий; точка — последний день, у текущего — сегодня', () => {
    expect(TRACK_SINCE).toBe('2025-01-01');
    const s = monthSlots('2026-10-15');
    expect(s).toHaveLength(22);
    expect(s[0]).toEqual({ key: '2025-01', y: 2025, m: 1, at: '2025-01-31' });
    expect(s[20].at).toBe('2026-09-30');
    expect(s[21]).toEqual({ key: '2026-10', y: 2026, m: 10, at: '2026-10-15' });
    expect(monthSlots('2026-03-10', '2026-01-01').map((x) => x.at)).toEqual(['2026-01-31', '2026-02-28', '2026-03-10']);
  });

  it('addDays через границу месяца', () => {
    expect(addDays('2026-01-28', 7)).toBe('2026-02-04');
  });
});

// ─── Журнал ставок ────────────────────────────────────────────────────

describe('журнал ставок', () => {
  it('normalizeLog: без «→ 0», «не изменилась» и точных дублей, по дате', () => {
    const rows = normalizeLog([
      { date: '2025-06-01T00:00:00', from: 100 * K, to: 110 * K },
      { date: '2025-06-01', from: 100 * K, to: 110 * K },
      { date: '2025-01-01', from: 90 * K, to: 100 * K },
      { date: '2025-07-01', from: 110 * K, to: 110 * K },
      { date: '2025-08-01', from: 110 * K, to: 0 },
    ]);
    expect(rows).toEqual([
      { date: '2025-01-01', from: 90 * K, to: 100 * K },
      { date: '2025-06-01', from: 100 * K, to: 110 * K },
    ]);
  });

  it('изменение в первую неделю после найма — стартовая ставка с даты найма', () => {
    const s = salarySteps([{ date: '2026-03-05', from: 100 * K, to: 110 * K }], ['2026-03-02'], 110 * K);
    expect(s).toEqual([{ date: '2026-03-02', salary: 110 * K }]);
  });

  it('первая запись — повышение: до неё действовала ставка «было»', () => {
    const s = salarySteps([{ date: '2025-06-01', from: 90 * K, to: 105 * K }], ['2022-01-10'], 105 * K);
    expect(s).toEqual([
      { date: '1970-01-01', salary: 90 * K },
      { date: '2025-06-01', salary: 105 * K },
    ]);
  });

  it('«с нуля» (from = 0) — стартовая ставка последнего найма', () => {
    const s = salarySteps(
      [
        { date: '2025-02-01', from: 0, to: 80 * K },
        { date: '2025-09-01', from: 80 * K, to: 95 * K },
      ],
      ['2025-01-20'],
      95 * K,
    );
    expect(s).toEqual([
      { date: '2025-01-20', salary: 80 * K },
      { date: '2025-09-01', salary: 95 * K },
    ]);
  });

  it('журнала нет — одна ступень с текущей ставкой; нет и ставки — пусто', () => {
    expect(salarySteps([], ['2020-01-01'], 120 * K)).toEqual([{ date: '1970-01-01', salary: 120 * K }]);
    expect(salarySteps([], ['2020-01-01'], 0)).toEqual([]);
  });

  it('salaryAt: последняя ступень не позже даты; до первой — стартовая; без ступеней — 0', () => {
    const p = { steps: steps(['2025-01-10', 80], ['2025-09-01', 95], ['2026-11-01', 110]) };
    expect(salaryAt(p, '2024-12-01')).toBe(80 * K);
    expect(salaryAt(p, '2025-09-01')).toBe(95 * K);
    // Будущая запись журнала в текущую ставку не входит
    expect(salaryAt(p, TODAY)).toBe(95 * K);
    expect(salaryAt({ steps: [] }, TODAY)).toBe(0);
  });

  it('текущая ставка совпадает с поп-апом «Зарплата» (buildCompensation)', () => {
    const cases: Array<{ hired: string; salary: number; log: Array<{ date: string; from: number; to: number }> }> = [
      { hired: '2022-04-11', salary: 104 * K, log: [{ date: '2024-05-01', from: 75 * K, to: 82 * K }, { date: '2026-05-01', from: 82 * K, to: 104 * K }] },
      { hired: '2026-03-02', salary: 110 * K, log: [{ date: '2026-03-05', from: 100 * K, to: 110 * K }] },
      { hired: '2021-01-11', salary: 90 * K, log: [] },
      { hired: '2023-06-05', salary: 100 * K, log: [{ date: '2025-06-01', from: 100 * K, to: 115 * K }, { date: '2026-12-01', from: 115 * K, to: 130 * K }] },
      { hired: '2024-02-05', salary: 82 * K, log: [{ date: '2025-02-01', from: 65 * K, to: 82 * K }, { date: '2025-03-01', from: 82 * K, to: 0 }] },
    ];
    for (const c of cases) {
      const view = buildCompensation({
        hr: { salary: c.salary, hiredAt: c.hired, dismissedAt: null },
        log: c.log,
        bonuses: [],
        role: 'designer',
        grade: 'middle',
        activeInGrades: true,
        today: TODAY,
      });
      const mine = salaryAt({ steps: salarySteps(c.log, [c.hired], c.salary) }, TODAY);
      expect(view.state === 'ok' && view.current, c.hired).toBe(mine);
    }
  });
});

// ─── Периоды и активность ─────────────────────────────────────────────

describe('периоды работы', () => {
  it('день увольнения — ещё рабочий, следующий — нет', () => {
    const p = person({ hired: '2025-02-03', left: '2026-03-20' });
    expect(isActiveAt(p, '2025-02-02')).toBe(false);
    expect(isActiveAt(p, '2025-02-03')).toBe(true);
    expect(isActiveAt(p, '2026-03-20')).toBe(true);
    expect(isActiveAt(p, '2026-03-21')).toBe(false);
  });

  it('inDept: «Все», отдел, «Без отдела»', () => {
    const a = person({ dept: 'creator' });
    const b = person({ dept: null });
    expect(inDept(a, 'all') && inDept(a, 'creator') && !inDept(a, 'navigator')).toBe(true);
    expect(inDept(b, 'none') && !inDept(a, 'none')).toBe(true);
  });

  it('отдел по отделу HR — запасной вариант (названия как в hrRegistry)', () => {
    expect(deptFromHr('improve')).toBe('navigator');
    expect(deptFromHr('create')).toBe('visioner');
    expect(deptFromHr('design.inhouse')).toBe('creator');
    expect(deptFromHr('Криэйт')).toBe('visioner');
    expect(deptFromHr('Backoffice')).toBe(null);
    expect(deptFromHr('')).toBe(null);
  });
});

// ─── Контур: Грейды + ставки HR по email ──────────────────────────────

function emp(over: Partial<HrEmployeeRaw>): HrEmployeeRaw {
  return {
    id: over.id ?? 'e1',
    email: 'a@ida.test',
    firstName: 'Аня',
    lastName: 'Тестова',
    positionId: '9',
    department: '',
    hiredAt: '2024-03-01',
    dismissedAt: null,
    archived: false,
    salary: 100 * K,
    reasonId: null,
    subId: null,
    ...over,
  };
}

function overlay(over: Partial<GradesOverlay>): GradesOverlay {
  return {
    email: 'a@ida.test',
    fullName: 'Аня Тестова',
    role: 'designer',
    department: 'Криэйт',
    buildCode: null,
    employmentType: 'staff',
    active: true,
    hiredAt: '2024-03-01T00:00:00.000Z',
    dismissedAt: null,
    grade: 'middle',
    avatarUrl: null,
    dismissalType: null,
    dismissalReason: null,
    plannedRaise: null,
    ...over,
  };
}

const build = (employees: HrEmployeeRaw[], grades: GradesOverlay[], logs: HrLogRaw[] = []) =>
  buildEconPeople({ employees, logs, grades, today: TODAY });

describe('контур — как в Грейдах', () => {
  it('роль дизайна и работает или ушёл не раньше 2025 года', () => {
    expect(inEconomicsContour({ role: 'designer', active: true, dismissedAt: null })).toBe(true);
    expect(inEconomicsContour({ role: 'stardiz', active: true, dismissedAt: null })).toBe(true);
    expect(inEconomicsContour({ role: 'lead', active: false, dismissedAt: '2025-01-01T00:00:00.000Z' })).toBe(true);
    expect(inEconomicsContour({ role: 'designer', active: false, dismissedAt: '2024-12-31' })).toBe(false);
    // Неактивный без даты увольнения — когда ушёл, неизвестно
    expect(inEconomicsContour({ role: 'designer', active: false, dismissedAt: null })).toBe(false);
    expect(inEconomicsContour({ role: 'admin', active: true, dismissedAt: null })).toBe(false);
  });

  it('работает в HR, но нет в Грейдах — не входит; ушёл до 2025 — не входит', () => {
    const { people } = build(
      [
        emp({ id: 'in', email: 'in@ida.test' }),
        emp({ id: 'hr-only', email: 'lite@ida.test' }),
        emp({ id: 'old', email: 'old@ida.test', dismissedAt: '2024-11-30' }),
      ],
      [
        overlay({ email: 'in@ida.test' }),
        overlay({ email: 'old@ida.test', active: false, dismissedAt: '2024-11-30T00:00:00.000Z' }),
      ],
    );
    expect(people.map((p) => p.key)).toEqual(['in']);
  });

  it('человек Грейдов с не-дизайнерской позицией в HR — входит, ставка из HR', () => {
    const { people } = build(
      [emp({ id: 'bo', email: 'lead@ida.test', positionId: '77', department: 'backoffice', salary: 210 * K })],
      [overlay({ email: 'lead@ida.test', role: 'lead', fullName: 'Олег Лидов', department: null })],
    );
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ name: 'Олег Лидов', level: 'lead', dept: 'leads' });
    expect(salaryAt(people[0], TODAY)).toBe(210 * K);
  });

  it('человека Грейдов нет в HR — в цифры не входит, считаем в справке', () => {
    const r = build([emp({})], [overlay({}), overlay({ email: 'nohr@ida.test' })]);
    expect(r.people).toHaveLength(1);
    expect(r.missingInHr).toBe(1);
  });

  it('даты — из Грейдов: в HR уволен, в Грейдах работает — работает; и наоборот', () => {
    const { people } = build(
      [
        emp({ id: 'back', email: 'back@ida.test', hiredAt: '2021-01-01', dismissedAt: '2025-03-01' }),
        emp({ id: 'gone', email: 'gone@ida.test', hiredAt: '2022-02-01' }),
      ],
      [
        overlay({ email: 'back@ida.test', hiredAt: '2021-01-01T00:00:00.000Z' }),
        overlay({ email: 'gone@ida.test', active: false, hiredAt: '2022-02-01', dismissedAt: '2026-06-30T00:00:00.000Z' }),
      ],
    );
    const byKey = Object.fromEntries(people.map((p) => [p.key, p]));
    expect(byKey.back.stints).toEqual([{ from: '2021-01-01', to: null }]);
    expect(isActiveAt(byKey.back, TODAY)).toBe(true);
    expect(byKey.gone.stints).toEqual([{ from: '2022-02-01', to: '2026-06-30' }]);
    // Уволен в июне — в точке июня (30-е) ещё работает, в июле — нет
    expect(isActiveAt(byKey.gone, '2026-06-30')).toBe(true);
    expect(isActiveAt(byKey.gone, '2026-07-31')).toBe(false);
  });

  it('почасовщик с формальной датой увольнения работает — он активен в Грейдах', () => {
    const { people } = build(
      [emp({})],
      [overlay({ employmentType: 'hourly', dismissedAt: '2026-02-01T00:00:00.000Z' })],
    );
    expect(people[0].hourly).toBe(true);
    expect(isActiveAt(people[0], TODAY)).toBe(true);
  });

  it('нет даты найма в Грейдах — берём из HR', () => {
    const { people } = build([emp({ hiredAt: '2023-05-15' })], [overlay({ hiredAt: null })]);
    expect(people[0].stints[0].from).toBe('2023-05-15');
  });

  it('Грейды поверх HR: имя, отдел, грейд, почасовщик; отдел HR — запасной', () => {
    const { people } = build(
      [emp({ id: 'a', department: 'improve' }), emp({ id: 'b', email: 'b@ida.test', department: 'design.inhouse' })],
      [
        overlay({ fullName: 'Анна Тестова', grade: 'senior' }),
        overlay({ email: 'b@ida.test', fullName: 'Борис Без-Отдела', department: null, grade: null }),
      ],
    );
    const byKey = Object.fromEntries(people.map((p) => [p.key, p]));
    expect(byKey.a).toMatchObject({ name: 'Анна Тестова', dept: 'visioner', level: 'senior', noHistory: true });
    expect(byKey.b).toMatchObject({ dept: 'creator', level: null });
  });

  it('несколько записей HR одного email — один журнал; стартовая ставка новой записи — не повышение', () => {
    const { people } = build(
      [
        emp({ id: 'old', hiredAt: '2021-02-01', dismissedAt: '2023-06-30', archived: true }),
        emp({ id: 'new', hiredAt: '2025-03-03', salary: 130 * K }),
      ],
      [overlay({ hiredAt: '2021-02-01' })],
      [
        { employeeId: 'old', date: '2022-02-01', from: 80 * K, to: 95 * K },
        { employeeId: 'new', date: '2025-03-04', from: 120 * K, to: 125 * K },
        { employeeId: 'new', date: '2026-04-01', from: 125 * K, to: 130 * K },
      ],
    );
    expect(people).toHaveLength(1);
    const p = people[0];
    expect(p.key).toBe('new');
    expect(salaryAt(p, '2022-06-01')).toBe(95 * K);
    expect(salaryAt(p, '2025-03-03')).toBe(125 * K);
    expect(salaryAt(p, TODAY)).toBe(130 * K);
    expect(p.exit).toBeNull();
  });

  it('плановый пересмотр: активный остаётся, выполненный (HR уже повысил после базы) — нет', () => {
    const { people } = build(
      [emp({ id: 'p1', email: 'p1@ida.test' }), emp({ id: 'p2', email: 'p2@ida.test' })],
      [
        overlay({ email: 'p1@ida.test', plannedRaise: { setAt: '2026-08-01', baselineAt: '1970-01-01', at: '2026-11-01T00:00:00.000Z', salary: 112 * K } }),
        overlay({ email: 'p2@ida.test', plannedRaise: { setAt: '2026-08-01', baselineAt: '1970-01-01', at: null, salary: 115 * K } }),
      ],
      [{ employeeId: 'p2', date: '2026-09-01', from: 100 * K, to: 115 * K }],
    );
    const byKey = Object.fromEntries(people.map((p) => [p.key, p]));
    expect(byKey.p1.planned).toEqual({ at: '2026-11-01', salary: 112 * K });
    expect(byKey.p2.planned).toBeNull();
  });

  it('причина ухода — из HR по email; в HR ещё работает — только тип и текст из Грейдов', () => {
    const { people } = build(
      [
        emp({ id: 'hr', email: 'hr@ida.test', dismissedAt: '2026-05-15', reasonId: 'r2', subId: 's5' }),
        emp({ id: 'gr', email: 'gr@ida.test' }),
      ],
      [
        overlay({ email: 'hr@ida.test', active: false, dismissedAt: '2026-05-15', dismissalType: 'voluntary', dismissalReason: '  Ушла в продукт ' }),
        overlay({ email: 'gr@ida.test', active: false, dismissedAt: '2026-04-30', dismissalType: 'probation' }),
      ],
    );
    const byKey = Object.fromEntries(people.map((p) => [p.key, p]));
    expect(byKey.hr.exit).toEqual({ reasonId: 'r2', subId: 's5', gradesType: 'voluntary', note: 'Ушла в продукт' });
    expect(byKey.gr.exit).toEqual({ reasonId: null, subId: null, gradesType: 'probation', note: null });
  });
});

// ─── Причины ухода ────────────────────────────────────────────────────

describe('причины ухода', () => {
  const RAW = [
    { id: '1', initiator: 1, title: 'Условия труда' },
    { id: '2', initiator: 1, title: 'сфера деятельности' },
    { id: '3', initiator: 0, title: 'Оптимизация' },
    { id: '4', initiator: 0, title: 'Не прошёл испытательный срок' },
    { id: '5', initiator: null, title: 'Другое' },
  ];

  it('initiator 1 — сотрудник, 0 — компания; без значения — неизвестно', () => {
    const m = resolveInitiators(RAW);
    expect([m.get('1'), m.get('3'), m.get('4'), m.get('5')]).toEqual(['employee', 'company', 'company', null]);
  });

  it('справочник размечен наоборот — переворачиваем по смыслу названий', () => {
    const flipped = RAW.map((r) => ({ ...r, initiator: r.initiator == null ? null : 1 - r.initiator }));
    const m = resolveInitiators(flipped);
    expect([m.get('1'), m.get('3')]).toEqual(['employee', 'company']);
  });

  it('группы: сначала сотрудник, потом компания; заглавная буква; подкатегории внутри', () => {
    const g = buildReasonGroups(RAW, [
      { id: 's1', reasonId: '3', title: 'закрытие проекта' },
      { id: 's2', reasonId: '1', title: 'Переработки' },
    ]);
    expect(g.map((x) => x.title)).toEqual([
      'Сфера деятельности',
      'Условия труда',
      'Не прошёл испытательный срок',
      'Оптимизация',
      'Другое',
    ]);
    expect(g.find((x) => x.id === '3')!.subs).toEqual([{ id: 's1', title: 'Закрытие проекта' }]);
  });
});

// ─── Срезы и ряд ──────────────────────────────────────────────────────

describe('snapshot и помесячный ряд', () => {
  const people = [
    person({ salary: 100 * K }),
    person({ salary: 140 * K }),
    person({ salary: 60 * K, hourly: true }),
    person({ salary: 0 }),
    person({ salary: 200 * K, hired: '2026-05-01' }),
  ];

  it('почасовщик — в ФОТ и численности, но не в медиане; нулевая ставка — тоже мимо медианы', () => {
    const s = snapshot(people, '2026-01-01');
    expect(s).toMatchObject({ count: 4, fot: 300 * K, median: 120 * K, paidCount: 2 });
    expect(s.mean).toBe(120 * K);
  });

  it('YoY — только когда в обеих точках не меньше 6 человек', () => {
    const big = Array.from({ length: 6 }, () => person({}));
    expect(showYoY(snapshot(big, TODAY), snapshot(big, W.yearAgo))).toBe(true);
    expect(showYoY(snapshot(people, TODAY), snapshot(people, W.yearAgo))).toBe(false);
  });

  it('доля в ФОТ компании; нет месяца — берём предыдущий', () => {
    const company: CompanyStats = { ...EMPTY_COMPANY, fotByMonth: { '2026-08': 4000 * K, '2026-09': 5000 * K } };
    expect(companyFotAt(company, '2026-10')).toBe(5000 * K);
    expect(companyFotAt(company, '2026-07')).toBeNull();
    const series = monthlySeries(people, company, TODAY);
    expect(series).toHaveLength(22);
    const last = series[21];
    expect(last.key).toBe('2026-10');
    expect(last.fot).toBe(500 * K);
    expect(last.share).toBeCloseTo(10, 5);
    expect(series[0].share).toBeNull();
  });

  it('median', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

// ─── Разложение ФОТ ───────────────────────────────────────────────────

describe('bridge — «Куда ушли деньги с 1 января»', () => {
  const people = [
    // Работал и работает: +20 и +10, один без изменений, одно понижение
    person({ key: 'r1', steps: steps(['1970-01-01', 100], ['2026-03-01', 120]) }),
    person({ key: 'r2', steps: steps(['1970-01-01', 140], ['2026-06-01', 150]) }),
    person({ key: 'same', salary: 90 * K }),
    person({ key: 'cut', steps: steps(['1970-01-01', 110], ['2026-02-01', 105]) }),
    // Нанят с 1 января
    person({ key: 'hire', hired: '2026-04-06', steps: steps(['2026-04-06', 80], ['2026-08-01', 85]) }),
    // Ушёл с 1 января
    person({ key: 'left', hired: '2022-01-01', left: '2026-03-20', steps: steps(['1970-01-01', 130], ['2026-02-01', 135]) }),
    // Нанят и ушёл в этом году — мимо разложения
    person({ key: 'inout', hired: '2026-02-02', left: '2026-04-30', salary: 70 * K }),
    // Ушёл в прошлом году — вообще не здесь
    person({ key: 'old', hired: '2020-01-01', left: '2025-11-01', salary: 99 * K }),
    // Почасовщик — в ФОТ
    person({ key: 'hourly', hourly: true, salary: 50 * K }),
  ];
  const b = bridge(people, W);

  it('составляющие', () => {
    expect(b).toMatchObject({
      start: (100 + 140 + 90 + 110 + 130 + 50) * K,
      startCount: 6,
      end: (120 + 150 + 90 + 105 + 85 + 50) * K,
      endCount: 6,
      raises: 30 * K,
      raiseCount: 2,
      cuts: -5 * K,
      cutCount: 1,
      hires: 85 * K,
      hireCount: 1,
      leavers: 130 * K,
      leaverCount: 1,
      inOut: 1,
    });
  });

  it('сходится: старт + повышения + понижения + наймы − уходы = сейчас', () => {
    expect(b.start + b.raises + b.cuts + b.hires - b.leavers).toBe(b.end);
  });

  it('ГПЗП и СГПЗП', () => {
    expect(b.raises).toBe(30 * K);
    expect(avgRaise(b)).toBe(15 * K);
    expect(avgRaise(bridge([], W))).toBeNull();
  });

  it('плановые пересмотры до конца года; следующий год и выполненные — мимо', () => {
    const withPlans = bridge(
      [
        person({ salary: 100 * K, planned: { at: '2026-12-01', salary: 112 * K } }),
        person({ salary: 100 * K, planned: { at: null, salary: 105 * K } }),
        person({ salary: 100 * K, planned: { at: '2027-02-01', salary: 130 * K } }),
        person({ salary: 100 * K, planned: { at: '2026-11-01', salary: 90 * K } }),
        person({ salary: 100 * K, left: '2026-06-30', planned: { at: '2026-12-01', salary: 150 * K } }),
      ],
      W,
    );
    expect(withPlans.planned).toBe(17 * K);
    expect(withPlans.plannedCount).toBe(2);
    expect(withPlans.growthPct).toBeCloseTo(-20, 5);
    expect(withPlans.plannedGrowthPct).toBeCloseTo(((417 - 500) / 500) * 100, 5);
  });

  it('ориентир — от ФОТ на 1 января', () => {
    const g = guideline(b, 0.1);
    expect(g.targetPct).toBeCloseTo(10, 6);
    expect(g.targetFot).toBeCloseTo(b.start * 1.1, 6);
    expect(g.nowPct).toBeCloseTo(((b.end - b.start) / b.start) * 100, 6);
  });

  it('никого на 1 января — роста нет, а не деление на ноль', () => {
    const only = bridge([person({ hired: '2026-05-01' })], W);
    expect(only.growthPct).toBeNull();
    expect(only.hireCount).toBe(1);
  });
});

describe('медиана у тех же людей', () => {
  it('найм джунов роняет общую медиану, но у оставшихся ставки выросли', () => {
    const stay = [
      person({ steps: steps(['1970-01-01', 100], ['2026-04-01', 110]) }),
      person({ steps: steps(['1970-01-01', 120], ['2026-04-01', 130]) }),
      person({ steps: steps(['1970-01-01', 140]) }),
    ];
    const juniors = [55, 58, 60, 62].map((s) => person({ hired: '2026-03-01', salary: s * K }));
    const all = [...stay, ...juniors];
    expect(snapshot(all, TODAY).median!).toBeLessThan(snapshot(all, W.jan1).median!);
    const c = cohortMedianChange(all, W.jan1, TODAY);
    expect(c.n).toBe(3);
    expect(c.pct).toBeCloseTo((130 / 120 - 1) * 100, 6);
  });

  it('почасовщики не входят', () => {
    const c = cohortMedianChange([person({ hourly: true })], W.jan1, TODAY);
    expect(c).toEqual({ pct: null, n: 0 });
  });
});

// ─── По уровням ───────────────────────────────────────────────────────

describe('levelRows', () => {
  const people = [
    person({ key: 'j1', level: 'junior', salary: 60 * K }),
    person({ key: 'j2', level: 'junior', salary: 80 * K }),
    person({ key: 'j3', level: 'junior', salary: 50 * K, hired: '2026-03-10' }),
    person({ key: 'j4', level: 'junior', salary: 70 * K, hired: '2025-01-01' }),
    // Нанят в этом году и ушёл — в людях уровня нет, а в ССЗП есть
    person({ key: 'j5', level: 'junior', salary: 56 * K, hired: '2026-02-02', left: '2026-04-30' }),
    person({ key: 'st', level: 'stardiz', salary: 190 * K }),
    person({ key: 'ng', level: null, salary: 90 * K }),
    person({ key: 'hr', level: 'middle', hourly: true, salary: 40 * K }),
  ];
  const rows = levelRows(people, W);

  it('порядок: уровни, без грейда, почасовщики; пустые уровни не показываем', () => {
    expect(rows.map((r) => r.key)).toEqual(['junior', 'stardiz', 'none', 'hourly']);
  });

  it('вилка, медиана, выше и ниже вилки, ССЗП', () => {
    const j = rows[0];
    expect(j.band).toEqual({ min: 55 * K, max: 75 * K });
    expect(j.people.map((x) => x.p.key)).toEqual(['j2', 'j4', 'j1', 'j3']);
    expect(j.median).toBe(65 * K);
    expect([j.above, j.below]).toEqual([1, 1]);
    expect(j.small).toBe(false);
    expect(j.hire).toEqual({ count: 2, avg: 53 * K });
    expect(j.people.find((x) => x.p.key === 'j3')!.jan1).toBeNull();
  });

  it('малая группа и вилка по роли у стардиза', () => {
    const s = rows[1];
    expect(s.small).toBe(true);
    expect(s.band).toEqual({ min: 140 * K, max: 180 * K });
    expect(s.above).toBe(1);
  });

  it('у почасовщиков нет вилки и медианы; без грейда — без вилки', () => {
    const none = rows.find((r) => r.key === 'none')!;
    const hourly = rows.find((r) => r.key === 'hourly')!;
    expect(none.band).toBeNull();
    expect(none.median).toBe(90 * K);
    expect(hourly.band).toBeNull();
    expect(hourly.median).toBeNull();
    expect(hourly.people[0].state).toBeNull();
  });

  it('bandSummary и общий ССЗП', () => {
    expect(bandSummary(rows)).toEqual({ banded: 5, above: 2 });
    expect(avgHireSalary(people, W)).toEqual({ count: 2, avg: 53 * K });
  });
});

describe('билд без грейдов («Коммуникации»)', () => {
  // Коммуникационный дизайнер в «Инхаусе»: штатный, билд без грейдов. Оценка
  // из прошлого билда в Грейдах осталась — уровень всё равно «Без грейда».
  const { people } = build(
    [
      emp({ id: 'cm', email: 'cm@ida.test', salary: 120 * K }),
      emp({ id: 'mi', email: 'mi@ida.test', salary: 100 * K }),
    ],
    [
      overlay({ email: 'cm@ida.test', department: 'Инхаус', buildCode: 'communications', grade: 'middle' }),
      overlay({ email: 'mi@ida.test', department: 'Инхаус', buildCode: 'creator', grade: 'middle' }),
    ],
  );
  const cm = people.find((p) => p.key === 'cm')!;

  it('уровень — без грейда, отдел — «Инхаус», не почасовщик', () => {
    expect(cm).toMatchObject({ level: null, dept: 'creator', hourly: false });
    // Сосед из билда с матрицей — по грейду
    expect(people.find((p) => p.key === 'mi')!.level).toBe('middle');
  });

  it('строка «Без грейда»: без вилки, ставка без цвета вилки', () => {
    const rows = levelRows(people, W);
    const none = rows.find((r) => r.key === 'none')!;
    expect(none.people.map((x) => x.p.key)).toEqual(['cm']);
    expect(none.band).toBeNull();
    expect(none.people[0].state).toBeNull();
    expect(none.median).toBe(120 * K);
    // В вилку грейда «Мидл» не попала
    expect(rows.find((r) => r.key === 'middle')!.people.map((x) => x.p.key)).toEqual(['mi']);
    expect(bandSummary(rows).banded).toBe(1);
  });

  it('в ФОТ, численности и медиане — как другие без грейда', () => {
    const s = snapshot(people, TODAY);
    expect(s.count).toBe(2);
    expect(s.fot).toBe(220 * K);
    expect(s.paidCount).toBe(2);
    expect(s.median).toBe(110 * K);
  });
});

// ─── Найм и уходы ─────────────────────────────────────────────────────

describe('churn', () => {
  const reasons: ReasonGroup[] = [
    { id: 'r1', title: 'Условия труда', initiator: 'employee', subs: [{ id: 's1', title: 'Оплата труда' }, { id: 's2', title: 'Выгорание' }] },
    { id: 'r2', title: 'Оптимизация', initiator: 'company', subs: [{ id: 's3', title: 'Закрытие проекта' }] },
  ];
  const leaver = (key: string, left: string, exit: EconPerson['exit']) =>
    person({ key, hired: '2022-01-01', left, exit });
  const people = [
    leaver('a', '2026-03-20', { reasonId: 'r1', subId: 's1', gradesType: null, note: 'Продуктовая компания' }),
    leaver('b', '2026-07-31', { reasonId: 'r1', subId: null, gradesType: 'voluntary', note: null }),
    leaver('c', '2025-12-19', { reasonId: 'r2', subId: 's3', gradesType: null, note: null }),
    leaver('d', '2026-02-13', { reasonId: null, subId: null, gradesType: 'probation', note: 'Не подтвердил уровень' }),
    leaver('e', '2026-01-10', { reasonId: 'zzz', subId: null, gradesType: null, note: null }),
    // Ушёл раньше окна
    leaver('old', '2025-09-30', { reasonId: 'r1', subId: 's2', gradesType: null, note: null }),
    person({ key: 'h1', hired: '2026-06-02' }),
    person({ key: 'h2', hired: '2025-10-01' }),
    person({ key: 'stay' }),
  ];
  const series = monthlySeries(people, EMPTY_COMPANY, TODAY);
  const c = churn(people, reasons, W, series);

  it('наймы и уходы за 12 месяцев (с границей «год назад» не включительно)', () => {
    expect(c.hires).toBe(1);
    expect(c.exits).toBe(5);
  });

  it('группы HR, подкатегории и «Без подкатегории»', () => {
    const r1 = c.groups.find((g) => g.id === 'r1')!;
    expect(r1.exits.map((x) => x.p.key)).toEqual(['b', 'a']);
    expect(r1.subs).toEqual([
      { id: 's1', title: 'Оплата труда', count: 1 },
      { id: 's2', title: 'Выгорание', count: 0 },
      { id: 'r1:none', title: 'Без подкатегории', count: 1 },
    ]);
    expect(r1.exits.find((x) => x.p.key === 'a')).toMatchObject({ reason: 'Оплата труда', note: 'Продуктовая компания', initiator: 'employee' });
    expect(r1.exits.find((x) => x.p.key === 'b')!.reason).toBe('Условия труда');
  });

  it('без причины в HR — отдельная группа, инициатор и текст из Грейдов', () => {
    const none = c.groups.find((g) => g.id === NO_REASON_GROUP)!;
    expect(none.exits.map((x) => x.p.key)).toEqual(['d', 'e']);
    expect(none.exits[0]).toMatchObject({ initiator: 'company', reason: 'Испытательный срок не пройден', note: 'Не подтвердил уровень' });
    expect(none.exits[1]).toMatchObject({ initiator: null, reason: null });
  });

  it('по инициатору и отток к средней численности', () => {
    expect([c.byEmployee, c.byCompany, c.unknown]).toEqual([2, 2, 1]);
    const last12 = series.slice(-12);
    const avg = last12.reduce((s, m) => s + m.count, 0) / 12;
    expect(c.turnoverPct).toBeCloseTo((5 / avg) * 100, 6);
  });

  it('нет групп «Без причины», если все причины из HR', () => {
    const only = churn([leaver('a', '2026-03-20', { reasonId: 'r2', subId: 's3', gradesType: null, note: null })], reasons, W, series);
    expect(only.groups.map((g) => g.id)).toEqual(['r1', 'r2']);
  });

  it('отток компании — 12 последних месяцев; меньше года данных — нет цифры', () => {
    const headcountByMonth: Record<string, number> = {};
    const exitsByMonth: Record<string, number> = {};
    for (const s of monthSlots(TODAY, '2025-09-01')) {
      headcountByMonth[s.key] = 500;
      exitsByMonth[s.key] = 8;
    }
    expect(companyTurnover({ fotByMonth: {}, headcountByMonth, exitsByMonth }, TODAY)).toBeCloseTo((96 / 500) * 100, 6);
    const short = { fotByMonth: {}, headcountByMonth: { '2026-09': 500 }, exitsByMonth: { '2026-09': 3 } };
    expect(companyTurnover(short, TODAY)).toBeNull();
  });
});

// ─── Граница трекинга ─────────────────────────────────────────────────

describe('TRACK_SINCE — ушедших трекаем с 2025 года', () => {
  it('ушедшие до 2025 года не попадают в людей; ушедший 1 января 2025 — попадает', () => {
    const { people } = build(
      [
        emp({ id: 'gone', email: 'gone@ida.test' }),
        emp({ id: 'edge', email: 'edge@ida.test' }),
        emp({ id: 'live', email: 'live@ida.test' }),
      ],
      [
        overlay({ email: 'gone@ida.test', active: false, dismissedAt: '2024-12-31T00:00:00.000Z' }),
        overlay({ email: 'edge@ida.test', active: false, dismissedAt: '2025-01-01T00:00:00.000Z' }),
        overlay({ email: 'live@ida.test' }),
      ],
    );
    expect(people.map((p) => p.key).sort()).toEqual(['edge', 'live']);
  });

  it('уходы раньше границы не считаются, даже если попадают в 12 месяцев', () => {
    const w = econWindow('2025-06-01');
    const people = [
      person({ key: 'before', hired: '2020-01-01', left: '2024-08-01' }),
      person({ key: 'after', hired: '2020-01-01', left: '2025-02-01' }),
      person({ key: 'stay' }),
    ];
    const c = churn(people, [], w, monthlySeries(people, EMPTY_COMPANY, w.today));
    expect(c.exits).toBe(1);
    expect(c.groups[0].exits.map((x) => x.p.key)).toEqual(['after']);
  });

  it('помесячный ряд начинается с января 2025', () => {
    const series = monthlySeries([person({})], EMPTY_COMPANY, TODAY);
    expect(series[0].key).toBe('2025-01');
    expect(series[series.length - 1].key).toBe('2026-10');
  });
});

// ─── Набор целиком ────────────────────────────────────────────────────

describe('buildEconomicsDataset', () => {
  it('справки: людей «Команды» нет в HR; работают в HR дизайнерами, но нет в «Команде»', () => {
    const raw: HrEconomicsRaw = {
      employees: [emp({})],
      // Контур (без Lite и декрета) отобран при выборке — здесь только сверка email, без повторов
      designWorkingEmails: ['a@ida.test', 'EXTRA@ida.test', 'extra@ida.test', 'inactive@ida.test', 'admin@ida.test'],
      logs: [],
      reasons: [],
      subs: [],
      company: EMPTY_COMPANY,
      fetchedAt: '2026-10-01T06:40:00.000Z',
    };
    const ds = buildEconomicsDataset({
      raw,
      grades: [
        overlay({}),
        overlay({ email: 'nohr@ida.test' }),
        overlay({ email: 'admin@ida.test', role: 'admin' }),
        // Неактивная карточка в «Команде» есть — в «нет в Команде» не считаем
        overlay({ email: 'inactive@ida.test', active: false, dismissedAt: '2026-09-01' }),
      ],
      today: TODAY,
    });
    expect(ds.people).toHaveLength(1);
    // nohr и inactive (в HR нет записи по email) — нет в HR
    expect(ds.notes).toEqual({ missingInHr: 2, hrOnlyDesign: 1 });
    expect(coverage(ds.people, TODAY)).toEqual({ have: 0, total: 1 });
  });
});

// ─── Суммы и форматы ──────────────────────────────────────────────────

describe('режим сумм и форматы', () => {
  it('«На руки» — ×1, «Для компании» — ×(1 + налог)', () => {
    expect(taxMultiplier('hand', 0.36)).toBe(1);
    expect(taxMultiplier('company', 0.36)).toBeCloseTo(1.36, 10);
  });

  it('ставки и суммы', () => {
    expect(fmtRate(104_900)).toBe('104,9');
    expect(fmtRate(120_000, 1.36)).toBe('163');
    expect(fmtSumK(3_414_400).replace(/\s/g, ' ')).toBe('3 414');
    expect(fmtMln(3_414_400)).toBe('3,41');
  });

  it('проценты и пункты со знаком «−», а не дефисом', () => {
    expect(fmtSignedPct(6.94)).toBe('+6,9%');
    expect(fmtSignedPct(-2)).toBe('−2%');
    expect(fmtSignedPct(0.04)).toBe('0%');
    expect(fmtPp(0.42)).toBe('+0,4 п.п.');
    expect(fmtShare(11)).toBe('11,0');
  });

  it('plural', () => {
    expect([1, 2, 5, 11, 21, 104].map((n) => plural(n, ['найм', 'найма', 'наймов']))).toEqual([
      'найм', 'найма', 'наймов', 'наймов', 'найм', 'найма',
    ]);
  });
});
