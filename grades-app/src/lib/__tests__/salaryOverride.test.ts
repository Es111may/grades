import { beforeEach, describe, expect, it, vi } from 'vitest';

// В тесте базы нет: загрузку записей проверяем на поддельном клиенте
const findMany = vi.fn();
vi.mock('../db', () => ({ prisma: { salaryDisplayOverride: { findMany: (...a: unknown[]) => findMany(...a) } } }));

import {
  buildCompensation,
  plannedRaiseBaseline,
  plannedRaiseState,
  type HrLogRow,
} from '../compensation';
import {
  bridge,
  buildEconomicsDataset,
  econWindow,
  levelRows,
  salaryAt,
  snapshot,
  type GradesOverlay,
  type HrEconomicsRaw,
  type HrEmployeeRaw,
} from '../economics';
import type { HrCompensation } from '../hrSalary';
import {
  displayCompensation,
  displayCompensationFor,
  displayCompensationMap,
  displayEconomics,
  displayLogsByEmail,
  loadDisplayRates,
  ratesForViewer,
  seesActual,
  type DisplayRule,
} from '../salaryOverride';

// Все люди и суммы выдуманы.
const K = 1000;
const TODAY = '2026-11-02';
const OWNER = 1;
const OTHER_ADMIN = 2;
const LEAD = 10;
const SHOWN = 110 * K;

/**
 * Скелет значения: ключи и типы без самих значений — для сравнения формы.
 * Массив — набор различных скелетов его элементов (длина истории у людей
 * разная и сама по себе ничего не выдаёт).
 */
function shapeOf(v: unknown): unknown {
  if (v === null) return 'null';
  if (Array.isArray(v)) {
    const uniq = new Map(v.map((x) => [JSON.stringify(shapeOf(x)), shapeOf(x)]));
    return Array.from(uniq.keys()).sort().map((k) => uniq.get(k));
  }
  if (typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .map((k) => [k, shapeOf((v as Record<string, unknown>)[k])]),
    );
  }
  return typeof v;
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o as object)) deepFreeze(v);
    if (o instanceof Map) for (const v of o.values()) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

// Человек с настоящей историей: найм, два повышения
const REAL: HrCompensation = {
  hr: { salary: 150 * K, hiredAt: '2023-03-01', dismissedAt: null },
  log: [
    { date: '2023-03-01', from: 0, to: 100 * K },
    { date: '2024-06-01', from: 100 * K, to: 130 * K },
    { date: '2026-02-01', from: 130 * K, to: 150 * K },
  ],
};

const comp = (c: HrCompensation, over: Partial<Parameters<typeof buildCompensation>[0]> = {}) =>
  buildCompensation({
    hr: c.hr,
    log: c.log,
    bonuses: [],
    role: 'designer',
    grade: 'middle',
    employmentType: 'staff',
    activeInGrades: true,
    today: TODAY,
    ...over,
  });

// ─── Кто видит как есть ──────────────────────────────────────────────────

describe('ratesForViewer — владелец только сам, без имперсонации', () => {
  const rules: DisplayRule[] = [{ email: ' Person@Ida.Test ', amount: SHOWN, ownerId: OWNER }];

  it('владелец, вошедший сам, видит как есть', () => {
    expect(ratesForViewer(rules, { id: OWNER, impersonatorId: null }).size).toBe(0);
  });
  it('другой админ, лид и без сессии — сумму для показа', () => {
    for (const v of [{ id: OTHER_ADMIN, impersonatorId: null }, { id: LEAD, impersonatorId: null }, null]) {
      expect(ratesForViewer(rules, v).get('person@ida.test')).toBe(SHOWN);
    }
  });
  it('админ вошёл «под» владельцем — сумму для показа', () => {
    expect(ratesForViewer(rules, { id: OWNER, impersonatorId: OTHER_ADMIN }).get('person@ida.test')).toBe(SHOWN);
  });
  it('владелец вошёл «под» другим — видит как тот: сумму для показа', () => {
    expect(ratesForViewer(rules, { id: LEAD, impersonatorId: OWNER }).get('person@ida.test')).toBe(SHOWN);
  });
  it('нет поля impersonatorId — не владелец (закрыто по умолчанию)', () => {
    const v = { id: OWNER } as unknown as { id: number; impersonatorId: number | null };
    expect(seesActual({ ownerId: OWNER }, v)).toBe(false);
  });
  it('владельца нет (удалён) — сумму для показа видят все', () => {
    expect(ratesForViewer([{ ...rules[0], ownerId: null }], { id: OWNER, impersonatorId: null }).size).toBe(1);
  });
  it('мусорная сумма — записи как нет', () => {
    for (const amount of [0, -1, 1.5, NaN]) {
      expect(ratesForViewer([{ ...rules[0], amount }], null).size).toBe(0);
    }
  });
});

describe('loadDisplayRates', () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it('берёт записи из БД и отбирает под зрителя', async () => {
    findMany.mockResolvedValue([{ amount: SHOWN, ownerId: OWNER, user: { email: 'Person@ida.test' } }]);
    expect((await loadDisplayRates({ id: LEAD, impersonatorId: null })).get('person@ida.test')).toBe(SHOWN);
    expect((await loadDisplayRates({ id: OWNER, impersonatorId: null })).size).toBe(0);
  });
  it('БД не ответила — ошибка без подробностей (вызывающие считают её недоступностью HR)', async () => {
    findMany.mockImplementation(async () => {
      throw new Error('Invalid `prisma.salaryDisplayOverride.findMany()` invocation');
    });
    const err = await loadDisplayRates(null).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toMatch(/override|display|salary_/i);
  });
});

// ─── Поп-ап «Зарплата» ───────────────────────────────────────────────────

describe('displayCompensation — одна стартовая ставка с начала истории', () => {
  it('история — одна стартовая ставка на дату найма, без пересмотров', () => {
    const v = comp(displayCompensation(REAL, SHOWN));
    if (v.state !== 'ok') throw new Error(v.state);
    expect(v.current).toBe(SHOWN);
    expect(v.events).toEqual([{ kind: 'hire', date: '2023-03-01', to: SHOWN }]);
    expect(v.lastChange).toBeNull();
    expect(v.since).toEqual({ label: 'с начала года', from: SHOWN, pct: 0, warn: false });
  });

  it('вилка — от суммы для показа (мидл 100–120: в вилке, хотя настоящая выше)', () => {
    const real = comp(REAL);
    const shown = comp(displayCompensation(REAL, SHOWN));
    if (real.state !== 'ok' || shown.state !== 'ok') throw new Error('state');
    expect(real.band?.state).toBe('above');
    expect(shown.band).toEqual({ min: 100 * K, max: 120 * K, state: 'within', overBy: 0 });
    const high = comp(displayCompensation(REAL, 125 * K));
    if (high.state !== 'ok') throw new Error('state');
    expect(high.band).toMatchObject({ state: 'above', overBy: 5 * K });
  });

  it('нанят в этом году — «с найма», рост 0%', () => {
    const c: HrCompensation = {
      hr: { salary: 140 * K, hiredAt: '2026-02-10', dismissedAt: null },
      log: [
        { date: '2026-02-10', from: 0, to: 120 * K },
        { date: '2026-08-01', from: 120 * K, to: 140 * K },
      ],
    };
    const v = comp(displayCompensation(c, SHOWN));
    if (v.state !== 'ok') throw new Error(v.state);
    expect(v.since).toEqual({ label: 'с найма', from: SHOWN, pct: 0, warn: false });
    expect(v.events).toEqual([{ kind: 'hire', date: '2026-02-10', to: SHOWN }]);
  });

  it('журнал начинается с повышения — стартовая ставка встаёт на дату найма', () => {
    const c: HrCompensation = {
      hr: { salary: 130 * K, hiredAt: '2019-05-13', dismissedAt: null },
      log: [{ date: '2022-04-01', from: 90 * K, to: 130 * K }],
    };
    expect(displayCompensation(c, SHOWN).log).toEqual([{ date: '2019-05-13', from: 0, to: SHOWN }]);
    // Даты найма нет — первая запись журнала
    const noHire = { ...c, hr: { ...c.hr!, hiredAt: null } };
    expect(displayCompensation(noHire, SHOWN).log).toEqual([{ date: '2022-04-01', from: 0, to: SHOWN }]);
  });

  it('стартовая «100 → 110» в первую неделю — на дату найма; мусор журнала не в счёт', () => {
    const c: HrCompensation = {
      hr: { salary: 120 * K, hiredAt: '2024-09-02', dismissedAt: null },
      log: [
        { date: '2020-01-01', from: 0, to: 0 },
        { date: '2024-09-05', from: 100 * K, to: 110 * K },
        { date: '2025-09-01', from: 110 * K, to: 120 * K },
      ],
    };
    expect(displayCompensation(c, SHOWN).log).toEqual([{ date: '2024-09-02', from: 0, to: SHOWN }]);
  });

  it('журнала нет — ставка карточки HR, событий нет (как у любого без журнала)', () => {
    const c: HrCompensation = { hr: { salary: 150 * K, hiredAt: '2023-03-01', dismissedAt: null }, log: [] };
    const v = comp(displayCompensation(c, SHOWN));
    if (v.state !== 'ok') throw new Error(v.state);
    expect(v.current).toBe(SHOWN);
    expect(v.events).toEqual([]);
  });

  it('данных нет — как есть: нет в HR, нет ставки, увольнение в HR', () => {
    const none: HrCompensation = { hr: null, log: [] };
    expect(displayCompensation(none, SHOWN)).toBe(none);
    const zero: HrCompensation = { hr: { salary: 0, hiredAt: '2023-03-01', dismissedAt: null }, log: [] };
    expect(displayCompensation(zero, SHOWN)).toBe(zero);
    const junk: HrCompensation = { ...zero, log: [{ date: '2023-03-01', from: 0, to: 0 }] };
    expect(displayCompensation(junk, SHOWN)).toBe(junk);
    // Уволен в HR, работает в Грейдах — то же состояние без цифр
    const left: HrCompensation = { ...REAL, hr: { ...REAL.hr!, dismissedAt: '2026-05-01' } };
    expect(comp(displayCompensation(left, SHOWN))).toEqual(comp(left));
    expect(comp(displayCompensation(left, SHOWN)).state).toBe('hr_dismissed');
  });

  it('записи для зрителя нет — тот же объект', () => {
    expect(displayCompensation(REAL, undefined)).toBe(REAL);
    expect(displayCompensationFor(REAL, 'other@ida.test', new Map([['person@ida.test', SHOWN]]))).toBe(REAL);
  });

  it('форма — как у настоящего человека без пересмотров: те же ключи, типы, виды событий', () => {
    const shown = comp(displayCompensation(REAL, SHOWN), {
      bonuses: [{ id: 5, amount: 20 * K, paidAt: '2025-12-20T00:00:00.000Z', note: null }],
    });
    const neverRaised = comp(
      {
        hr: { salary: 90 * K, hiredAt: '2022-07-11', dismissedAt: null },
        log: [{ date: '2022-07-11', from: 0, to: 90 * K }],
      },
      { bonuses: [{ id: 6, amount: 10 * K, paidAt: '2025-06-01T00:00:00.000Z', note: null }] },
    );
    expect(shapeOf(shown)).toEqual(shapeOf(neverRaised));
    // Ключи верхнего уровня — те же, что у настоящего вида этого же человека
    expect(Object.keys(shown).sort()).toEqual(Object.keys(comp(REAL)).sort());
    expect(JSON.stringify(shown)).not.toMatch(/override|display|substitut|actual/i);
  });

  it('кэш не трогаем: исходный объект не меняется', () => {
    const frozen = deepFreeze(structuredClone(REAL));
    expect(() => displayCompensation(frozen, SHOWN)).not.toThrow();
    expect(frozen).toEqual(REAL);
  });
});

// ─── Плановый пересмотр ──────────────────────────────────────────────────

describe('плановый пересмотр на виде с подменой', () => {
  // База — по данным HR как есть (так её ставит PUT planned-raise)
  const baseline = plannedRaiseBaseline(REAL.log.slice(0, 2), REAL.hr!.hiredAt);
  const planned = { setAt: '2025-01-15T09:00:00.000Z', baselineAt: `${baseline}T00:00:00.000Z` };

  it('настоящее повышение после базы: владельцу «выполнен», остальным — нет', () => {
    expect(baseline).toBe('2024-06-01');
    expect(plannedRaiseState(planned, REAL.log, REAL.hr!.hiredAt)).toBe('done');
    const shown = displayCompensation(REAL, SHOWN);
    expect(plannedRaiseState(planned, shown.log, shown.hr!.hiredAt)).toBe('active');
  });
  it('старый статус без базы — тоже не выполнен', () => {
    const shown = displayCompensation(REAL, SHOWN);
    expect(plannedRaiseState({ setAt: '2025-01-15', baselineAt: null }, shown.log, shown.hr!.hiredAt)).toBe('active');
  });
  it('журналы лида (fetchHrLogsByEmail): только у человека с записью', () => {
    const logs = new Map<string, { hiredAt: string | null; log: HrLogRow[] }>([
      ['person@ida.test', { hiredAt: REAL.hr!.hiredAt, log: REAL.log }],
      ['other@ida.test', { hiredAt: '2024-01-01', log: [{ date: '2025-01-01', from: 80 * K, to: 90 * K }] }],
    ]);
    deepFreeze(logs);
    const out = displayLogsByEmail(logs, new Map([['person@ida.test', SHOWN]]));
    expect(out.get('person@ida.test')!.log).toEqual([{ date: '2023-03-01', from: 0, to: SHOWN }]);
    expect(out.get('other@ida.test')).toBe(logs.get('other@ida.test'));
    expect(plannedRaiseState(planned, out.get('person@ida.test')!.log, REAL.hr!.hiredAt)).toBe('active');
  });
});

// ─── «Команда»: батч ─────────────────────────────────────────────────────

describe('displayCompensationMap — колонка «Зарплата»', () => {
  const other: HrCompensation = {
    hr: { salary: 95 * K, hiredAt: '2024-01-15', dismissedAt: null },
    log: [{ date: '2024-01-15', from: 0, to: 95 * K }],
  };
  const batch = deepFreeze(
    new Map<string, HrCompensation>([
      ['person@ida.test', structuredClone(REAL)],
      ['other@ida.test', other],
      ['nohr@ida.test', { hr: null, log: [] }],
    ]),
  );

  it('меняется только человек с записью; остальные — те же объекты', () => {
    const out = displayCompensationMap(batch, new Map([['person@ida.test', SHOWN]]));
    expect(comp(out.get('person@ida.test')!)).toMatchObject({ state: 'ok', current: SHOWN });
    expect(out.get('other@ida.test')).toBe(other);
    expect(out.get('nohr@ida.test')).toBe(batch.get('nohr@ida.test'));
    expect(batch.get('person@ida.test')).toEqual(REAL);
  });
  it('у владельца — как есть', () => {
    const rates = ratesForViewer([{ email: 'person@ida.test', amount: SHOWN, ownerId: OWNER }], {
      id: OWNER,
      impersonatorId: null,
    });
    expect(comp(displayCompensationMap(batch, rates).get('person@ida.test')!)).toMatchObject({ current: 150 * K });
  });
});

// ─── «Экономика» ─────────────────────────────────────────────────────────

function emp(over: Partial<HrEmployeeRaw>): HrEmployeeRaw {
  return {
    id: 'e1',
    email: 'person@ida.test',
    firstName: 'Тест',
    lastName: 'Тестов',
    positionId: '9',
    department: '',
    hiredAt: '2023-03-01',
    dismissedAt: null,
    archived: false,
    salary: 150 * K,
    reasonId: null,
    subId: null,
    ...over,
  };
}

function overlay(over: Partial<GradesOverlay>): GradesOverlay {
  return {
    email: 'person@ida.test',
    fullName: 'Тест Тестов',
    role: 'designer',
    department: 'Криэйт',
    buildCode: null,
    employmentType: 'staff',
    active: true,
    hiredAt: '2023-03-01T00:00:00.000Z',
    dismissedAt: null,
    grade: 'middle',
    avatarUrl: null,
    dismissalType: null,
    dismissalReason: null,
    plannedRaise: null,
    ...over,
  };
}

const RAW: HrEconomicsRaw = {
  employees: [
    emp({}),
    emp({ id: 'e2', email: 'other@ida.test', hiredAt: '2024-01-15', salary: 105 * K }),
    emp({ id: 'e3', email: 'zero@ida.test', hiredAt: '2025-02-01', salary: 0 }),
  ],
  designWorkingEmails: ['person@ida.test', 'other@ida.test'],
  logs: [
    { employeeId: 'e1', date: '2023-03-01', from: 0, to: 100 * K },
    { employeeId: 'e2', date: '2024-01-15', from: 0, to: 95 * K },
    { employeeId: 'e1', date: '2024-06-01', from: 100 * K, to: 130 * K },
    { employeeId: 'e2', date: '2026-03-01', from: 95 * K, to: 105 * K },
    { employeeId: 'e1', date: '2026-02-01', from: 130 * K, to: 150 * K },
  ],
  reasons: [],
  subs: [],
  company: { fotByMonth: { '2026-10': 5_000 * K }, headcountByMonth: {}, exitsByMonth: {} },
  fetchedAt: '2026-11-02T07:00:00.000Z',
};

const GRADES = [
  overlay({
    plannedRaise: {
      setAt: '2025-01-15T09:00:00.000Z',
      baselineAt: '2024-06-01T00:00:00.000Z',
      at: '2026-12-01T00:00:00.000Z',
      salary: 125 * K,
    },
  }),
  overlay({ email: 'other@ida.test', fullName: 'Другой Тестов', hiredAt: '2024-01-15T00:00:00.000Z' }),
  overlay({ email: 'zero@ida.test', fullName: 'Ноль Тестов', hiredAt: '2025-02-01T00:00:00.000Z' }),
  overlay({ email: 'nohr@ida.test', fullName: 'Нет Вхр' }),
];

describe('displayEconomics — «Экономика» от суммы для показа', () => {
  const W = econWindow(TODAY);
  const rates = new Map([['person@ida.test', SHOWN]]);
  const real = buildEconomicsDataset({ raw: RAW, grades: GRADES, today: TODAY });
  const frozen = deepFreeze(structuredClone(RAW));
  const shown = buildEconomicsDataset({ raw: displayEconomics(frozen, rates), grades: GRADES, today: TODAY });
  const pick = (ds: typeof real, name: string) => ds.people.find((p) => p.name === name)!;

  it('ставка постоянная с начала истории; остальные люди — как есть', () => {
    const p = pick(shown, 'Тест Тестов');
    expect(p.steps).toEqual([{ date: '2023-03-01', salary: SHOWN }]);
    for (const d of ['2023-03-01', '2025-01-01', TODAY]) expect(salaryAt(p, d)).toBe(SHOWN);
    expect(p.noHistory).toBe(false);
    expect(pick(shown, 'Другой Тестов')).toEqual(pick(real, 'Другой Тестов'));
    expect(frozen).toEqual(RAW);
  });

  it('ФОТ, медиана, разложение роста и уровни — от суммы для показа', () => {
    expect(snapshot(shown.people, TODAY).fot).toBe(SHOWN + 105 * K);
    expect(snapshot(real.people, TODAY).fot).toBe(150 * K + 105 * K);
    const b = bridge(shown.people, W);
    expect(b.raiseCount).toBe(1); // только «Другой»: у человека с записью роста нет
    const row = levelRows(shown.people, W).find((r) => r.key === 'middle')!;
    expect(row.people.find((x) => x.p.name === 'Тест Тестов')).toMatchObject({ salary: SHOWN, jan1: SHOWN, state: 'within' });
  });

  it('плановый пересмотр не «выполнен» настоящим повышением', () => {
    expect(pick(real, 'Тест Тестов').planned).toBeNull();
    expect(pick(shown, 'Тест Тестов').planned).toEqual({ at: '2026-12-01', salary: 125 * K });
  });

  it('без данных — как есть: нет в HR, нулевая ставка без журнала', () => {
    const r = new Map([
      ['nohr@ida.test', SHOWN],
      ['zero@ida.test', SHOWN],
    ]);
    const ds = buildEconomicsDataset({ raw: displayEconomics(RAW, r), grades: GRADES, today: TODAY });
    expect(ds).toEqual(real);
    expect(displayEconomics(RAW, new Map())).toBe(RAW);
  });

  it('несколько записей HR (возвращение) — одна ступень', () => {
    const raw: HrEconomicsRaw = {
      ...RAW,
      employees: [
        emp({ id: 'old', hiredAt: '2021-04-05', dismissedAt: '2022-08-01', archived: true, salary: 0 }),
        emp({ id: 'e1' }),
      ],
      logs: [
        { employeeId: 'old', date: '2021-04-05', from: 0, to: 70 * K },
        { employeeId: 'old', date: '2022-01-10', from: 70 * K, to: 80 * K },
        ...RAW.logs.filter((l) => l.employeeId === 'e1'),
      ],
    };
    const ds = buildEconomicsDataset({ raw: displayEconomics(raw, rates), grades: [GRADES[0]], today: TODAY });
    expect(ds.people[0].steps).toEqual([{ date: '2021-04-05', salary: SHOWN }]);
  });

  it('форма людей и набора — та же: ключи и типы как у настоящих данных', () => {
    // Человек с записью — как настоящий человек с активным пересмотром
    const plannedOther = buildEconomicsDataset({
      raw: RAW,
      grades: [
        overlay({
          email: 'other@ida.test',
          fullName: 'Другой Тестов',
          plannedRaise: { setAt: '2026-10-01', baselineAt: '2026-03-01', at: null, salary: 120 * K },
        }),
      ],
      today: TODAY,
    }).people[0];
    expect(shapeOf(pick(shown, 'Тест Тестов'))).toEqual(shapeOf({ ...plannedOther, planned: { at: 's', salary: 1 } }));
    expect(Object.keys(shown).sort()).toEqual(Object.keys(real).sort());
    expect(shapeOf(shown.notes)).toEqual(shapeOf(real.notes));
    expect(shown.notes).toEqual(real.notes);
    expect(shown.company).toEqual(real.company);
    expect(JSON.stringify(shown)).not.toMatch(/override|display|substitut|actual/i);
  });
});
