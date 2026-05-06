/**
 * Логика расчёта грейда дизайнера.
 *
 * Источник правды — 02_PRD.md §6 «Бизнес-логика».
 *
 * Модуль чистый (без БД-зависимостей) — принимает данные на вход, возвращает
 * результат. Это упрощает unit-тесты и переиспользование на клиенте/сервере.
 */

import type { BuildCode, GradeCode } from './types';
import { GRADE_ORDER } from './types';

// ============================================================
// Типы входных данных
// ============================================================

export interface SkillSnapshot {
  skillId: number;
  /** UI / UX / PRD / IND / RES */
  taxonomyCode: string;
  /** Вес именно для билда дизайнера (предварительно вынутый из SkillWeight) */
  weight: number;
  /** Активен ли навык на момент оценки. Деактивированные не учитываются. */
  active: boolean;
}

export interface ScoreInput {
  skillId: number;
  /** 0..N. 0 = не оценено / не освоено */
  masteryLevel: number;
}

export interface GradeThreshold {
  code: GradeCode;
  /** Пороги XP для билда (entry) */
  threshold: number;
  /**
   * Обязательные навыки для этого грейда (для конкретного билда).
   * Грейд считается достигнутым только если ВСЕ гейты пройдены
   * (mastery >= requiredMastery).
   */
  gates: { skillId: number; requiredMastery: number }[];
}

export interface GradeCalcInput {
  build: BuildCode;
  skills: SkillSnapshot[];
  scores: ScoreInput[];
  /**
   * Грейды отсортированы от высшего к низшему (или наоборот — мы сами отсортируем).
   * thresholds должны соответствовать xpThresholds[buildCode] из БД.
   */
  grades: GradeThreshold[];
  /** Зафиксированный грейд (см. PRD §6.3). Может опциональный. */
  gradeFloor?: GradeCode | null;
}

export interface GradeCalcResult {
  totalXp: number;
  /** XP по каждому скиллу */
  xpByTaxonomy: Record<string, number>;
  /** Расчётный грейд по XP+гейтам */
  calculatedGrade: GradeCode;
  /** Эффективный грейд = max(calculated, floor) */
  effectiveGrade: GradeCode;
  /**
   * Какие гейты не пройдены для следующего грейда (если он есть).
   * null если уже Senior.
   */
  nextGrade: {
    code: GradeCode;
    xpNeeded: number;
    failedGates: { skillId: number; requiredMastery: number; currentMastery: number }[];
  } | null;
}

// ============================================================
// Расчёт XP
// ============================================================

export function calcXp(skills: SkillSnapshot[], scores: ScoreInput[]): {
  total: number;
  byTaxonomy: Record<string, number>;
} {
  const byTaxonomy: Record<string, number> = {};
  const scoreMap = new Map<number, number>();
  for (const s of scores) scoreMap.set(s.skillId, s.masteryLevel);

  let total = 0;
  for (const skill of skills) {
    if (!skill.active) continue; // Деактивированные навыки выключены из расчёта
    const mastery = scoreMap.get(skill.skillId) ?? 0;
    const xp = mastery * skill.weight;
    total += xp;
    byTaxonomy[skill.taxonomyCode] = (byTaxonomy[skill.taxonomyCode] ?? 0) + xp;
  }
  return { total, byTaxonomy };
}

// ============================================================
// Проверка гейтов
// ============================================================

function isGatesPassed(
  scoreMap: Map<number, number>,
  gates: { skillId: number; requiredMastery: number }[],
): boolean {
  for (const g of gates) {
    const mastery = scoreMap.get(g.skillId) ?? 0;
    if (mastery < g.requiredMastery) return false;
  }
  return true;
}

function getFailedGates(
  scoreMap: Map<number, number>,
  gates: { skillId: number; requiredMastery: number }[],
) {
  const failed: { skillId: number; requiredMastery: number; currentMastery: number }[] = [];
  for (const g of gates) {
    const mastery = scoreMap.get(g.skillId) ?? 0;
    if (mastery < g.requiredMastery) {
      failed.push({ ...g, currentMastery: mastery });
    }
  }
  return failed;
}

// ============================================================
// Определение грейда
// ============================================================

export function calcGrade(input: GradeCalcInput): GradeCalcResult {
  const { skills, scores, grades, gradeFloor } = input;

  // Сортируем по убыванию (от Senior к Intern)
  const sortedDesc = [...grades].sort((a, b) => GRADE_ORDER[b.code] - GRADE_ORDER[a.code]);
  const sortedAsc = [...grades].sort((a, b) => GRADE_ORDER[a.code] - GRADE_ORDER[b.code]);

  const { total, byTaxonomy } = calcXp(skills, scores);

  const scoreMap = new Map<number, number>();
  for (const s of scores) scoreMap.set(s.skillId, s.masteryLevel);

  // Идём от Senior к Intern, ищем первый грейд, который человек проходит по обоим условиям
  let calculatedGrade: GradeCode = 'intern';
  for (const g of sortedDesc) {
    if (g.code === 'intern') continue; // Intern — fallback
    if (total < g.threshold) continue;
    if (!isGatesPassed(scoreMap, g.gates)) continue;
    calculatedGrade = g.code;
    break;
  }

  // Intern когда total <= 0 ИЛИ ничего не подошло
  if (total <= 0) calculatedGrade = 'intern';

  // Effective grade = max(calculated, floor) по сортировке грейдов
  let effectiveGrade = calculatedGrade;
  if (gradeFloor && GRADE_ORDER[gradeFloor] > GRADE_ORDER[calculatedGrade]) {
    effectiveGrade = gradeFloor;
  }

  // Найти следующий по очереди грейд (для прогноза «до следующего грейда»)
  let nextGrade: GradeCalcResult['nextGrade'] = null;
  for (const g of sortedAsc) {
    if (GRADE_ORDER[g.code] <= GRADE_ORDER[calculatedGrade]) continue;
    const xpNeeded = Math.max(0, g.threshold - total);
    const failedGates = getFailedGates(scoreMap, g.gates);
    nextGrade = { code: g.code, xpNeeded, failedGates };
    break;
  }

  return {
    totalXp: total,
    xpByTaxonomy: byTaxonomy,
    calculatedGrade,
    effectiveGrade,
    nextGrade,
  };
}
