/**
 * Композитный score для ранжирования дизайнеров в лидерборде.
 *
 * Источник правды по формуле — Phase 16 PRD §11.8. Эта реализация — MVP-версия
 * без компоненты «стоимости»; только XP и перформанс.
 *
 * Формула:
 *   xpNorm   = xp / maxXp                  // 0..1
 *   perfNorm = onTimePercent / 100         // 0..1
 *   score    = 0.6 · xpNorm + 0.4 · perfNorm     // 0..1
 *
 * Когда перформанс «не применим» (Инхаус, нет данных, выборка слишком
 * маленькая) — берём только XP-компоненту: `score = xpNorm`. Это сохраняет
 * шкалу 0..1 — сравнение Инхауса с дизайнером, у которого есть перформанс,
 * остаётся честным. Если у дизайнера perfNorm маленький, его composite
 * ниже, чем чистый xpNorm Инхауса с теми же XP — это сознательно: Инхаус
 * не штрафуется за отсутствие истории в трекерах.
 */

import type { BuildCode } from './types';

// ============================================================
// Константы
// ============================================================

/** Доля XP в composite. Сумма с PERF_WEIGHT должна быть равна 1. */
export const XP_WEIGHT = 0.6;
/** Доля перформанса в composite. */
export const PERF_WEIGHT = 0.4;

/**
 * Минимум задач за 6 месяцев, чтобы считать перформанс «значимым».
 * Меньше — статистика слишком шумная (например, 1 задача с pushRatio = 5% →
 * 100% on-time, что нерепрезентативно).
 */
export const MIN_TASKS_FOR_PERF = 5;

// ============================================================
// Типы
// ============================================================

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
}

export interface PerfScoreResult {
  /** Финальный composite score, 0..1. Чем больше — тем выше в рейтинге. */
  score: number;
  /** XP-компонента, 0..1. Удобно при дебаге. */
  xpNorm: number;
  /** Перф-компонента, 0..1. Если перф не применим — равна xpNorm (для шкалирования). */
  perfNorm: number;
  /** Применили ли перф в формуле. false для creator / низкой выборки / нет данных. */
  perfApplicable: boolean;
  /** Причина, по которой перф не учтён (для UI-подсказок и отладки). */
  perfSkipReason: 'creator' | 'no-data' | 'low-sample' | null;
}

// ============================================================
// Расчёт
// ============================================================

export function computeScore(input: PerfScoreInput): PerfScoreResult {
  const { xp, maxXp, buildCode, onTimePercent, totalTasks } = input;

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

  if (!perfApplicable) {
    // Когда перф не применим — score = xpNorm (шкала остаётся 0..1).
    // Это значит, что Инхаус сравнивается с другими по чистому XP — что
    // справедливо: у них нет данных в трекерах.
    return {
      score: xpNorm,
      xpNorm,
      perfNorm: xpNorm,
      perfApplicable: false,
      perfSkipReason,
    };
  }

  const perfNorm = Math.min(1, (onTimePercent ?? 0) / 100);
  const score = XP_WEIGHT * xpNorm + PERF_WEIGHT * perfNorm;

  return { score, xpNorm, perfNorm, perfApplicable: true, perfSkipReason: null };
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
