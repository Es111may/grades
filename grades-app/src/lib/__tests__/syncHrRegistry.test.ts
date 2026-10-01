import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

// Скрипт тянет Prisma и ClickHouse — в тесте ни того, ни другого: запись
// идёт в поддельный клиент, отчёт — в перехваченный console.log.
vi.mock('../db', () => ({ prisma: {} }));
vi.mock('../clickhouse', () => ({ chQuery: vi.fn() }));

import { applyPlan, parseArgs, printReport } from '../../../scripts/sync-hr-registry';
import { planRegistrySync, type HrPerson } from '../hrRegistry';

// Все люди и адреса выдуманы.
const hr: HrPerson[] = [
  {
    id: 'hr-gone',
    email: 'Gone@Example.test',
    firstNameRu: 'Ольга',
    lastNameRu: 'Ушедшая',
    positionId: 20,
    department: 'Improve',
    hiredAt: '2021-02-01',
    dismissedAt: '2025-06-30',
    isArchive: 0,
    isHourly: 0,
  },
  {
    id: 'hr-past',
    email: 'past@example.test',
    firstNameRu: 'Иван',
    lastNameRu: 'Прошлый',
    positionId: 9,
    department: 'Самолет',
    hiredAt: '2020-01-10',
    dismissedAt: '2025-03-01',
    isArchive: 1,
    isHourly: 1,
  },
  // Вне контура: Lite и дизайн-инженер — только счётчики
  {
    id: 'hr-lite',
    email: 'lite@example.test',
    firstNameRu: 'Лев',
    lastNameRu: 'Лайтовый',
    positionId: 9,
    department: 'Lite',
    hiredAt: '2022-01-10',
    dismissedAt: '2025-08-01',
    isArchive: 1,
    isHourly: 0,
  },
  {
    id: 'hr-eng',
    email: 'eng@example.test',
    firstNameRu: 'Инна',
    lastNameRu: 'Инженерная',
    positionId: 29,
    department: 'Create',
    hiredAt: '2024-01-10',
    dismissedAt: '1970-01-01',
    isArchive: 0,
    isHourly: 0,
  },
  // Активная в декрете — не заводим
  {
    id: 'hr-mat',
    email: 'mat@example.test',
    firstNameRu: 'Мила',
    lastNameRu: 'Декретная',
    positionId: 9,
    department: 'Improve',
    hiredAt: '2022-06-01',
    dismissedAt: '1970-01-01',
    isArchive: 0,
    isHourly: 0,
    maternityLeave: 1,
  },
  {
    id: 'hr-old',
    email: 'old@example.test',
    firstNameRu: 'Давний',
    lastNameRu: 'Уход',
    positionId: 9,
    department: 'Самолет',
    hiredAt: '2019-04-01',
    dismissedAt: '2023-11-30',
    isArchive: 1,
    isHourly: 0,
  },
  {
    id: 'hr-new',
    email: 'new@example.test',
    firstNameRu: 'Новая',
    lastNameRu: 'Активная',
    positionId: 9,
    department: 'Create',
    hiredAt: '2026-09-01',
    dismissedAt: '1970-01-01',
    isArchive: 0,
    isHourly: 0,
  },
  {
    id: 'hr-cur',
    email: 'cur@example.test',
    firstNameRu: 'Нынешний',
    lastNameRu: 'Дизайнер',
    positionId: 9,
    department: 'Create',
    hiredAt: '2023-05-02',
    dismissedAt: '1970-01-01',
    isArchive: 0,
    isHourly: 0,
  },
];
const users = [
  { id: 7, email: 'cur@example.test', fullName: 'Нынешний Дизайнер', active: true, hiredAt: null, dismissedAt: null },
];
const plan = planRegistrySync({ hr, users, excluded: [], options: { today: '2026-10-01' } });

/** Поддельный клиент: транзакция сразу зовёт колбэк, вызовы копятся. */
function fakeDb() {
  const calls: Record<string, unknown[]> = {};
  const rec = (name: string, result: unknown) => (arg: unknown) => {
    (calls[name] ??= []).push(arg);
    return Promise.resolve(typeof result === 'function' ? (result as (a: unknown) => unknown)(arg) : result);
  };
  const tx = {
    user: {
      createMany: rec('user.createMany', (a: { data: unknown[] }) => ({ count: a.data.length })),
      findMany: rec('user.findMany', (a: { where: { email: { in: string[] } } }) =>
        a.where.email.in.map((email, i) => ({ id: 100 + i, email })),
      ),
      updateMany: rec('user.updateMany', { count: 1 }),
    },
    auditLog: {
      createMany: rec('auditLog.createMany', (a: { data: unknown[] }) => ({ count: a.data.length })),
      create: rec('auditLog.create', {}),
    },
  };
  const db = { $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };
  return { db: db as unknown as PrismaClient, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyPlan — запись плана', () => {
  it('ушедших заводит неактивными, без пароля, с отделом и билдом', async () => {
    const { db, calls } = fakeDb();
    const r = await applyPlan(plan, 1, new Map([['navigator', 11], ['visioner', 12], ['creator', 13]]), db);
    expect(r).toEqual({ created: 2, updated: 1 });

    const [create] = calls['user.createMany'] as Array<{ data: Record<string, unknown>[] }>;
    expect(create.data).toEqual([
      {
        email: 'gone@example.test',
        fullName: 'Ольга Ушедшая',
        role: 'lead',
        buildId: 11,
        department: 'Импрув',
        hiredAt: new Date('2021-02-01T00:00:00Z'),
        dismissedAt: new Date('2025-06-30T00:00:00Z'),
        active: false,
        employmentType: 'staff',
        passwordHash: null,
      },
      {
        email: 'past@example.test',
        fullName: 'Иван Прошлый',
        role: 'designer',
        buildId: null,
        department: 'Самолет',
        hiredAt: new Date('2020-01-10T00:00:00Z'),
        dismissedAt: new Date('2025-03-01T00:00:00Z'),
        active: false,
        employmentType: 'hourly',
        passwordHash: null,
      },
    ]);
  });

  it('на каждую новую карточку — запись «Добавлен из HR», без денег', async () => {
    const { db, calls } = fakeDb();
    await applyPlan(plan, 1, new Map(), db);
    const [audit] = calls['auditLog.createMany'] as Array<{ data: Array<Record<string, unknown>> }>;
    expect(audit.data).toHaveLength(2);
    expect(audit.data[0]).toMatchObject({
      actorId: 1,
      action: 'user_imported_from_hr',
      targetType: 'user',
      targetId: 100,
      details: { after: { role: 'lead', active: false, hiredAt: '2021-02-01', dismissedAt: '2025-06-30' } },
    });
    expect(JSON.stringify(audit.data)).not.toMatch(/salary|reason_of_dismissal|dismissalType|dismissalReason/);
  });

  it('дату дозаполняет только пустую — условие повторяется в запросе', async () => {
    const { db, calls } = fakeDb();
    await applyPlan(plan, 1, new Map(), db);
    expect(calls['user.updateMany']).toEqual([
      { where: { id: 7, hiredAt: null }, data: { hiredAt: new Date('2023-05-02T00:00:00Z') } },
    ]);
    expect(calls['auditLog.create']).toEqual([
      {
        data: expect.objectContaining({
          action: 'user_dates_from_hr',
          targetId: 7,
          details: expect.objectContaining({ before: { hiredAt: null }, after: { hiredAt: '2023-05-02' } }),
        }),
      },
    ]);
  });

  it('активных из HR без флага, ушедших до 2025, Lite, дизайн-инженеров и декрет не создаёт', async () => {
    const { db, calls } = fakeDb();
    await applyPlan(plan, 1, new Map(), db);
    const [create] = calls['user.createMany'] as Array<{ data: Array<{ email: string }> }>;
    const emails = create.data.map((d) => d.email);
    for (const e of ['new@', 'old@', 'lite@', 'eng@', 'mat@']) expect(emails).not.toContain(`${e}example.test`);
  });

  it('--include-hr-id: активной создаёт только указанную, без пароля', async () => {
    const byId = planRegistrySync({ hr, users, excluded: [], options: { today: '2026-10-01', includeHrIds: ['hr-new'] } });
    expect(byId.includeErrors).toEqual([]);
    const { db, calls } = fakeDb();
    const r = await applyPlan(byId, 1, new Map([['visioner', 12]]), db);
    expect(r.created).toBe(3);
    const [create] = calls['user.createMany'] as Array<{ data: Array<Record<string, unknown>> }>;
    expect(create.data.filter((d) => d.active)).toEqual([
      expect.objectContaining({ email: 'new@example.test', active: true, passwordHash: null, buildId: 12 }),
    ]);
    // Декрет в «Действия» не попадает
    const [audit] = calls['auditLog.createMany'] as Array<{ data: unknown[] }>;
    expect(JSON.stringify(audit.data)).not.toMatch(/maternity|декрет/i);
  });
});

describe('printReport — отчёт', () => {
  const capture = (verbose: boolean, p = plan, includeHrIds?: string[]) => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void lines.push(a.join(' ')));
    printReport(p, { verbose, includeActiveMissing: false, includeHrIds, today: '2026-10-01' });
    return lines.join('\n');
  };

  it('по умолчанию — числа и id, без имён и email', () => {
    const out = capture(false);
    expect(out).toContain('Создать неактивными (ушли с 2025): 2');
    expect(out).toContain('Пропущено: ушли до 2025 — 1');
    expect(out).toContain('Активные в HR, нет в Грейдах: 1 — не создаются');
    expect(out).toContain('user #7: найм');
    expect(out).toContain('hr-gone');
    for (const p of hr) {
      expect(out).not.toContain(p.email!.toLowerCase());
      expect(out).not.toContain(p.lastNameRu!);
    }
    expect(out).not.toContain('2023-05-02');
  });

  it('Lite, дизайн-инженеры и декрет — строками-счётчиками; id декрета — только с --verbose', () => {
    const out = capture(false);
    expect(out).toContain('Lite (дизайн-инженеры) — пропущено: 1');
    expect(out).toContain('Дизайн-инженеры (позиция) — пропущено: 1');
    expect(out).toContain('В декрете — не добавляем: 1');
    for (const id of ['hr-lite', 'hr-eng', 'hr-mat']) expect(out).not.toContain(id);
    vi.restoreAllMocks();
    const verbose = capture(true);
    expect(verbose).toContain('HR id: hr-mat');
    expect(verbose).not.toContain('Декретная');
  });

  it('с --verbose — имена и email для оператора', () => {
    const out = capture(true);
    expect(out).toContain('Ольга Ушедшая <gone@example.test>');
    expect(out).toContain('user #7: найм 2023-05-02');
  });

  it('--include-hr-id: сколько создаём и ошибки по id не из списка', () => {
    const ids = ['hr-new', 'hr-cur', 'hr-mat', 'hr-missing'];
    const byId = planRegistrySync({ hr, users, excluded: [], options: { today: '2026-10-01', includeHrIds: ids } });
    const out = capture(false, byId, ids);
    expect(out).toContain('Активные в HR, нет в Грейдах: 1 — по --include-hr-id создаём активными, без пароля: 1');
    expect(out).toContain('Ошибка --include-hr-id — не из «нет в Грейдах», не создаём: 3');
    expect(out).toContain('HR hr-cur: уже в Грейдах');
    expect(out).toContain('HR hr-missing: нет в выборке HR');
    // Декрет рядом с id — только с --verbose
    expect(out).toContain('HR hr-mat: не создаём (причина — с --verbose)');
    expect(out).not.toMatch(/hr-mat: в декрете/);
    vi.restoreAllMocks();
    expect(capture(true, byId, ids)).toContain('HR hr-mat: в декрете — не добавляем');
  });
});

describe('parseArgs — флаги', () => {
  const A = '0a1b2c3d-0000-4000-8000-00000000000a';
  const B = '0a1b2c3d-0000-4000-8000-00000000000b';

  it('--include-hr-id: через запятую и флагом несколько раз, без повторов, в нижнем регистре', () => {
    const args = parseArgs([`--include-hr-id=${A.toUpperCase()}, ${B}`, `--include-hr-id=${A}`, '--apply']);
    expect(args.includeHrIds).toEqual([A, B]);
    expect(args.apply).toBe(true);
    expect(args.includeActiveMissing).toBe(false);
  });

  it('без флагов — пусто; --include-active-missing по-прежнему работает', () => {
    expect(parseArgs([]).includeHrIds).toEqual([]);
    expect(parseArgs(['--include-active-missing']).includeActiveMissing).toBe(true);
  });

  it('не UUID и пустой флаг — ошибка; неизвестный аргумент — ошибка', () => {
    expect(() => parseArgs(['--include-hr-id=abc'])).toThrow('не UUID: abc');
    expect(() => parseArgs(['--include-hr-id='])).toThrow('без id');
    expect(() => parseArgs(['--include-hr'])).toThrow('Неизвестные аргументы');
  });
});
