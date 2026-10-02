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
   * Собственные обязательные навыки этого грейда (для конкретного билда) —
   * только то, что грейд добавляет сверху, как в листе «Гейты (билды)».
   * Грейд достигнут, только если пройдены его гейты И гейты всех грейдов
   * ниже (mastery >= requiredMastery) — см. cumulativeGates.
   */
  gates: { skillId: number; requiredMastery: number }[];
}

/** Непройденный гейт: сколько есть и сколько нужно. */
export interface FailedGate {
  skillId: number;
  requiredMastery: number;
  currentMastery: number;
  /**
   * Чей это гейт — грейд, который требует навык на этом уровне. Ниже
   * проверяемого грейда — значит гейт унаследован (Phase 24).
   */
  gradeCode: GradeCode;
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
    /** Непройденные гейты следующего грейда — вместе с унаследованными. */
    failedGates: FailedGate[];
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

/**
 * Накопленные гейты грейда: его собственные + гейты всех грейдов ниже
 * (Phase 24, подтверждённый баг 29.07.2026). В матрице гейты не повторяются
 * от грейда к грейду — каждый добавляет свои: джун+ → «Компоненты и
 * лейауты», мидл → «Эстимирование», мидл+ → «Защита», синьор →
 * «Проактивность». Раньше проверялись только гейты выдаваемого грейда, и
 * 250 XP без автолейаутов давали синьора, хотя в матрице «Без автолейаутов
 * дальше не пускаем». У пре-мидла своих гейтов нет — он наследует
 * джун-плюсовые.
 *
 * Один навык может стоять в нескольких грейдах с растущим уровнем
 * (Концептинг 1 → 2 → 3 → 4) — остаётся строжайшее требование. При равных
 * уровнях гейт приписан нижнему грейду: там навык потребовали впервые.
 * Порядок — от нижнего грейда к верхнему, так унаследованные идут первыми.
 */
export function cumulativeGates(
  grades: GradeThreshold[],
  code: GradeCode,
): { skillId: number; requiredMastery: number; gradeCode: GradeCode }[] {
  const upTo = GRADE_ORDER[code];
  const sortedAsc = [...grades].sort((a, b) => GRADE_ORDER[a.code] - GRADE_ORDER[b.code]);
  const bySkill = new Map<number, { skillId: number; requiredMastery: number; gradeCode: GradeCode }>();
  for (const g of sortedAsc) {
    if (GRADE_ORDER[g.code] > upTo) break;
    for (const gate of g.gates) {
      const prev = bySkill.get(gate.skillId);
      if (prev && prev.requiredMastery >= gate.requiredMastery) continue;
      // delete + set — навык встаёт в порядок грейда со строжайшим требованием
      bySkill.delete(gate.skillId);
      bySkill.set(gate.skillId, {
        skillId: gate.skillId,
        requiredMastery: gate.requiredMastery,
        gradeCode: g.code,
      });
    }
  }
  return Array.from(bySkill.values());
}

/** Активные навыки: гейты по архивным и отсутствующим не считаем (см. calcGrade). */
function activeSkillIdSet(skills: SkillSnapshot[]): Set<number> {
  const ids = new Set<number>();
  for (const s of skills) if (s.active) ids.add(s.skillId);
  return ids;
}

function scoreMapOf(scores: ScoreInput[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of scores) m.set(s.skillId, s.masteryLevel);
  return m;
}

function failedOf(
  gates: { skillId: number; requiredMastery: number; gradeCode: GradeCode }[],
  scoreMap: Map<number, number>,
  activeSkillIds: Set<number>,
): FailedGate[] {
  const failed: FailedGate[] = [];
  for (const g of gates) {
    if (!activeSkillIds.has(g.skillId)) continue;
    const mastery = scoreMap.get(g.skillId) ?? 0;
    if (mastery < g.requiredMastery) failed.push({ ...g, currentMastery: mastery });
  }
  return failed;
}

/**
 * Непройденные гейты грейда вместе с унаследованными от грейдов ниже.
 * Пустой список — гейты грейда пройдены (XP проверяется отдельно).
 */
export function failedGatesForGrade(
  input: Pick<GradeCalcInput, 'skills' | 'scores' | 'grades'>,
  code: GradeCode,
): FailedGate[] {
  return failedOf(
    cumulativeGates(input.grades, code),
    scoreMapOf(input.scores),
    activeSkillIdSet(input.skills),
  );
}

// ============================================================
// Определение грейда
// ============================================================

export function calcGrade(input: GradeCalcInput): GradeCalcResult {
  const { skills, scores, grades, gradeFloor } = input;

  // Сортируем по убыванию (от Senior к Junior)
  const sortedDesc = [...grades].sort((a, b) => GRADE_ORDER[b.code] - GRADE_ORDER[a.code]);
  const sortedAsc = [...grades].sort((a, b) => GRADE_ORDER[a.code] - GRADE_ORDER[b.code]);

  const { total, byTaxonomy } = calcXp(skills, scores);

  const scoreMap = scoreMapOf(scores);

  // Гейты считаем только по активным навыкам — если навык архивирован
  // (Skill.active=false), то и гейт по нему игнорируется. Иначе на портрете
  // вылетал «непройденный навык #546», потому что навык удалили из матрицы,
  // а гейт остался в gradelevel.gates.
  const activeSkillIds = activeSkillIdSet(skills);
  const failedFor = (code: GradeCode) =>
    failedOf(cumulativeGates(grades, code), scoreMap, activeSkillIds);

  // Идём от Senior к Junior, ищем первый грейд, который человек проходит по
  // обоим условиям: XP ≥ порога и пройдены гейты — свои и всех грейдов ниже.
  // Junior — fallback (минимальный грейд, его порог = 0).
  let calculatedGrade: GradeCode = 'junior';
  for (const g of sortedDesc) {
    if (g.code === 'junior') continue;
    if (total < g.threshold) continue;
    if (failedFor(g.code).length > 0) continue;
    calculatedGrade = g.code;
    break;
  }

  // Effective grade = max(calculated, floor) по сортировке грейдов
  let effectiveGrade = calculatedGrade;
  if (gradeFloor && GRADE_ORDER[gradeFloor] > GRADE_ORDER[calculatedGrade]) {
    effectiveGrade = gradeFloor;
  }

  // Найти следующий по очереди грейд (для прогноза «до следующего грейда»).
  // Гейты — накопленные: всё, что не пройдено на пути к нему.
  let nextGrade: GradeCalcResult['nextGrade'] = null;
  for (const g of sortedAsc) {
    if (GRADE_ORDER[g.code] <= GRADE_ORDER[calculatedGrade]) continue;
    const xpNeeded = Math.max(0, g.threshold - total);
    nextGrade = { code: g.code, xpNeeded, failedGates: failedFor(g.code) };
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
