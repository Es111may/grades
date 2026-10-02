/**
 * Тесты модуля расчёта грейда.
 *
 * Главный smoke-test: эталонный профиль из листа «Портрет» Excel-шаблона
 * (Создатель/Мидл/162 XP, разбивка UI=27 / UX=35 / PRD=19 / IND=43 / RES=38).
 * Если расчёт совпадает с Excel — формула работает.
 */

import { describe, it, expect } from 'vitest';
import { calcGrade, calcXp, cumulativeGates, failedGatesForGrade } from '../grade';
import type { GradeThreshold, ScoreInput, SkillSnapshot } from '../grade';

// ============================================================
// Helpers
// ============================================================

const STD_THRESHOLDS: Omit<GradeThreshold, 'gates'>[] = [
  { code: 'junior', threshold: 0 },
  { code: 'junior_plus', threshold: 75 },
  { code: 'premiddle', threshold: 105 },
  { code: 'middle', threshold: 135 },
  { code: 'middle_plus', threshold: 180 },
  { code: 'senior', threshold: 230 },
];

function gradesNoGates(): GradeThreshold[] {
  return STD_THRESHOLDS.map((g) => ({ ...g, gates: [] }));
}

// ============================================================
// Базовый расчёт XP
// ============================================================

describe('calcXp', () => {
  it('считает XP как mastery × weight для активных навыков', () => {
    const skills: SkillSnapshot[] = [
      { skillId: 1, taxonomyCode: 'UI', weight: 4, active: true },
      { skillId: 2, taxonomyCode: 'UI', weight: 5, active: true },
    ];
    const scores: ScoreInput[] = [
      { skillId: 1, masteryLevel: 2 }, // 8
      { skillId: 2, masteryLevel: 1 }, // 5
    ];
    const r = calcXp(skills, scores);
    expect(r.total).toBe(13);
    expect(r.byTaxonomy.UI).toBe(13);
  });

  it('игнорирует деактивированные навыки', () => {
    const skills: SkillSnapshot[] = [
      { skillId: 1, taxonomyCode: 'UI', weight: 4, active: true },
      { skillId: 2, taxonomyCode: 'UI', weight: 5, active: false }, // выключен
    ];
    const scores: ScoreInput[] = [
      { skillId: 1, masteryLevel: 2 },
      { skillId: 2, masteryLevel: 3 }, // не должно учитываться
    ];
    const r = calcXp(skills, scores);
    expect(r.total).toBe(8);
  });

  it('учитывает 0 для не оценённых навыков', () => {
    const skills: SkillSnapshot[] = [
      { skillId: 1, taxonomyCode: 'UI', weight: 4, active: true },
    ];
    const r = calcXp(skills, []);
    expect(r.total).toBe(0);
  });

  it('разносит XP по разным таксономиям', () => {
    const skills: SkillSnapshot[] = [
      { skillId: 1, taxonomyCode: 'UI', weight: 3, active: true },
      { skillId: 2, taxonomyCode: 'UX', weight: 5, active: true },
    ];
    const scores: ScoreInput[] = [
      { skillId: 1, masteryLevel: 2 }, // UI: 6
      { skillId: 2, masteryLevel: 2 }, // UX: 10
    ];
    const r = calcXp(skills, scores);
    expect(r.byTaxonomy.UI).toBe(6);
    expect(r.byTaxonomy.UX).toBe(10);
    expect(r.total).toBe(16);
  });
});

// ============================================================
// Простой расчёт грейда (без гейтов-навыков)
// ============================================================

describe('calcGrade — пороги XP', () => {
  const skill1: SkillSnapshot = { skillId: 1, taxonomyCode: 'UI', weight: 5, active: true };

  const cases: Array<[number, string]> = [
    [0, 'junior'],
    [1, 'junior'],
    [74, 'junior'],
    [75, 'junior_plus'],
    [104, 'junior_plus'],
    [105, 'premiddle'],
    [134, 'premiddle'],
    [135, 'middle'],
    [179, 'middle'],
    [180, 'middle_plus'],
    [229, 'middle_plus'],
    [230, 'senior'],
    [500, 'senior'],
  ];

  for (const [xp, expectedGrade] of cases) {
    it(`${xp} XP → ${expectedGrade}`, () => {
      // Хитрость: вес 1, mastery = xp
      const skills: SkillSnapshot[] = [{ ...skill1, weight: 1 }];
      const scores: ScoreInput[] = [{ skillId: 1, masteryLevel: xp }];
      const r = calcGrade({
        build: 'creator',
        skills,
        scores,
        grades: gradesNoGates(),
      });
      expect(r.calculatedGrade).toBe(expectedGrade);
      expect(r.effectiveGrade).toBe(expectedGrade);
    });
  }
});

// ============================================================
// Антифарм через гейты
// ============================================================

describe('calcGrade — антифарм через гейты', () => {
  it('250 XP без обязательного навыка → возвращается на грейд ниже', () => {
    const skills: SkillSnapshot[] = [
      { skillId: 1, taxonomyCode: 'UI', weight: 5, active: true }, // массовый XP
      { skillId: 2, taxonomyCode: 'UX', weight: 1, active: true }, // гейт
    ];
    const scores: ScoreInput[] = [
      { skillId: 1, masteryLevel: 50 }, // 250 XP
      { skillId: 2, masteryLevel: 0 }, // гейт не пройден
    ];
    const grades: GradeThreshold[] = STD_THRESHOLDS.map((g) => ({
      ...g,
      gates: g.code === 'middle_plus' ? [{ skillId: 2, requiredMastery: 1 }] : [],
    }));
    const r = calcGrade({ build: 'creator', skills, scores, grades });
    // 250 ≥ 230, но senior наследует гейт middle_plus (Phase 24), а он не
    // пройден → ни senior, ни middle_plus; у middle гейтов нет, 250 ≥ 135 → middle
    expect(r.calculatedGrade).toBe('middle');
  });

  it('250 XP с пройденным гейтом → senior', () => {
    const skills: SkillSnapshot[] = [
      { skillId: 1, taxonomyCode: 'UI', weight: 5, active: true },
      { skillId: 2, taxonomyCode: 'UX', weight: 1, active: true },
    ];
    const scores: ScoreInput[] = [
      { skillId: 1, masteryLevel: 50 }, // 250 XP
      { skillId: 2, masteryLevel: 1 }, // гейт пройден
    ];
    const grades: GradeThreshold[] = STD_THRESHOLDS.map((g) => ({
      ...g,
      gates: g.code === 'senior' ? [{ skillId: 2, requiredMastery: 1 }] : [],
    }));
    const r = calcGrade({ build: 'creator', skills, scores, grades });
    expect(r.calculatedGrade).toBe('senior');
  });
});

// ============================================================
// Grade floor
// ============================================================

describe('calcGrade — grade floor', () => {
  it('floor поднимает effective grade', () => {
    const skills: SkillSnapshot[] = [
      { skillId: 1, taxonomyCode: 'UI', weight: 1, active: true },
    ];
    const scores: ScoreInput[] = [{ skillId: 1, masteryLevel: 50 }]; // junior

    const r = calcGrade({
      build: 'creator',
      skills,
      scores,
      grades: gradesNoGates(),
      gradeFloor: 'middle',
    });
    expect(r.calculatedGrade).toBe('junior');
    expect(r.effectiveGrade).toBe('middle');
  });

  it('floor не понижает грейд если расчёт выше', () => {
    const skills: SkillSnapshot[] = [
      { skillId: 1, taxonomyCode: 'UI', weight: 1, active: true },
    ];
    const scores: ScoreInput[] = [{ skillId: 1, masteryLevel: 250 }];

    const r = calcGrade({
      build: 'creator',
      skills,
      scores,
      grades: gradesNoGates(),
      gradeFloor: 'middle',
    });
    expect(r.calculatedGrade).toBe('senior');
    expect(r.effectiveGrade).toBe('senior'); // floor не понижает
  });
});

// ============================================================
// Эталонный профиль из листа «Портрет» Excel
// «Создатель» / Мидл / 162 XP / UI=27, UX=35, PRD=19, IND=43, RES=38
// ============================================================

describe('эталонный профиль из Excel «Портрет»', () => {
  /**
   * Воспроизводим точно такие же mastery, как в листе «Скиллсет» колонка «Итого»
   * для билда Создатель. mastery × вес = XP.
   *
   * Здесь мы тестируем только формулу, поэтому используем предвыбранные пары.
   */
  const skills: SkillSnapshot[] = [
    // UI (Σ XP = 27): Концептинг 4×2=8, Внедрение 4×1=4, Импорт 3×1=3, Анимация 3×1=3, Генерация 5×1=5, Редактирование 4×1=4 → 27
    { skillId: 101, taxonomyCode: 'UI', weight: 4, active: true }, // Концептинг
    { skillId: 102, taxonomyCode: 'UI', weight: 4, active: true }, // Внедрение
    { skillId: 103, taxonomyCode: 'UI', weight: 3, active: true }, // Импорт
    { skillId: 104, taxonomyCode: 'UI', weight: 3, active: true }, // Анимация
    { skillId: 105, taxonomyCode: 'UI', weight: 5, active: true }, // Генерация
    { skillId: 106, taxonomyCode: 'UI', weight: 4, active: true }, // Редактирование
    // UX (Σ XP = 35): Гайдинг 4×2=8, Кросс-платформа 4×1=4, Прототипирование 3×1=3, Компоненты 5×1=5, Понятность 5×2=10, Админ 4×1=4, Текст 5×1=5 → но 35, не считаем все
    // Используем условные пары для XP=35
    { skillId: 201, taxonomyCode: 'UX', weight: 35, active: true },
    // PRD (XP=19)
    { skillId: 301, taxonomyCode: 'PRD', weight: 19, active: true },
    // IND (XP=43)
    { skillId: 401, taxonomyCode: 'IND', weight: 43, active: true },
    // RES (XP=38)
    { skillId: 501, taxonomyCode: 'RES', weight: 38, active: true },
  ];

  const scores: ScoreInput[] = [
    { skillId: 101, masteryLevel: 2 }, // 8
    { skillId: 102, masteryLevel: 1 }, // 4
    { skillId: 103, masteryLevel: 1 }, // 3
    { skillId: 104, masteryLevel: 1 }, // 3
    { skillId: 105, masteryLevel: 1 }, // 5
    { skillId: 106, masteryLevel: 1 }, // 4 → UI Σ = 27
    { skillId: 201, masteryLevel: 1 }, // UX = 35
    { skillId: 301, masteryLevel: 1 }, // PRD = 19
    { skillId: 401, masteryLevel: 1 }, // IND = 43
    { skillId: 501, masteryLevel: 1 }, // RES = 38
  ];

  it('total XP = 162', () => {
    const r = calcXp(skills, scores);
    expect(r.total).toBe(162);
  });

  it('разбивка по скиллам совпадает с листом «Портрет»', () => {
    const r = calcXp(skills, scores);
    expect(r.byTaxonomy.UI).toBe(27);
    expect(r.byTaxonomy.UX).toBe(35);
    expect(r.byTaxonomy.PRD).toBe(19);
    expect(r.byTaxonomy.IND).toBe(43);
    expect(r.byTaxonomy.RES).toBe(38);
  });

  it('162 XP без гейтов → Мидл', () => {
    const r = calcGrade({
      build: 'creator',
      skills,
      scores,
      grades: gradesNoGates(),
    });
    expect(r.calculatedGrade).toBe('middle');
    expect(r.totalXp).toBe(162);
    expect(r.nextGrade?.code).toBe('middle_plus');
    expect(r.nextGrade?.xpNeeded).toBe(18); // 180 - 162
  });

  it('162 XP с непройденным гейтом «Мидл» → Пре-мидл', () => {
    // Гейт мидла — на реальном навыке фикстуры (PRD = 301, mastery 1), а не
    // на выдуманном skillId: гейты по отсутствующим и архивным навыкам
    // calcGrade игнорирует осознанно (onlyActiveGates).
    const grades: GradeThreshold[] = STD_THRESHOLDS.map((g) => ({
      ...g,
      gates: g.code === 'middle' ? [{ skillId: 301, requiredMastery: 2 }] : [],
    }));
    const r = calcGrade({ build: 'creator', skills, scores, grades });
    // 162 ≥ 135, но гейт middle не пройден (1 < 2) → ниже: premiddle (105) → да
    expect(r.calculatedGrade).toBe('premiddle');
    expect(r.effectiveGrade).toBe('premiddle');
    expect(r.nextGrade).toEqual({
      code: 'middle',
      xpNeeded: 0,
      failedGates: [{ skillId: 301, requiredMastery: 2, currentMastery: 1, gradeCode: 'middle' }],
    });
  });

  it('162 XP с пройденным гейтом «Мидл» на том же навыке → Мидл', () => {
    const grades: GradeThreshold[] = STD_THRESHOLDS.map((g) => ({
      ...g,
      gates: g.code === 'middle' ? [{ skillId: 301, requiredMastery: 1 }] : [],
    }));
    const r = calcGrade({ build: 'creator', skills, scores, grades });
    expect(r.calculatedGrade).toBe('middle');
  });
});

// ============================================================
// Накопительные гейты (Phase 24): грейд достигнут, только если пройдены его
// гейты и гейты всех грейдов ниже. Раскладка — как в листе «Гейты (билды)»:
// каждый грейд добавляет свои навыки, у пре-мидла своих нет.
// ============================================================

describe('calcGrade — накопительные гейты', () => {
  // 1 — массовый XP; остальные — гейты своих грейдов (вес 0, XP не дают)
  const MASS = 1;
  const COMPONENTS = 10; // джун+ «Компоненты и лейауты»
  const ESTIMATION = 20; // мидл «Эстимирование»
  const DEFENSE = 30; // мидл+ «Защита»
  const PROACTIVITY = 40; // синьор «Проактивность»

  const skills: SkillSnapshot[] = [
    { skillId: MASS, taxonomyCode: 'UI', weight: 1, active: true },
    { skillId: COMPONENTS, taxonomyCode: 'UX', weight: 0, active: true },
    { skillId: ESTIMATION, taxonomyCode: 'IND', weight: 0, active: true },
    { skillId: DEFENSE, taxonomyCode: 'IND', weight: 0, active: true },
    { skillId: PROACTIVITY, taxonomyCode: 'IND', weight: 0, active: true },
  ];

  const OWN_GATES: Partial<Record<string, { skillId: number; requiredMastery: number }[]>> = {
    junior_plus: [{ skillId: COMPONENTS, requiredMastery: 1 }],
    middle: [{ skillId: ESTIMATION, requiredMastery: 1 }],
    middle_plus: [{ skillId: DEFENSE, requiredMastery: 2 }],
    senior: [{ skillId: PROACTIVITY, requiredMastery: 3 }],
  };
  const grades: GradeThreshold[] = STD_THRESHOLDS.map((g) => ({
    ...g,
    gates: OWN_GATES[g.code] ?? [],
  }));

  /** XP + mastery по гейтам; всё, что не указано, — 0. */
  function run(
    xp: number,
    gates: Partial<Record<number, number>>,
    extra: { gradeFloor?: GradeThreshold['code'] | null; skills?: SkillSnapshot[] } = {},
  ) {
    const scores: ScoreInput[] = [
      { skillId: MASS, masteryLevel: xp },
      ...Object.entries(gates).map(([id, m]) => ({ skillId: Number(id), masteryLevel: m ?? 0 })),
    ];
    return calcGrade({
      build: 'creator',
      skills: extra.skills ?? skills,
      scores,
      grades,
      gradeFloor: extra.gradeFloor,
    });
  }

  const ALL_PASSED = { [COMPONENTS]: 1, [ESTIMATION]: 1, [DEFENSE]: 2, [PROACTIVITY]: 3 };

  it('все гейты пройдены → грейд по XP', () => {
    expect(run(250, ALL_PASSED).calculatedGrade).toBe('senior');
    expect(run(200, ALL_PASSED).calculatedGrade).toBe('middle_plus');
  });

  it('250 XP, гейты синьора пройдены, но нет автолейаутов (джун+) → Джун', () => {
    // Сам баг: раньше это был синьор
    const r = run(250, { ...ALL_PASSED, [COMPONENTS]: 0 });
    expect(r.calculatedGrade).toBe('junior');
    expect(r.effectiveGrade).toBe('junior');
    expect(r.nextGrade?.code).toBe('junior_plus');
    expect(r.nextGrade?.xpNeeded).toBe(0);
    expect(r.nextGrade?.failedGates).toEqual([
      { skillId: COMPONENTS, requiredMastery: 1, currentMastery: 0, gradeCode: 'junior_plus' },
    ]);
  });

  it('унаследованный гейт джун+ не пускает в мидла', () => {
    const r = run(150, { [COMPONENTS]: 0, [ESTIMATION]: 1 });
    expect(r.calculatedGrade).toBe('junior');
  });

  it('гейт мидла держит и мидл+, и синьора; ниже — пре-мидл', () => {
    const r = run(250, { ...ALL_PASSED, [ESTIMATION]: 0 });
    expect(r.calculatedGrade).toBe('premiddle');
    expect(r.nextGrade?.code).toBe('middle');
    expect(r.nextGrade?.failedGates.map((g) => g.skillId)).toEqual([ESTIMATION]);
  });

  it('гейт мидл+ держит синьора → Мидл', () => {
    const r = run(250, { ...ALL_PASSED, [DEFENSE]: 1 });
    expect(r.calculatedGrade).toBe('middle');
    expect(r.nextGrade?.failedGates).toEqual([
      { skillId: DEFENSE, requiredMastery: 2, currentMastery: 1, gradeCode: 'middle_plus' },
    ]);
  });

  it('пре-мидл наследует гейты джун+: без них — Джун, а не Джун+', () => {
    // Своих гейтов у пре-мидла нет, XP хватает (120 ≥ 105). Гейт джун+
    // не пройден — значит не достигнут и сам джун+: в матрице «без
    // автолейаутов дальше не пускаем», поэтому опускаемся до джуна.
    const r = run(120, { [COMPONENTS]: 0 });
    expect(r.calculatedGrade).toBe('junior');
    expect(r.nextGrade?.code).toBe('junior_plus');
  });

  it('пре-мидл с пройденными гейтами джун+ → Пре-мидл, до мидла — гейт мидла', () => {
    const r = run(120, { [COMPONENTS]: 1 });
    expect(r.calculatedGrade).toBe('premiddle');
    expect(r.nextGrade).toEqual({
      code: 'middle',
      xpNeeded: 15,
      failedGates: [
        { skillId: ESTIMATION, requiredMastery: 1, currentMastery: 0, gradeCode: 'middle' },
      ],
    });
  });

  it('«Гейты до…» перечисляют и унаследованные — нижние первыми', () => {
    // Пороги выше по XP не пройдены: джун с 60 XP, но если заглянуть сразу
    // на синьора — список полный, от джун+ вверх
    const failed = failedGatesForGrade(
      { skills, scores: [{ skillId: MASS, masteryLevel: 60 }], grades },
      'senior',
    );
    expect(failed.map((g) => [g.skillId, g.gradeCode])).toEqual([
      [COMPONENTS, 'junior_plus'],
      [ESTIMATION, 'middle'],
      [DEFENSE, 'middle_plus'],
      [PROACTIVITY, 'senior'],
    ]);
  });

  it('gradeFloor по-прежнему держит эффективный грейд', () => {
    const r = run(250, { ...ALL_PASSED, [COMPONENTS]: 0 }, { gradeFloor: 'middle' });
    expect(r.calculatedGrade).toBe('junior');
    expect(r.effectiveGrade).toBe('middle');
    // Прогноз — от расчётного грейда, как и раньше
    expect(r.nextGrade?.code).toBe('junior_plus');
  });

  it('гейт по архивному навыку игнорируется — и унаследованный тоже', () => {
    const archived = skills.map((s) => (s.skillId === COMPONENTS ? { ...s, active: false } : s));
    const r = run(250, { ...ALL_PASSED, [COMPONENTS]: 0 }, { skills: archived });
    expect(r.calculatedGrade).toBe('senior');
  });

  it('гейт по навыку, которого нет в матрице, игнорируется', () => {
    const withGhost: GradeThreshold[] = grades.map((g) =>
      g.code === 'junior_plus'
        ? { ...g, gates: [...g.gates, { skillId: 999, requiredMastery: 1 }] }
        : g,
    );
    const r = calcGrade({
      build: 'creator',
      skills,
      scores: [
        { skillId: MASS, masteryLevel: 250 },
        ...Object.entries(ALL_PASSED).map(([id, m]) => ({ skillId: Number(id), masteryLevel: m })),
      ],
      grades: withGhost,
    });
    expect(r.calculatedGrade).toBe('senior');
  });
});

// ============================================================
// cumulativeGates — один навык в нескольких грейдах
// ============================================================

describe('cumulativeGates', () => {
  // Как «Концептинг» у Криэйта: джун+ — 1, мидл — 2, мидл+ — 3, синьор — 4
  const grades: GradeThreshold[] = STD_THRESHOLDS.map((g) => ({
    ...g,
    gates:
      g.code === 'junior_plus'
        ? [{ skillId: 7, requiredMastery: 1 }, { skillId: 8, requiredMastery: 1 }]
        : g.code === 'middle'
          ? [{ skillId: 7, requiredMastery: 2 }]
          : g.code === 'middle_plus'
            ? [{ skillId: 7, requiredMastery: 3 }]
            : g.code === 'senior'
              ? [{ skillId: 7, requiredMastery: 4 }, { skillId: 8, requiredMastery: 1 }]
              : [],
  }));

  it('остаётся строжайшее требование, по навыку одна строка', () => {
    expect(cumulativeGates(grades, 'senior')).toEqual([
      // 8 — тот же уровень, что у джун+: приписан грейду, где потребовали впервые
      { skillId: 8, requiredMastery: 1, gradeCode: 'junior_plus' },
      { skillId: 7, requiredMastery: 4, gradeCode: 'senior' },
    ]);
  });

  it('выше проверяемого грейда гейты не берутся', () => {
    expect(cumulativeGates(grades, 'premiddle')).toEqual([
      { skillId: 7, requiredMastery: 1, gradeCode: 'junior_plus' },
      { skillId: 8, requiredMastery: 1, gradeCode: 'junior_plus' },
    ]);
    expect(cumulativeGates(grades, 'junior')).toEqual([]);
  });

  it('уровень 2 из 4 по навыку: мидл — да, мидл+ — нет', () => {
    const skills: SkillSnapshot[] = [
      { skillId: 1, taxonomyCode: 'UI', weight: 1, active: true },
      { skillId: 7, taxonomyCode: 'UI', weight: 0, active: true },
      { skillId: 8, taxonomyCode: 'UI', weight: 0, active: true },
    ];
    const r = calcGrade({
      build: 'visioner',
      skills,
      scores: [
        { skillId: 1, masteryLevel: 250 },
        { skillId: 7, masteryLevel: 2 },
        { skillId: 8, masteryLevel: 1 },
      ],
      grades,
    });
    expect(r.calculatedGrade).toBe('middle');
    expect(r.nextGrade?.failedGates).toEqual([
      { skillId: 7, requiredMastery: 3, currentMastery: 2, gradeCode: 'middle_plus' },
    ]);
  });
});
