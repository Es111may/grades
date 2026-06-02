/**
 * Композитный score для ранжирования дизайнеров в лидерборде.
 *
 * Источник правды по формуле — Phase 16 PRD §11.8.
 *
 * Полная формула (все три компоненты применимы):
 *   xpNorm       = xp / maxXp                                    // 0..1
 *   perfNorm     = onTimePercent / 100                           // 0..1
 *   nineBoxNorm  = ((performance-1) * 3 + (potential-1)) / 8     // 0..1
 *   score        = 0.4·xpNorm + 0.4·perfNorm + 0.2·nineBoxNorm
 *
 * 9-Box формула вариант «А» (Performance важнее, Potential — суб-сортировка):
 *
 *        Pot=low(1)  Pot=mid(2)  Pot=high(3)
 *   Perf=high(3):  0.75       0.88       1.00
 *   Perf=mid(2):   0.38       0.50       0.63
 *   Perf=low(1):   0.00       0.13       0.25
 *
 * «Проблемный гений» (Pot=high, Perf=low) = 0.25 — низко.
 * «Звезда без потенциала» (Pot=low, Perf=high) = 0.75 — высоко.
 *
 * Перенормализация при отсутствии компонент:
 *   - нет perf (creator/no-data) и нет 9-Box → score = xpNorm
 *   - нет perf, есть 9-Box → 0.67·xpNorm + 0.33·nineBoxNorm
 *   - нет 9-Box, есть perf → 0.5·xpNorm + 0.5·perfNorm
 *   - все три есть → 0.4·xpNorm + 0.4·perfNorm + 0.2·nineBoxNorm
 *
 * Шкала результата всегда 0..1 — сравнение между дизайнерами с разным
 * набором компонент остаётся честным.
 */

import type { BuildCode } from './types';

// ============================================================
// Константы
// ============================================================

/** Доли композита, когда все три компоненты применимы. */
export const XP_WEIGHT = 0.4;
export const PERF_WEIGHT = 0.4;
export const NINE_BOX_WEIGHT = 0.2;

/**
 * Минимум задач за 6 месяцев, чтобы считать перформанс «значимым».
 * Меньше — статистика слишком шумная (например, 1 задача с pushRatio = 5% →
 * 100% on-time, что нерепрезентативно).
 */
export const MIN_TASKS_FOR_PERF = 5;

// ============================================================
// Типы
// ============================================================

/** Уровень оси 9-Box. Маппинг из БД: low → 1, mid → 2, high → 3. */
export type NineBoxLevel = 1 | 2 | 3;

export function nineBoxLevelFromString(s: string | null | undefined): NineBoxLevel | null {
  if (s === 'low') return 1;
  if (s === 'mid') return 2;
  if (s === 'high') return 3;
  return null;
}

export interface PerfScoreInput {
  /** Текущий XP дизайнера (из последней опубликованной оценки). */
  xp: number | null;
  /** Максимально возможный XP для билда дизайнера. */
  maxXp: number;
  /** Билд — нужен чтобы выключить перф для creator (Инхаус). */
  buildCode: BuildCode | null;
  /** % задач, попавших в эстимейт (≤ 10% оверпуш) за 6 мес. */
  onTimePercent: number | null;
  /** Сколько задач попало в выборку за окно. */
  totalTasks: number;
  /** Позиция в 9-Box. null если ячейка не выставлена в матрице потенциала. */
  nineBox?: {
    performance: NineBoxLevel;
    potential: NineBoxLevel;
  } | null;
}

export interface PerfScoreResult {
  /** Финальный composite score, 0..1. Чем больше — тем выше в рейтинге. */
  score: number;
  /** XP-компонента, 0..1. Удобно при дебаге. */
  xpNorm: number;
  /** Перф-компонента, 0..1. Если перф не применим — равна xpNorm (для шкалирования). */
  perfNorm: number;
  /** 9-Box компонента, 0..1. Если не применима — равна xpNorm. */
  nineBoxNorm: number;
  /** Применили ли перф в формуле. false для creator / низкой выборки / нет данных. */
  perfApplicable: boolean;
  /** Применили ли 9-Box в формуле. false если ячейка пуста. */
  nineBoxApplicable: boolean;
  /** Причина, по которой перф не учтён (для UI-подсказок и отладки). */
  perfSkipReason: 'creator' | 'no-data' | 'low-sample' | null;
}

// ============================================================
// Расчёт
// ============================================================

export function computeScore(input: PerfScoreInput): PerfScoreResult {
  const { xp, maxXp, buildCode, onTimePercent, totalTasks, nineBox } = input;

  // XP-компонента. Без maxXp нечего нормализовывать — даём 0.
  const xpNorm =
    maxXp > 0 && xp != null && xp > 0 ? Math.min(1, xp / maxXp) : 0;

  // Решаем, применим ли перф.
  let perfSkipReason: PerfScoreResult['perfSkipReason'] = null;
  if (buildCode === 'creator') {
    perfSkipReason = 'creator';
  } else if (onTimePercent == null) {
    perfSkipReason = 'no-data';
  } else if (totalTasks < MIN_TASKS_FOR_PERF) {
    perfSkipReason = 'low-sample';
  }
  const perfApplicable = perfSkipReason === null;
  const perfNorm = perfApplicable
    ? Math.min(1, (onTimePercent ?? 0) / 100)
    : xpNorm;

  // 9-Box применим, если есть ячейка. Формула вариант «А»:
  //   ((perf-1) * 3 + (pot-1)) / 8
  // Perf доминирует (умножается на 3), Pot — суб-сортировка.
  // Это даёт «звезде без потенциала» 0.75, «проблемному гению» 0.25.
  const nineBoxApplicable = !!nineBox;
  const nineBoxNorm = nineBoxApplicable
    ? ((nineBox!.performance - 1) * 3 + (nineBox!.potential - 1)) / 8
    : xpNorm;

  // Перенормализация весов под доступные компоненты.
  // - 3 компоненты: XP 0.4 / Perf 0.4 / 9-Box 0.2
  // - XP + Perf (нет 9-Box): 0.5 / 0.5
  // - XP + 9-Box (Инхаус или нет перф-данных): (XP + 9-Box) / (XP+9-Box) ≈ 0.67 / 0.33
  // - только XP: 1.0
  let score: number;
  if (perfApplicable && nineBoxApplicable) {
    score = XP_WEIGHT * xpNorm + PERF_WEIGHT * perfNorm + NINE_BOX_WEIGHT * nineBoxNorm;
  } else if (perfApplicable && !nineBoxApplicable) {
    // Без 9-Box — XP и Perf делят 80% пополам (т.е. 50/50).
    score = 0.5 * xpNorm + 0.5 * perfNorm;
  } else if (!perfApplicable && nineBoxApplicable) {
    // Без перф (creator/нет данных) — XP и 9-Box делят 60% в пропорции
    // 0.4:0.2 = 2:1, нормализуем до 0.67:0.33.
    const xpShare = XP_WEIGHT / (XP_WEIGHT + NINE_BOX_WEIGHT);
    const nineBoxShare = NINE_BOX_WEIGHT / (XP_WEIGHT + NINE_BOX_WEIGHT);
    score = xpShare * xpNorm + nineBoxShare * nineBoxNorm;
  } else {
    // Только XP.
    score = xpNorm;
  }

  return {
    score,
    xpNorm,
    perfNorm,
    nineBoxNorm,
    perfApplicable,
    nineBoxApplicable,
    perfSkipReason,
  };
}

// ============================================================
// UI-хелперы
// ============================================================

/**
 * Цветовая зона чипа «В срок» — по порогам Pavel'a:
 *   ≥ 85% — emerald (зелёный, цель)
 *   70–84% — amber (можно лучше)
 *   < 70% — blaze (красный, явная просадка)
 */
export type OnTimeZone = 'emerald' | 'amber' | 'blaze';

export function getOnTimeZone(onTimePercent: number): OnTimeZone {
  if (onTimePercent >= 85) return 'emerald';
  if (onTimePercent >= 70) return 'amber';
  return 'blaze';
}
