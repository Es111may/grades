/**
 * Тесты модуля расчёта грейда.
 *
 * Главный smoke-test: эталонный профиль из листа «Портрет» Excel-шаблона
 * (Создатель/Мидл/162 XP, разбивка UI=27 / UX=35 / PRD=19 / IND=43 / RES=38).
 * Если расчёт совпадает с Excel — формула работает.
 */

import { describe, it, expect } from 'vitest';
import { calcGrade, calcXp } from '../grade';
import type { GradeThreshold, ScoreInput, SkillSnapshot } from '../grade';

// ============================================================
// Helpers
// ============================================================

const STD_THRESHOLDS: Omit<GradeThreshold, 'gates'>[] = [
  { code: 'intern', threshold: -1 },
  { code: 'junior', threshold: 0 },
  { code: 'junior_plus', threshold: 70 },
  { code: 'middle', threshold: 120 },
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
    [0, 'intern'],
    [1, 'junior'],
    [69, 'junior'],
    [70, 'junior_plus'],
    [119, 'junior_plus'],
    [120, 'middle'],
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
    // 250 ≥ 230, но для middle_plus гейт не пройден → следующий по убыванию: middle
    // (для middle гейтов нет, 250 ≥ 120 → middle)
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

  it('162 XP с непройденным гейтом «Мидл» → Джун+', () => {
    // Если для «Мидл» обязателен какой-то навык, а у нас mastery=0
    const grades: GradeThreshold[] = STD_THRESHOLDS.map((g) => ({
      ...g,
      gates:
        g.code === 'middle' ? [{ skillId: 999, requiredMastery: 1 }] : [],
    }));
    const r = calcGrade({ build: 'creator', skills, scores, grades });
    // 162 ≥ 120, но гейт middle не пройден → ищем ниже: middle_plus тоже выше calculations
    // Wait: переход по убыванию: senior(230) — нет; mid+(180) — нет; mid(120, gate fail) — нет; jun+(70, no gates) — да
    expect(r.calculatedGrade).toBe('junior_plus');
  });
});
