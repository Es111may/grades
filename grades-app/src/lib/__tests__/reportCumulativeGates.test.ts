import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

// Скрипты тянут Prisma — в тесте базы нет: чистые функции проверяем на
// выдуманных людях, запись — на поддельном клиенте.
vi.mock('../db', () => ({ prisma: {} }));

import {
  analyze,
  calcGradeLegacy,
  formatMarkdown,
  loadLatestPublished,
  parseArgs as parseReportArgs,
  summarize,
  type LoadedAssessment,
} from '../../../scripts/report-cumulative-gates';
import {
  applyItem,
  formatPlan,
  parseArgs as parseRecalcArgs,
  planRecalc,
} from '../../../scripts/recalc-grades';
import type { GradeCalcInput, GradeThreshold, SkillSnapshot } from '../grade';
import type { GradeCode } from '../types';

// Все люди выдуманы. Раскладка гейтов — как в листе «Гейты (билды)»:
// джун+ — «Компоненты и лейауты», мидл — «Эстимирование», синьор — «Проактивность».
const MASS = 1;
const COMPONENTS = 10;
const ESTIMATION = 20;
const PROACTIVITY = 40;

const skills: SkillSnapshot[] = [
  { skillId: MASS, taxonomyCode: 'UI', weight: 1, active: true },
  { skillId: COMPONENTS, taxonomyCode: 'UX', weight: 0, active: true },
  { skillId: ESTIMATION, taxonomyCode: 'IND', weight: 0, active: true },
  { skillId: PROACTIVITY, taxonomyCode: 'IND', weight: 0, active: true },
];
const grades: GradeThreshold[] = [
  { code: 'junior', threshold: 0, gates: [] },
  { code: 'junior_plus', threshold: 75, gates: [{ skillId: COMPONENTS, requiredMastery: 1 }] },
  { code: 'premiddle', threshold: 105, gates: [] },
  { code: 'middle', threshold: 135, gates: [{ skillId: ESTIMATION, requiredMastery: 1 }] },
  { code: 'middle_plus', threshold: 180, gates: [] },
  { code: 'senior', threshold: 230, gates: [{ skillId: PROACTIVITY, requiredMastery: 3 }] },
];
const skillNames = new Map([
  [MASS, 'Генерация'],
  [COMPONENTS, 'Компоненты и лейауты'],
  [ESTIMATION, 'Оценка и декомпозиция'],
  [PROACTIVITY, 'Проактивность'],
]);

function input(xp: number, m: Partial<Record<number, number>>, gradeFloor: GradeCode | null = null): GradeCalcInput {
  return {
    build: 'creator',
    skills,
    grades,
    gradeFloor,
    scores: [
      { skillId: MASS, masteryLevel: xp },
      ...Object.entries(m).map(([id, v]) => ({ skillId: Number(id), masteryLevel: v ?? 0 })),
    ],
  };
}

function person(over: Partial<LoadedAssessment> & { input: GradeCalcInput | null }): LoadedAssessment {
  return {
    userId: 7,
    fullName: 'Дизайнер Выдуманный',
    role: 'designer',
    employmentType: 'staff',
    buildCode: 'creator',
    buildName: 'Инхаус',
    gradeFloor: over.input?.gradeFloor ?? null,
    assessmentId: 70,
    cycle: '2026-10',
    publishedAt: '2026-10-02T10:00:00.000Z',
    stored: { totalXp: 250, calculatedGrade: 'senior', effectiveGrade: 'senior' },
    skillNames,
    ...over,
  };
}

const NO_COMPONENTS = { [COMPONENTS]: 0, [ESTIMATION]: 1, [PROACTIVITY]: 3 };

describe('calcGradeLegacy — старое правило для отчёта', () => {
  it('воспроизводит баг: 250 XP без автолейаутов, гейты синьора пройдены → синьор', () => {
    expect(calcGradeLegacy(input(250, NO_COMPONENTS)).calculatedGrade).toBe('senior');
  });

  it('гейты своего грейда проверяет, архивные пропускает', () => {
    expect(calcGradeLegacy(input(250, { [PROACTIVITY]: 0 })).calculatedGrade).toBe('middle_plus');
    const archived = { ...input(250, { [PROACTIVITY]: 0 }) };
    archived.skills = skills.map((s) => (s.skillId === PROACTIVITY ? { ...s, active: false } : s));
    expect(calcGradeLegacy(archived).calculatedGrade).toBe('senior');
  });

  it('фиксация поднимает эффективный', () => {
    const r = calcGradeLegacy(input(50, {}, 'middle'));
    expect(r).toEqual({ totalXp: 50, calculatedGrade: 'junior', effectiveGrade: 'middle' });
  });
});

describe('analyze — кого затронет', () => {
  it('понизится: синьор без автолейаутов → джун, гейт назван', () => {
    const r = analyze(person({ input: input(250, NO_COMPONENTS) }));
    expect(r.verdict).toBe('affected');
    expect(r.old).toEqual({ calculatedGrade: 'senior', effectiveGrade: 'senior' });
    expect(r.next).toEqual({ calculatedGrade: 'junior', effectiveGrade: 'junior' });
    expect(r.blockingGates).toEqual([
      {
        skillId: COMPONENTS,
        skillName: 'Компоненты и лейауты',
        gradeCode: 'junior_plus',
        currentMastery: 0,
        requiredMastery: 1,
      },
    ]);
    expect(r.drift).toBe(false);
  });

  it('фиксация держит прежний эффективный → «защищён»', () => {
    const r = analyze(
      person({
        input: input(250, NO_COMPONENTS, 'senior'),
        stored: { totalXp: 250, calculatedGrade: 'senior', effectiveGrade: 'senior' },
      }),
    );
    expect(r.verdict).toBe('floor');
    expect(r.next).toEqual({ calculatedGrade: 'junior', effectiveGrade: 'senior' });
  });

  it('фиксация ниже прежнего грейда — всё равно понизится', () => {
    const r = analyze(person({ input: input(250, NO_COMPONENTS, 'middle') }));
    expect(r.verdict).toBe('affected');
    expect(r.next?.effectiveGrade).toBe('middle');
  });

  it('все гейты пройдены — без изменений, гейтов в отчёте нет', () => {
    const r = analyze(person({ input: input(250, { [COMPONENTS]: 1, [ESTIMATION]: 1, [PROACTIVITY]: 3 }) }));
    expect(r.verdict).toBe('same');
    expect(r.blockingGates).toEqual([]);
  });

  it('без билда — no_build', () => {
    const r = analyze(person({ input: null, buildCode: null, buildName: null }));
    expect(r.verdict).toBe('no_build');
    expect(r.xp).toBeNull();
  });

  it('грейд в БД расходится со старым правилом — drift', () => {
    const r = analyze(
      person({
        input: input(250, NO_COMPONENTS),
        stored: { totalXp: 240, calculatedGrade: 'senior', effectiveGrade: 'senior' },
      }),
    );
    expect(r.drift).toBe(true);
  });
});

describe('отчёт: итоги и Markdown', () => {
  const rows = [
    analyze(person({ userId: 1, fullName: 'Аня | Тест', input: input(250, NO_COMPONENTS) })),
    analyze(person({ userId: 2, input: input(250, NO_COMPONENTS, 'senior') })),
    analyze(person({ userId: 3, input: input(250, { [COMPONENTS]: 1, [ESTIMATION]: 1, [PROACTIVITY]: 3 }) })),
  ];

  it('считает понизится / фиксация / без изменений', () => {
    expect(summarize(rows)).toEqual({ total: 3, affected: 1, floor: 1, same: 1, noBuild: 0, drift: 0 });
  });

  it('Markdown: секции, гейт с грейдом-источником, экранированная «|»', () => {
    const md = formatMarkdown(rows, '2026-10-03T09:00:00.000Z');
    expect(md).toContain('- Грейд понизится: **1**');
    expect(md).toContain('## Грейд понизится (1)');
    expect(md).toContain('## Защищены фиксацией (1)');
    expect(md).toContain('## Без изменений (1)');
    expect(md).toContain('Компоненты и лейауты (Джун+): 0 → 1');
    expect(md).toContain('Аня \\| Тест');
    expect(md).toContain('Синьор (расчёт Джун)');
    expect(md).toContain('03.10.2026 12:00 МСК');
  });

  it('аргументы: только --json', () => {
    expect(parseReportArgs([])).toEqual({ json: false });
    expect(parseReportArgs(['--json'])).toEqual({ json: true });
    expect(() => parseReportArgs(['--apply'])).toThrow(/Неизвестные/);
  });
});

describe('recalc-grades — план и запись', () => {
  it('аргументы: по умолчанию сухой прогон', () => {
    expect(parseRecalcArgs([])).toEqual({ apply: false, includeDrift: false, userIds: null, actor: null });
    expect(parseRecalcArgs(['--apply', '--users=3,1,3', '--actor=a@b.c'])).toEqual({
      apply: true,
      includeDrift: false,
      userIds: [3, 1],
      actor: 'a@b.c',
    });
    expect(() => parseRecalcArgs(['--actor=a@b.c'])).toThrow(/--apply/);
    expect(() => parseRecalcArgs(['--users=x'])).toThrow(/--users/);
    expect(() => parseRecalcArgs(['--force'])).toThrow(/Неизвестные/);
  });

  const affected = person({ userId: 1, assessmentId: 11, input: input(250, NO_COMPONENTS) });
  const same = person({
    userId: 2,
    assessmentId: 12,
    input: input(250, { [COMPONENTS]: 1, [ESTIMATION]: 1, [PROACTIVITY]: 3 }),
  });
  // Грейд в БД разошёлся с портретом не из-за гейтов: XP в БД другой
  const drifted = person({
    userId: 3,
    assessmentId: 13,
    input: input(250, { [COMPONENTS]: 1, [ESTIMATION]: 1, [PROACTIVITY]: 3 }),
    stored: { totalXp: 240, calculatedGrade: 'senior', effectiveGrade: 'senior' },
  });
  // Уже пересчитан — в БД новый грейд
  const done = person({
    userId: 4,
    assessmentId: 14,
    input: input(250, NO_COMPONENTS),
    stored: { totalXp: 250, calculatedGrade: 'junior', effectiveGrade: 'junior' },
  });

  it('по умолчанию — только те, чей грейд меняет правка; повторно не трогает', () => {
    const plan = planRecalc([affected, same, drifted, done], false);
    expect(plan.map((p) => [p.assessmentId, p.reason])).toEqual([[11, 'phase24']]);
    expect(plan[0].result.effectiveGrade).toBe('junior');
    expect(plan[0].blocking).toBe('Компоненты и лейауты (Джун+): 0 → 1');
  });

  it('--include-drift добавляет разошедшихся с портретом', () => {
    const plan = planRecalc([affected, same, drifted, done], true);
    expect(plan.map((p) => [p.assessmentId, p.reason])).toEqual([
      [11, 'phase24'],
      [13, 'drift'],
    ]);
  });

  it('сухой прогон так и называется и подсказывает --apply', () => {
    const text = formatPlan(planRecalc([affected], false), false);
    expect(text).toContain('СУХОЙ ПРОГОН');
    expect(text).toContain('Синьор → Джун');
    expect(text).toContain('Записать: --apply');
    expect(formatPlan([], false)).toContain('Пересчитывать нечего');
  });

  it('запись условная: по прежним значениям, старое — в snapshot.recalculated', async () => {
    const [item] = planRecalc([affected], false);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = { assessment: { updateMany } } as unknown as PrismaClient;
    const now = new Date('2026-10-03T09:00:00.000Z');
    const ok = await applyItem(db, item, { old: true }, { skills: [], scores: [], grades: [] }, now);
    expect(ok).toBe(true);
    const arg = updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      id: 11,
      status: 'published',
      calculatedGrade: 'senior',
      effectiveGrade: 'senior',
      totalXp: 250,
    });
    expect(arg.data.calculatedGrade).toBe('junior');
    expect(arg.data.effectiveGrade).toBe('junior');
    expect(arg.data.snapshot.recalculated).toEqual({
      at: '2026-10-03T09:00:00.000Z',
      reason: 'phase24-cumulative-gates',
      previous: { totalXp: 250, calculatedGrade: 'senior', effectiveGrade: 'senior', snapshot: { old: true } },
    });
    expect(arg.data.snapshot.result.nextGrade.code).toBe('junior_plus');
  });

  it('оценку успели поменять — не записано', async () => {
    const [item] = planRecalc([affected], false);
    const db = { assessment: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } } as unknown as PrismaClient;
    expect(await applyItem(db, item, null, { skills: [], scores: [], grades: [] }, new Date())).toBe(false);
  });
});

describe('loadLatestPublished — выборка на поддельном клиенте', () => {
  it('последняя опубликованная оценка, входы как у портрета, матрица — один раз на билд', async () => {
    const users = [
      { id: 1, fullName: 'Аня', role: 'designer', employmentType: 'staff', buildId: 5, gradeFloor: 'middle', build: { code: 'creator', name: 'Инхаус' } },
      { id: 2, fullName: 'Боря', role: 'stardiz', employmentType: 'staff', buildId: 5, gradeFloor: 'intern', build: { code: 'creator', name: 'Инхаус' } },
      { id: 3, fullName: 'Вера', role: 'designer', employmentType: 'staff', buildId: null, gradeFloor: null, build: null },
      { id: 4, fullName: 'Гоша', role: 'designer', employmentType: 'staff', buildId: 5, gradeFloor: null, build: { code: 'creator', name: 'Инхаус' } },
    ];
    const pub = (id: number, designerId: number, publishedAt: string) => ({
      id, designerId, matrixVersionId: 9, cycle: '2026-10', publishedAt: new Date(publishedAt),
      totalXp: 100, calculatedGrade: 'junior_plus', effectiveGrade: 'middle',
    });
    // Отсортировано, как просит запрос: designerId ↑, publishedAt ↓
    const assessments = [
      pub(102, 1, '2026-10-02T00:00:00Z'),
      pub(101, 1, '2026-04-02T00:00:00Z'),
      pub(201, 2, '2026-10-01T00:00:00Z'),
      pub(301, 3, '2026-10-01T00:00:00Z'),
    ];
    const skillFindMany = vi.fn().mockResolvedValue([
      { id: MASS, name: 'Генерация', active: true, weights: [{ weight: 2 }], group: { taxonomy: { code: 'UI' } } },
      { id: COMPONENTS, name: 'Компоненты и лейауты', active: true, weights: [], group: { taxonomy: { code: 'UX' } } },
    ]);
    const gradeLevelFindMany = vi.fn().mockResolvedValue([
      { code: 'junior', xpThresholds: { creator: 0 }, gates: [] },
      { code: 'junior_plus', xpThresholds: { creator: 75 }, gates: [{ skillId: COMPONENTS, requiredMastery: 1 }] },
      { code: 'intern', xpThresholds: { creator: 0 }, gates: [] },
    ]);
    const scoreFindMany = vi.fn().mockResolvedValue([
      { assessmentId: 102, skillId: MASS, masteryLevel: 50 },
      { assessmentId: 201, skillId: MASS, masteryLevel: 10 },
    ]);
    const db = {
      user: { findMany: vi.fn().mockResolvedValue(users) },
      assessment: { findMany: vi.fn().mockResolvedValue(assessments) },
      assessmentScore: { findMany: scoreFindMany },
      skill: { findMany: skillFindMany },
      gradeLevel: { findMany: gradeLevelFindMany },
    } as unknown as PrismaClient;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    const loaded = await loadLatestPublished(db);

    expect(loaded.map((a) => [a.userId, a.assessmentId])).toEqual([[1, 102], [2, 201], [3, 301]]);
    expect(scoreFindMany.mock.calls[0][0].where).toEqual({ assessmentId: { in: [102, 201, 301] } });
    // Матрица 9 × билд 5 — один запрос на двоих; у Веры без билда — ни одного
    expect(skillFindMany).toHaveBeenCalledTimes(1);
    expect(skillFindMany.mock.calls[0][0].where).toEqual({ matrixVersionId: 9, active: true });
    const anya = loaded[0];
    expect(anya.gradeFloor).toBe('middle');
    expect(anya.input?.scores).toEqual([{ skillId: MASS, masteryLevel: 50 }]);
    expect(anya.input?.skills[0]).toEqual({ skillId: MASS, taxonomyCode: 'UI', weight: 2, active: true });
    // Неизвестный код грейда («intern») в расчёт не идёт
    expect(anya.input?.grades.map((g) => [g.code, g.threshold])).toEqual([['junior', 0], ['junior_plus', 75]]);
    expect(anya.skillNames.get(COMPONENTS)).toBe('Компоненты и лейауты');
    // Неизвестная фиксация — не учитывается, с предупреждением
    expect(loaded[1].gradeFloor).toBeNull();
    expect(loaded[2].input).toBeNull();
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();

    // Аня: 100 XP, автолейаутов нет → новое правило — джун, фиксация держит мидла
    const r = analyze(anya);
    expect(r.next).toEqual({ calculatedGrade: 'junior', effectiveGrade: 'middle' });
  });
});
