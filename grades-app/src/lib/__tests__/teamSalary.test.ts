import { describe, expect, it, vi } from 'vitest';

// В тесте базы нет: модуль ставок для показа тянет клиент Prisma
vi.mock('../db', () => ({ prisma: {} }));

import type { HrCompensation } from '../hrSalary';
import { displayCompensationMap, ratesForViewer } from '../salaryOverride';
import {
  compareSalaryCells,
  rowSalary,
  salaryBatchEmails,
  salaryCell,
  type SalaryCell,
} from '../teamSalary';

// Все люди, почты и суммы выдуманы.
const K = 1000;
const TODAY = '2026-11-27';
const ADMIN = { id: 1, role: 'admin' };
const LEAD = { id: 10, role: 'lead' };
const OTHER_LEAD_ID = 20;
const STARDIZ = { id: 30, role: 'stardiz' };
const DESIGNER = { id: 40, role: 'designer' };

type Person = Parameters<typeof rowSalary>[1];
const person = (id: number, leadId: number | null, over: Partial<Person> = {}): Person => ({
  id,
  email: `person${id}@example.test`,
  role: 'designer',
  active: true,
  leadId,
  employmentType: 'staff',
  ...over,
});

const OWN = person(101, LEAD.id);
const OWN_NO_HR = person(102, LEAD.id);
const OWN_INACTIVE = person(103, LEAD.id, { active: false });
const FOREIGN = person(201, OTHER_LEAD_ID);
const NO_LEAD = person(202, null);
const PEOPLE = [OWN, OWN_NO_HR, OWN_INACTIVE, FOREIGN, NO_LEAD];

/** Ставка в HR: найм и одно повышение — текущая ставка `to`. */
const comp = (from: number, to: number): HrCompensation => ({
  hr: { salary: to, hiredAt: '2024-02-01', dismissedAt: null },
  log: [
    { date: '2024-02-01', from: 0, to: from },
    { date: '2025-06-01', from, to },
  ],
});

/** Батч, как его отдаёт fetchHrCompensationBatch: по всем почтам, даже лишним. */
const BATCH = new Map<string, HrCompensation>([
  [OWN.email, comp(100 * K, 120 * K)],
  [OWN_NO_HR.email, { hr: null, log: [] }],
  [FOREIGN.email, comp(90 * K, 95 * K)],
  [NO_LEAD.email, comp(80 * K, 85 * K)],
]);

const ctx = { grade: null, today: TODAY };
const salariesFor = (viewer: { id: number; role: string } | null, batch = BATCH) =>
  Object.fromEntries(PEOPLE.map((p) => [p.id, rowSalary(viewer, p, batch, ctx)]));

describe('salaryBatchEmails — по кому странице нужен батч ставок', () => {
  it('админу — все активные с почтой, как раньше', () => {
    const noEmail = person(104, LEAD.id, { email: '' });
    expect(salaryBatchEmails(ADMIN, [...PEOPLE, noEmail])).toEqual([
      OWN.email,
      OWN_NO_HR.email,
      FOREIGN.email,
      NO_LEAD.email,
    ]);
  });

  it('лиду — только свои активные', () => {
    expect(salaryBatchEmails(LEAD, PEOPLE)).toEqual([OWN.email, OWN_NO_HR.email]);
  });

  it('стардизу, дизайнеру и без сессии — никого', () => {
    const mine = person(105, STARDIZ.id);
    expect(salaryBatchEmails(STARDIZ, [...PEOPLE, mine])).toEqual([]);
    expect(salaryBatchEmails(DESIGNER, PEOPLE)).toEqual([]);
    expect(salaryBatchEmails(null, PEOPLE)).toEqual([]);
  });
});

describe('rowSalary — ставка в строке «Команды»', () => {
  it('лид получает ставку своего человека', () => {
    expect(rowSalary(LEAD, OWN, BATCH, ctx)).toBe(120 * K);
  });

  it('лид не получает ставку чужого, даже если она есть в батче', () => {
    expect(rowSalary(LEAD, FOREIGN, BATCH, ctx)).toBeUndefined();
    expect(rowSalary(LEAD, NO_LEAD, BATCH, ctx)).toBeUndefined();
  });

  it('у своего без данных в HR — null («—», как у админа)', () => {
    expect(rowSalary(LEAD, OWN_NO_HR, BATCH, ctx)).toBeNull();
    expect(rowSalary(ADMIN, OWN_NO_HR, BATCH, ctx)).toBeNull();
  });

  it('свой, которого нет в батче (неактивный, HR недоступен), — поля нет', () => {
    expect(rowSalary(LEAD, OWN_INACTIVE, BATCH, ctx)).toBeUndefined();
    expect(rowSalary(LEAD, OWN, null, ctx)).toBeUndefined();
  });

  it('у стардиза и дизайнера ставок нет ни у кого', () => {
    for (const viewer of [STARDIZ, DESIGNER, null]) {
      expect(Object.values(salariesFor(viewer)).every((v) => v === undefined)).toBe(true);
    }
    // Даже у «своего» стардизу
    const mine = person(106, STARDIZ.id);
    const batch = new Map(BATCH).set(mine.email, comp(70 * K, 75 * K));
    expect(rowSalary(STARDIZ, mine, batch, ctx)).toBeUndefined();
  });

  it('у админа — как раньше: все из батча, null без данных, нет в батче — поля нет', () => {
    expect(salariesFor(ADMIN)).toEqual({
      [OWN.id]: 120 * K,
      [OWN_NO_HR.id]: null,
      [OWN_INACTIVE.id]: undefined,
      [FOREIGN.id]: 95 * K,
      [NO_LEAD.id]: 85 * K,
    });
  });

  it('у лида — только свои, остальные поля нет', () => {
    expect(salariesFor(LEAD)).toEqual({
      [OWN.id]: 120 * K,
      [OWN_NO_HR.id]: null,
      [OWN_INACTIVE.id]: undefined,
      [FOREIGN.id]: undefined,
      [NO_LEAD.id]: undefined,
    });
  });

  it('в HR уволен, а в Грейдах работает — null, как в поп-апе', () => {
    const batch = new Map(BATCH).set(OWN.email, {
      ...comp(100 * K, 120 * K),
      hr: { salary: 120 * K, hiredAt: '2024-02-01', dismissedAt: '2026-01-15' },
    });
    expect(rowSalary(LEAD, OWN, batch, ctx)).toBeNull();
  });

  it('ставка для показа у лида — та же, что у админа', () => {
    const shown = 111 * K;
    const rules = [{ email: OWN.email, amount: shown, ownerId: ADMIN.id }];
    const forLead = displayCompensationMap(BATCH, ratesForViewer(rules, { id: LEAD.id, impersonatorId: null }));
    expect(rowSalary(LEAD, OWN, forLead, ctx)).toBe(shown);
    // Чужим она лиду тоже не достаётся
    const foreignRules = [{ email: FOREIGN.email, amount: shown, ownerId: ADMIN.id }];
    const forLead2 = displayCompensationMap(
      BATCH,
      ratesForViewer(foreignRules, { id: LEAD.id, impersonatorId: null }),
    );
    expect(rowSalary(LEAD, FOREIGN, forLead2, ctx)).toBeUndefined();
  });
});

describe('ячейка и сортировка «З/п»', () => {
  it('salaryCell: ставка, «—» у своего без данных, пусто у чужого', () => {
    expect(salaryCell(120 * K, true)).toBe(120 * K);
    expect(salaryCell(null, true)).toBe('none');
    expect(salaryCell(undefined, true)).toBe('none');
    expect(salaryCell(120 * K, false)).toBe('hidden');
    expect(salaryCell(undefined, false)).toBe('hidden');
  });

  const cells: SalaryCell[] = ['hidden', 90 * K, 'none', 150 * K, 'hidden', 120 * K, 'none'];
  const sortBy = (dir: 'asc' | 'desc') => [...cells].sort((a, b) => compareSalaryCells(a, b, dir));

  it('по убыванию: ставки сверху вниз, затем «—», пустые в конце', () => {
    expect(sortBy('desc')).toEqual([150 * K, 120 * K, 90 * K, 'none', 'none', 'hidden', 'hidden']);
  });

  it('по возрастанию: пустые тоже в конце, а не сверху', () => {
    expect(sortBy('asc')).toEqual([90 * K, 120 * K, 150 * K, 'none', 'none', 'hidden', 'hidden']);
  });
});
