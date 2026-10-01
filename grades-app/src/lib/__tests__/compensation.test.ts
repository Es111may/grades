import { describe, it, expect } from 'vitest';
import {
  buildCompensation,
  formatPct,
  formatThousands,
  groupEventsByYear,
  NO_RAISES_BASELINE,
  pctChange,
  plannedRaiseBaseline,
  plannedRaiseState,
  shouldRestartPlan,
  type HrLogRow,
} from '../compensation';
import { bandFor, bandState } from '../salaryBands';
import { canEditBonuses, canEditPlannedRaise, canViewCompensation } from '../compPermissions';

const TODAY = '2026-09-29';
const K = 1000;
const base = {
  bonuses: [],
  role: 'designer',
  grade: 'middle',
  employmentType: 'staff',
  activeInGrades: true,
  today: TODAY,
};
const hr = (salary: number, hiredAt: string, dismissedAt: string | null = null) => ({
  salary,
  hiredAt,
  dismissedAt,
});
const ok = (v: ReturnType<typeof buildCompensation>) => {
  if (v.state !== 'ok') throw new Error(`ожидали ok, получили ${v.state}`);
  return v;
};

describe('buildCompensation — состояния', () => {
  it('нет в HR — «no_hr»', () => {
    expect(buildCompensation({ ...base, hr: null, log: [] }).state).toBe('no_hr');
  });

  it('в HR уволен, а в Грейдах работает — старые цифры не показываем', () => {
    const v = buildCompensation({ ...base, hr: hr(120 * K, '2025-04-21', '2026-02-06'), log: [] });
    expect(v).toEqual({ state: 'hr_dismissed', dismissedAt: '2026-02-06' });
  });

  it('уволен и там, и там — показываем последние данные', () => {
    const v = buildCompensation({
      ...base,
      activeInGrades: false,
      hr: hr(120 * K, '2025-04-21', '2026-02-06'),
      log: [],
    });
    expect(ok(v).current).toBe(120 * K);
  });

  it('пустая дата увольнения из ClickHouse (1970-01-01) — не увольнение', () => {
    const v = buildCompensation({ ...base, hr: hr(90 * K, '2024-01-10', '1970-01-01'), log: [] });
    expect(v.state).toBe('ok');
  });
});

describe('buildCompensation — ставка и история', () => {
  it('изменение в день найма — стартовая ставка, а не повышение', () => {
    const log: HrLogRow[] = [{ date: '2026-08-03', from: 100 * K, to: 110 * K }];
    const v = ok(buildCompensation({ ...base, hr: hr(110 * K, '2026-08-03'), log }));
    expect(v.current).toBe(110 * K);
    expect(v.events).toEqual([{ kind: 'hire', date: '2026-08-03', to: 110 * K }]);
    expect(v.lastChange).toBeNull();
    expect(v.since).toMatchObject({ label: 'с найма', from: 110 * K, pct: 0 });
  });

  it('повышение после испыталки: текущая ставка, последний пересмотр, рост с найма', () => {
    const log: HrLogRow[] = [{ date: '2026-09-01', from: 120 * K, to: 130 * K }];
    const v = ok(buildCompensation({ ...base, hr: hr(130 * K, '2026-06-09'), log }));
    expect(v.current).toBe(130 * K);
    expect(v.lastChange).toEqual({ date: '2026-09-01', delta: 10 * K });
    expect(v.since?.label).toBe('с найма');
    expect(v.since?.from).toBe(120 * K);
    expect(v.since?.pct).toBeCloseTo(8.33, 1);
  });

  it('запись с датой в будущем — «вступит в силу», в текущую ставку не входит', () => {
    const log: HrLogRow[] = [
      { date: '2025-03-01', from: 90 * K, to: 100 * K },
      { date: '2026-12-01', from: 100 * K, to: 115 * K },
    ];
    const v = ok(buildCompensation({ ...base, hr: hr(100 * K, '2024-01-10'), log }));
    expect(v.current).toBe(100 * K);
    expect(v.events[0]).toMatchObject({ kind: 'raise', date: '2026-12-01', future: true });
    expect(v.lastChange?.date).toBe('2025-03-01');
  });

  it('без журнала — ставка из карточки HR, роста нет', () => {
    const v = ok(buildCompensation({ ...base, hr: hr(70 * K, '2025-06-17'), log: [] }));
    expect(v.current).toBe(70 * K);
    expect(v.events).toEqual([]);
    expect(v.since).toMatchObject({ label: 'с начала года', pct: 0 });
  });

  it('с начала года: база — ставка, действовавшая на 1 января', () => {
    const log: HrLogRow[] = [
      { date: '2025-06-01', from: 90 * K, to: 100 * K },
      { date: '2026-06-01', from: 100 * K, to: 115 * K },
    ];
    const v = ok(buildCompensation({ ...base, hr: hr(115 * K, '2023-03-01'), log }));
    expect(v.since).toMatchObject({ label: 'с начала года', from: 100 * K });
    expect(v.since?.pct).toBeCloseTo(15, 5);
  });

  it('рост больше 30% за период — предупреждение', () => {
    const log: HrLogRow[] = [{ date: '2026-04-01', from: 90 * K, to: 130 * K }];
    const v = ok(buildCompensation({ ...base, hr: hr(130 * K, '2024-02-01'), log }));
    expect(v.since?.warn).toBe(true);
  });

  it('снижение ставки — отдельный тип', () => {
    const log: HrLogRow[] = [{ date: '2026-05-01', from: 120 * K, to: 100 * K }];
    const v = ok(buildCompensation({ ...base, hr: hr(100 * K, '2024-02-01'), log }));
    expect(v.events[0]).toMatchObject({ kind: 'decrease', delta: -20 * K });
  });

  it('премии — в истории, но ставку и рост не трогают', () => {
    const log: HrLogRow[] = [{ date: '2026-06-01', from: 100 * K, to: 115 * K }];
    const v = ok(
      buildCompensation({
        ...base,
        hr: hr(115 * K, '2023-03-01'),
        log,
        bonuses: [{ id: 7, amount: 50 * K, paidAt: '2026-03-12T00:00:00.000Z', note: 'разовая' }],
      }),
    );
    expect(v.current).toBe(115 * K);
    expect(v.events.map((e) => e.kind)).toEqual(['raise', 'bonus']);
    expect(v.since?.pct).toBeCloseTo(15, 5);
  });

  it('записи «ставка не изменилась» в истории не показываем', () => {
    const log: HrLogRow[] = [{ date: '2026-02-01', from: 100 * K, to: 100 * K }];
    const v = ok(buildCompensation({ ...base, hr: hr(100 * K, '2023-03-01'), log }));
    expect(v.events).toEqual([]);
  });
});

describe('buildCompensation — грязный журнал HR', () => {
  it('точный дубль строки — одно событие, а не два повышения', () => {
    const log: HrLogRow[] = [
      { date: '2026-03-01', from: 100 * K, to: 110 * K },
      // Та же дата (время другое — сравниваем по дню) и те же суммы
      { date: '2026-03-01T12:00:00', from: 100 * K, to: 110 * K },
    ];
    const v = ok(buildCompensation({ ...base, hr: hr(110 * K, '2024-02-01'), log }));
    expect(v.events).toHaveLength(1);
    expect(v.events[0]).toMatchObject({ kind: 'raise', date: '2026-03-01', delta: 10 * K });
    expect(v.current).toBe(110 * K);
    expect(v.since).toMatchObject({ label: 'с начала года', from: 100 * K });
  });

  it('не дубль: та же дата, но другие суммы — обе строки остаются', () => {
    const log: HrLogRow[] = [
      { date: '2026-03-01', from: 100 * K, to: 110 * K },
      { date: '2026-03-01', from: 110 * K, to: 120 * K },
    ];
    const v = ok(buildCompensation({ ...base, hr: hr(120 * K, '2024-02-01'), log }));
    expect(v.events).toHaveLength(2);
  });

  it('дубль стартовой ставки — одна запись о найме (правило 7 дней)', () => {
    const log: HrLogRow[] = [
      { date: '2026-08-03', from: 100 * K, to: 110 * K },
      { date: '2026-08-03', from: 100 * K, to: 110 * K },
    ];
    const v = ok(buildCompensation({ ...base, hr: hr(110 * K, '2026-08-03'), log }));
    expect(v.events).toEqual([{ kind: 'hire', date: '2026-08-03', to: 110 * K }]);
    expect(v.lastChange).toBeNull();
  });

  it('строка «→ 0» — не ставка: нет «110 → 0 · −100%», текущая остаётся прежней', () => {
    const log: HrLogRow[] = [
      { date: '2025-05-01', from: 100 * K, to: 110 * K },
      { date: '2026-04-01', from: 110 * K, to: 0 },
    ];
    const v = ok(buildCompensation({ ...base, hr: hr(110 * K, '2024-02-01'), log }));
    expect(v.current).toBe(110 * K);
    expect(v.events).toHaveLength(1);
    expect(v.events[0]).toMatchObject({ kind: 'raise', date: '2025-05-01', to: 110 * K });
    expect(v.events.some((e) => e.kind === 'decrease')).toBe(false);
    expect(v.lastChange).toEqual({ date: '2025-05-01', delta: 10 * K });
    expect(v.since).toMatchObject({ label: 'с начала года', from: 110 * K, pct: 0 });
  });

  it('только строки «→ 0» — ставка из карточки HR', () => {
    const log: HrLogRow[] = [{ date: '2026-04-01', from: 90 * K, to: 0 }];
    const v = ok(buildCompensation({ ...base, hr: hr(90 * K, '2024-02-01'), log }));
    expect(v.current).toBe(90 * K);
    expect(v.events).toEqual([]);
    expect(v.lastChange).toBeNull();
  });

  it('отрицательная сумма «to» — тоже не ставка', () => {
    const log: HrLogRow[] = [{ date: '2026-04-01', from: 90 * K, to: -1 }];
    const v = ok(buildCompensation({ ...base, hr: hr(90 * K, '2024-02-01'), log }));
    expect(v.current).toBe(90 * K);
    expect(v.events).toEqual([]);
  });
});

describe('вилки и цвет', () => {
  it('выше вилки — красный, с суммой превышения', () => {
    const v = ok(buildCompensation({ ...base, hr: hr(130 * K, '2023-03-01'), log: [] }));
    expect(v.band).toMatchObject({ state: 'above', overBy: 10 * K });
  });
  it('в вилке и ниже — зелёный (ниже тревогой не считается)', () => {
    expect(bandState(110 * K, { min: 100 * K, max: 120 * K })).toBe('within');
    expect(bandState(90 * K, { min: 100 * K, max: 120 * K })).toBe('below');
  });
  it('лид и стардиз — по роли, дизайнер — по грейду', () => {
    expect(bandFor({ role: 'lead', grade: null })).toEqual({ min: 160 * K, max: 240 * K });
    expect(bandFor({ role: 'stardiz', grade: 'middle' })).toEqual({ min: 140 * K, max: 180 * K });
    expect(bandFor({ role: 'designer', grade: 'premiddle' })).toEqual({ min: 75 * K, max: 100 * K });
  });
  it('без грейда и у почасовщика вилки нет', () => {
    expect(bandFor({ role: 'designer', grade: null })).toBeNull();
    expect(bandFor({ role: 'designer', grade: 'middle', employmentType: 'hourly' })).toBeNull();
    const v = ok(
      buildCompensation({ ...base, employmentType: 'hourly', hr: hr(120 * K, '2023-03-01'), log: [] }),
    );
    expect(v.band).toBeNull();
    expect(v.hourly).toBe(true);
  });
});

describe('plannedRaiseState', () => {
  const log: HrLogRow[] = [{ date: '2026-09-01', from: 120 * K, to: 130 * K }];
  it('статус не ставили — none', () => {
    expect(plannedRaiseState({ setAt: null }, log, '2024-01-01')).toBe('none');
  });
  it('повышение в HR после постановки статуса — выполнен', () => {
    expect(plannedRaiseState({ setAt: '2026-08-15T10:00:00Z' }, log, '2024-01-01')).toBe('done');
  });
  it('будущее утверждённое повышение тоже закрывает статус', () => {
    const fut: HrLogRow[] = [{ date: '2026-12-01', from: 130 * K, to: 145 * K }];
    expect(plannedRaiseState({ setAt: '2026-09-20T10:00:00Z' }, fut, '2024-01-01')).toBe('done');
  });
  it('повышение до постановки статуса не считается', () => {
    expect(plannedRaiseState({ setAt: '2026-09-10T10:00:00Z' }, log, '2024-01-01')).toBe('active');
  });
  it('стартовая ставка при найме не закрывает статус', () => {
    const hire: HrLogRow[] = [{ date: '2026-08-03', from: 100 * K, to: 110 * K }];
    expect(plannedRaiseState({ setAt: '2026-08-01T10:00:00Z' }, hire, '2026-08-03')).toBe('active');
  });
});

describe('новый плановый пересмотр после выполненного', () => {
  it('shouldRestartPlan: нет статуса или выполнен — новый; активный — уточняем', () => {
    expect(shouldRestartPlan('none')).toBe(true);
    expect(shouldRestartPlan('done')).toBe(true);
    expect(shouldRestartPlan('active')).toBe(false);
  });
  it('shouldRestartPlan: HR недоступен — новый только по явному fresh', () => {
    expect(shouldRestartPlan(null)).toBe(false);
    expect(shouldRestartPlan(null, true)).toBe(true);
    expect(shouldRestartPlan('active', true)).toBe(true);
  });

  const hired = '2024-01-01';
  it('после выполненного: база — повышение, закрывшее прежний статус; новый им не закрыт', () => {
    const log: HrLogRow[] = [{ date: '2026-09-01', from: 120 * K, to: 130 * K }];
    // Прежний статус (без базы, от 15.08) закрыт этим повышением
    expect(plannedRaiseState({ setAt: '2026-08-15T10:00:00Z' }, log, hired)).toBe('done');
    const baselineAt = plannedRaiseBaseline(log, hired);
    expect(baselineAt).toBe('2026-09-01');
    const next = { setAt: '2026-09-30T12:00:00Z', baselineAt };
    expect(plannedRaiseState(next, log, hired)).toBe('active');
    // Следующее повышение закрывает новый статус как обычно
    const more = [...log, { date: '2027-03-01', from: 130 * K, to: 145 * K }];
    expect(plannedRaiseState(next, more, hired)).toBe('done');
  });
  it('будущее повышение, внесённое заранее («с 1-го»), — в базе, новый им не закрыт', () => {
    const log: HrLogRow[] = [
      { date: '2026-09-01', from: 110 * K, to: 120 * K },
      { date: '2026-10-01', from: 120 * K, to: 130 * K },
    ];
    const baselineAt = plannedRaiseBaseline(log, hired);
    expect(baselineAt).toBe('2026-10-01');
    expect(plannedRaiseState({ setAt: '2026-09-30T12:00:00Z', baselineAt }, log, hired)).toBe('active');
  });
  it('будущее снижение и стартовая ставка базу не сдвигают', () => {
    const log: HrLogRow[] = [
      { date: '2026-03-01', from: 110 * K, to: 120 * K },
      { date: '2026-10-01', from: 130 * K, to: 120 * K },
    ];
    expect(plannedRaiseBaseline(log, hired)).toBe('2026-03-01');
    const onlyHire: HrLogRow[] = [{ date: '2026-10-05', from: 100 * K, to: 110 * K }];
    expect(plannedRaiseBaseline(onlyHire, '2026-10-05')).toBe(NO_RAISES_BASELINE);
    expect(plannedRaiseBaseline([], null)).toBe(NO_RAISES_BASELINE);
  });
});

describe('плановый пересмотр: повышение задним числом', () => {
  const hired = '2024-01-01';
  // Статус поставили 03.10; HR знал только повышение от 01.03
  const known: HrLogRow[] = [{ date: '2026-03-01', from: 110 * K, to: 120 * K }];
  const baselineAt = plannedRaiseBaseline(known, hired);
  const plan = { setAt: '2026-10-03T09:00:00Z', baselineAt };
  // 10.10 HR вносит повышение «с 01.10» — дата раньше постановки
  const retro = [...known, { date: '2026-10-01', from: 120 * K, to: 135 * K }];

  it('повышение с датой раньше постановки, но после базы — выполнен', () => {
    expect(plannedRaiseState(plan, known, hired)).toBe('active');
    expect(plannedRaiseState(plan, retro, hired)).toBe('done');
  });
  it('старый статус без базы — прежнее правило: такое повышение не закрывает', () => {
    expect(plannedRaiseState({ setAt: plan.setAt }, retro, hired)).toBe('active');
    expect(plannedRaiseState({ setAt: plan.setAt, baselineAt: null }, retro, hired)).toBe('active');
    const after = [...known, { date: '2026-10-03', from: 120 * K, to: 135 * K }];
    expect(plannedRaiseState({ setAt: plan.setAt, baselineAt: null }, after, hired)).toBe('done');
  });
  it('повышение, которое HR уже знал (дата = база), новый статус не закрывает', () => {
    const fresh = { setAt: '2026-10-03T09:00:00Z', baselineAt: plannedRaiseBaseline(retro, hired) };
    expect(fresh.baselineAt).toBe('2026-10-01');
    expect(plannedRaiseState(fresh, retro, hired)).toBe('active');
  });
  it('повышений не было — первое же, даже задним числом, закрывает статус', () => {
    const hire: HrLogRow[] = [{ date: '2026-03-02', from: 90 * K, to: 100 * K }];
    const first = { setAt: '2026-10-03T09:00:00Z', baselineAt: plannedRaiseBaseline(hire, '2026-03-02') };
    expect(first.baselineAt).toBe(NO_RAISES_BASELINE);
    expect(plannedRaiseState(first, hire, '2026-03-02')).toBe('active');
    const raised = [...hire, { date: '2026-10-01', from: 100 * K, to: 115 * K }];
    expect(plannedRaiseState(first, raised, '2026-03-02')).toBe('done');
  });
  it('стартовая ставка при найме после базы статус не закрывает', () => {
    const plan2 = { setAt: '2026-08-01T10:00:00Z', baselineAt: NO_RAISES_BASELINE };
    const hire: HrLogRow[] = [{ date: '2026-08-03', from: 100 * K, to: 110 * K }];
    expect(plannedRaiseState(plan2, hire, '2026-08-03')).toBe('active');
  });
  it('будущее утверждённое повышение после базы тоже закрывает', () => {
    const fut = [...known, { date: '2026-12-01', from: 120 * K, to: 140 * K }];
    expect(plannedRaiseState(plan, fut, hired)).toBe('done');
  });
  it('снижение после базы не закрывает', () => {
    const down = [...known, { date: '2026-10-01', from: 120 * K, to: 110 * K }];
    expect(plannedRaiseState(plan, down, hired)).toBe('active');
  });
  it('база с временем (как из БД) сравнивается по дню', () => {
    const db = { setAt: plan.setAt, baselineAt: '2026-10-01T00:00:00.000Z' };
    expect(plannedRaiseState(db, retro, hired)).toBe('active');
    const later = [...retro, { date: '2026-10-02', from: 135 * K, to: 140 * K }];
    expect(plannedRaiseState(db, later, hired)).toBe('done');
  });
  it('без статуса база не важна — none', () => {
    expect(plannedRaiseState({ setAt: null, baselineAt: NO_RAISES_BASELINE }, retro, hired)).toBe('none');
  });
});

describe('formatThousands', () => {
  it('целые тысячи — без дробей, иначе один знак', () => {
    expect(formatThousands(130 * K)).toBe('130');
    expect(formatThousands(104939)).toBe('104,9');
  });
});

describe('проценты «было → стало»', () => {
  it('рост и снижение от прежней ставки; без прежней — null', () => {
    expect(pctChange(110 * K, 140 * K)).toBeCloseTo(27.27, 1);
    expect(pctChange(120 * K, 100 * K)).toBeCloseTo(-16.67, 1);
    expect(pctChange(0, 100 * K)).toBeNull();
  });
  it('плановый пересмотр — процент к текущей ставке', () => {
    expect(formatPct(pctChange(140 * K, 145 * K)!)).toBe('+4%');
  });
  it('формат: знак, типографский минус, меньше процента — с десятыми', () => {
    expect(formatPct(27.27)).toBe('+27%');
    expect(formatPct(-16.67)).toBe('−17%');
    expect(formatPct(0.5)).toBe('+0,5%');
    expect(formatPct(0.96)).toBe('+1%');
    expect(formatPct(0.01)).toBe('0%');
    expect(formatPct(0)).toBe('0%');
  });
});

describe('groupEventsByYear', () => {
  it('подряд идущие события одного года — одна группа, порядок сохраняется', () => {
    const g = groupEventsByYear([
      { date: '2026-09-01' },
      { date: '2026-03-01' },
      { date: '2025-12-15' },
      { date: '2024-06-01' },
    ]);
    expect(g.map((x) => [x.year, x.events.length])).toEqual([
      ['2026', 2],
      ['2025', 1],
      ['2024', 1],
    ]);
    expect(g[0].events[1].date).toBe('2026-03-01');
  });
  it('пустая история — пустой список групп', () => {
    expect(groupEventsByYear([])).toEqual([]);
  });
});

describe('права на компенсации', () => {
  const target = { id: 30, leadId: 10 };
  it('админ видит всех и вносит премии', () => {
    expect(canViewCompensation({ id: 1, role: 'admin' }, target)).toBe(true);
    expect(canEditBonuses({ id: 1, role: 'admin' })).toBe(true);
  });
  it('лид видит и планирует пересмотр своим, но не вносит премии', () => {
    expect(canViewCompensation({ id: 10, role: 'lead' }, target)).toBe(true);
    expect(canEditPlannedRaise({ id: 10, role: 'lead' }, target)).toBe(true);
    expect(canEditBonuses({ id: 10, role: 'lead' })).toBe(false);
  });
  it('чужой лид — ничего', () => {
    expect(canViewCompensation({ id: 11, role: 'lead' }, target)).toBe(false);
  });
  it('стардиз и дизайнер — ничего, даже о себе', () => {
    expect(canViewCompensation({ id: 20, role: 'stardiz' }, { id: 30, leadId: 20 })).toBe(false);
    expect(canViewCompensation({ id: 30, role: 'designer' }, target)).toBe(false);
  });
  it('без сессии — ничего', () => {
    expect(canViewCompensation(null, target)).toBe(false);
    expect(canEditBonuses(null)).toBe(false);
  });
});
