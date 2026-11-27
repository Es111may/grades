import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

// Скрипт тянет Prisma и ClickHouse — в тесте ни того, ни другого: запись
// идёт в поддельный клиент, отчёт — в перехваченный console.log.
vi.mock('../db', () => ({ prisma: {} }));
vi.mock('../clickhouse', () => ({ chQuery: vi.fn() }));

import { applyPlan, parseArgs, planFingerprint, printReport, toHrPerson } from '../../../scripts/sync-hr-registry';
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
  // Ушёл по HR (учётка в архиве), в Грейдах ещё активен
  { id: 8, email: 'left@example.test', fullName: 'Ушедший Активный', active: true, role: 'designer', hiredAt: '2022-01-10T00:00:00.000Z', dismissedAt: null },
];
const hrLeft: HrPerson = {
  id: 'hr-left',
  email: 'left@example.test',
  firstNameRu: 'Ушедший',
  lastNameRu: 'Активный',
  positionId: 4,
  department: 'Backoffice',
  hiredAt: '2022-01-10',
  dismissedAt: '2025-09-30',
  isArchive: 1,
  isHourly: 0,
};
const plan = planRegistrySync({ hr: [...hr, hrLeft], users, excluded: [], options: { today: '2026-10-01' } });

/** Поддельный клиент: транзакция сразу зовёт колбэк, вызовы копятся. */
function fakeDb(found: Record<number, Record<string, unknown>> = {}) {
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
      findUnique: rec('user.findUnique', (a: { where: { id: number } }) =>
        found[a.where.id] ?? {
          id: a.where.id,
          role: 'designer',
          active: true,
          leadId: null,
          hiredAt: new Date('2022-01-10T00:00:00Z'),
          dismissedAt: null,
        },
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

const TODAY = new Date('2026-10-01T00:00:00.000Z');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyPlan — запись плана', () => {
  it('«Заведём» — активными без пароля, ушедших — неактивными; отдел и билд из HR', async () => {
    const { db, calls } = fakeDb();
    const r = await applyPlan(plan, 1, new Map([['navigator', 11], ['visioner', 12], ['creator', 13]]), db, TODAY);
    expect(r).toEqual({ created: 3, updated: 1, deactivated: 1, unchanged: 0 });

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
        email: 'new@example.test',
        fullName: 'Новая Активная',
        role: 'designer',
        buildId: 12,
        department: 'Криэйт',
        hiredAt: new Date('2026-09-01T00:00:00Z'),
        dismissedAt: null,
        active: true,
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

  it('на каждую новую карточку — запись «Добавлен из HR», без денег и декрета', async () => {
    const { db, calls } = fakeDb();
    await applyPlan(plan, 1, new Map(), db, TODAY);
    const [audit] = calls['auditLog.createMany'] as Array<{ data: Array<Record<string, unknown>> }>;
    expect(audit.data).toHaveLength(3);
    expect(audit.data[0]).toMatchObject({
      actorId: 1,
      action: 'user_imported_from_hr',
      targetType: 'user',
      targetId: 100,
      details: { after: { role: 'lead', active: false, hiredAt: '2021-02-01', dismissedAt: '2025-06-30' } },
    });
    expect(JSON.stringify(audit.data)).not.toMatch(/salary|reason_of_dismissal|dismissalType|dismissalReason|maternity|декрет/i);
  });

  it('дату дозаполняет только пустую — условие повторяется в запросе', async () => {
    const { db, calls } = fakeDb();
    await applyPlan(plan, 1, new Map(), db, TODAY);
    expect((calls['user.updateMany'] as unknown[])[0]).toEqual({
      where: { id: 7, hiredAt: null },
      data: { hiredAt: new Date('2023-05-02T00:00:00Z') },
    });
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

  it('деактивация — как кнопкой в интерфейсе: active=false, дата увольнения из HR, «Действия» с пометкой «Сверка с HR»', async () => {
    const { db, calls } = fakeDb();
    await applyPlan(plan, 1, new Map(), db, TODAY);
    expect(calls['user.findUnique']).toEqual([expect.objectContaining({ where: { id: 8 } })]);
    expect((calls['user.updateMany'] as unknown[])[1]).toEqual({
      where: { id: 8, active: true },
      data: { active: false, dismissedAt: new Date('2025-09-30T00:00:00Z') },
    });
    const audits = (calls['auditLog.createMany'] as Array<{ data: Array<Record<string, unknown>> }>)[1].data;
    expect(audits).toEqual([
      {
        actorId: 1,
        action: 'user_deactivated',
        targetType: 'user',
        targetId: 8,
        details: { before: true, after: false, reason: 'Сверка с HR', hrId: 'hr-left' },
      },
      {
        actorId: 1,
        action: 'dismissal_updated',
        targetType: 'user',
        targetId: 8,
        details: {
          before: null,
          after: '2025-09-30',
          typeChanged: false,
          reasonChanged: false,
          auto: true,
          reason: 'Сверка с HR',
          hrId: 'hr-left',
        },
      },
    ]);
  });

  it('после отчёта человека деактивировали или сделали админом в интерфейсе — не трогаем', async () => {
    for (const changed of [{ active: false }, { role: 'admin' }]) {
      const { db, calls } = fakeDb({
        8: { id: 8, role: 'designer', active: true, leadId: null, hiredAt: null, dismissedAt: null, ...changed },
      });
      const r = await applyPlan(plan, 1, new Map(), db, TODAY);
      expect(r).toMatchObject({ deactivated: 0, unchanged: 1 });
      expect((calls['user.updateMany'] as Array<{ where: { id: number } }>).map((c) => c.where.id)).toEqual([7]);
    }
  });

  it('ушедших до 2025, Lite, дизайн-инженеров и декрет не создаёт', async () => {
    const { db, calls } = fakeDb();
    await applyPlan(plan, 1, new Map(), db, TODAY);
    const [create] = calls['user.createMany'] as Array<{ data: Array<{ email: string }> }>;
    const emails = create.data.map((d) => d.email);
    for (const e of ['old@', 'lite@', 'eng@', 'mat@']) expect(emails).not.toContain(`${e}example.test`);
  });
});

describe('printReport — отчёт', () => {
  const capture = (verbose: boolean, p = plan) => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void lines.push(a.join(' ')));
    printReport(p, { verbose, today: '2026-10-01', source: 'слепок на 27.11.2026' });
    return lines.join('\n');
  };

  it('по умолчанию — числа и id, без имён и email', () => {
    const out = capture(false);
    expect(out).toContain('Данные HR: слепок на 27.11.2026');
    expect(out).toContain('Заведём — работают в HR, нет в Грейдах (активными, без пароля): 1');
    expect(out).toContain('Создать неактивными (ушли с 2025): 2');
    expect(out).toContain('Пропущено: ушли до 2025 — 1');
    expect(out).toContain('Деактивируем — в HR ни одной живой учётки: 1');
    expect(out).toContain('user #8 · HR hr-left · дата увольнения из HR');
    expect(out).toContain('user #7: найм');
    expect(out).toContain('hr-gone');
    for (const p of [...hr, hrLeft]) {
      expect(out).not.toContain(p.email!.toLowerCase());
      expect(out).not.toContain(p.lastNameRu!);
    }
    expect(out).not.toContain('2023-05-02');
    expect(out).not.toContain('2025-09-30');
  });

  it('Lite, дизайн-инженеры и декрет — строками-счётчиками; id декрета — только с --verbose', () => {
    const out = capture(false);
    expect(out).toContain('Lite (дизайн-инженеры) — пропущено: 1');
    expect(out).toContain('Дизайн-инженеры (позиция) — пропущено: 1');
    expect(out).toContain('В декрете — не заводим: 1');
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
    expect(out).toContain('user #8 Ушедший Активный <left@example.test>');
  });

  it('«Похоже, уже есть» и «Проверьте вручную» — парами id', () => {
    const p = planRegistrySync({
      hr: [
        { ...hr[7], id: 'hr-twin', email: 'twin@example.test', hiredAt: '2023-05-02' },
        { ...hrLeft, id: 'hr-adm', email: 'adm@example.test' },
      ],
      users: [
        { id: 30, email: 'other@example.test', fullName: 'Нынешний Дизайнер', active: true, hiredAt: null, dismissedAt: null },
        { id: 31, email: 'adm@example.test', fullName: 'Админ', active: true, role: 'admin', hiredAt: null, dismissedAt: null },
      ],
      excluded: [],
      options: { today: '2026-10-01' },
    });
    const out = capture(false, p);
    expect(out).toContain('Похоже, уже есть — совпало имя или фамилия с датой найма, email другой (не заводим): 1');
    expect(out).toContain('HR hr-twin ↔ user #30 · дозаполним найм');
    expect(out).toContain('Проверьте вручную — ушли по HR, сверка не трогает: 1');
    expect(out).toContain('user #31 · HR hr-adm · админ');
  });
});

describe('printReport — «Похоже, уже есть» по фамилии и дате найма', () => {
  it('пара с пометкой, без имён и почт', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void lines.push(a.join(' ')));
    const p = planRegistrySync({
      hr: [{ ...hr[7], id: 'hr-vl', email: 'v.primerov@example.test', firstNameRu: 'Владимир', lastNameRu: 'Примеров', hiredAt: '2026-10-08', dismissedAt: '2026-10-16' }],
      users: [
        { id: 40, email: 'vl.primerov@example.test', fullName: 'Вова Примеров', active: false, hiredAt: '2026-10-08T00:00:00.000Z', dismissedAt: '2026-10-15T00:00:00.000Z' },
      ],
      excluded: [],
      options: { today: '2026-11-27' },
    });
    printReport(p, { verbose: false, today: '2026-11-27' });
    const out = lines.join('\n');
    expect(out).toContain('Создать неактивными (ушли с 2025): 0');
    expect(out).toContain('HR hr-vl ↔ user #40 · фамилия и дата найма · однозначно, даты не трогаем');
    expect(out).not.toContain('Примеров');
    expect(out).not.toContain('primerov');
  });
});

describe('planFingerprint — --apply пишет ровно план из отчёта', () => {
  it('тот же план — тот же отпечаток; другой — другой', () => {
    const again = planRegistrySync({ hr: [...hr, hrLeft], users, excluded: [], options: { today: '2026-10-01' } });
    expect(planFingerprint(again)).toBe(planFingerprint(plan));
    const fewer = planRegistrySync({ hr, users, excluded: [], options: { today: '2026-10-01' } });
    expect(planFingerprint(fewer)).not.toBe(planFingerprint(plan));
    expect(planFingerprint(plan)).toMatch(/^[0-9a-f]{10}$/);
  });
});

describe('toHrPerson — строка набора HR', () => {
  it('пустые строки набора — «нет значения»', () => {
    const p = toHrPerson({
      id: 'x', email: '', firstNameRu: 'Тест', lastNameRu: 'Тестов', firstName: '', lastName: '', positionId: '9',
      department: '', hiredAt: '2024-01-01', dismissedAt: '', isArchive: 'false', isHourly: '0', maternityLeave: '0',
      salary: '1', reasonId: '', subId: '',
    });
    expect(p).toMatchObject({ email: null, department: null, dismissedAt: null, positionId: '9', isArchive: 'false' });
    expect(p).not.toHaveProperty('salary');
  });
});

describe('parseArgs — флаги', () => {
  const A = '0a1b2c3d-0000-4000-8000-00000000000a';
  const B = '0a1b2c3d-0000-4000-8000-00000000000b';

  it('--skip-hr-id и --skip-user-id: через запятую и флагом несколько раз, без повторов', () => {
    const args = parseArgs([`--skip-hr-id=${A.toUpperCase()}, ${B}`, `--skip-hr-id=${A}`, '--skip-user-id=7,8', '--skip-user-id=7', '--apply', '--confirm=abc']);
    expect(args.skipHrIds).toEqual([A, B]);
    expect(args.skipUserIds).toEqual([7, 8]);
    expect(args.apply).toBe(true);
    expect(args.confirm).toBe('abc');
  });

  it('без флагов — пусто', () => {
    expect(parseArgs([])).toMatchObject({ skipHrIds: [], skipUserIds: [], apply: false, confirm: null });
  });

  it('убранные --include-active-missing и --include-hr-id — ошибка с подсказкой', () => {
    expect(() => parseArgs(['--include-active-missing'])).toThrow('убран 27.11.2026');
    expect(() => parseArgs([`--include-hr-id=${A}`])).toThrow('--skip-hr-id');
  });

  it('не UUID, не число, пустой флаг, неизвестный аргумент — ошибка', () => {
    expect(() => parseArgs(['--skip-hr-id=abc'])).toThrow('не UUID: abc');
    expect(() => parseArgs(['--skip-hr-id='])).toThrow('без id');
    expect(() => parseArgs(['--skip-user-id=x'])).toThrow('не число: x');
    expect(() => parseArgs(['--skip'])).toThrow('Неизвестные аргументы');
  });
});
