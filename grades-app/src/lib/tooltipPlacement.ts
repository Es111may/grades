/**
 * Геометрия хинта в режиме portal (Tooltip с portal): поповер живёт в
 * document.body с position: fixed, поэтому координаты — вьюпортные.
 * Чистая функция без DOM — геометрию проверяют тесты.
 */

export type TooltipAlign = 'left' | 'center' | 'right';
export type TooltipPlacement = 'bottom' | 'top';

/** Прямоугольник якоря — подходит результат getBoundingClientRect(). */
export type AnchorRect = { top: number; left: number; right: number; bottom: number };
export type BoxSize = { width: number; height: number };

/** Зазор между якорем и поповером — как mt-2 у CSS-хинта. */
export const TOOLTIP_GAP = 8;
/** Минимальный отступ поповера от краёв вьюпорта. */
export const VIEWPORT_MARGIN = 8;

export function placeTooltip(
  anchor: AnchorRect,
  tip: BoxSize,
  viewport: BoxSize,
  align: TooltipAlign = 'left',
  gap: number = TOOLTIP_GAP,
  margin: number = VIEWPORT_MARGIN,
): { top: number; left: number; placement: TooltipPlacement } {
  // Вертикаль. По умолчанию — снизу, как у CSS-хинта. Наверх переворачиваем,
  // только если снизу не влезает, а сверху места больше: у верхних строк
  // таблицы хинт не должен без нужды прыгать над якорем.
  const below = anchor.bottom + gap;
  const above = anchor.top - gap - tip.height;
  const spaceBelow = viewport.height - margin - below;
  const spaceAbove = anchor.top - gap - margin;
  const placement: TooltipPlacement =
    tip.height <= spaceBelow || spaceBelow >= spaceAbove ? 'bottom' : 'top';
  // Не влез ни туда, ни туда — прижимаем к вьюпорту: лучше перекрыть якорь
  // (хинт не ловит мышь), чем обрезать текст краем окна.
  const top = clamp(
    placement === 'bottom' ? below : above,
    margin,
    viewport.height - margin - tip.height,
  );

  // Горизонталь — выравнивание как у CSS-хинта, затем внутрь вьюпорта.
  const width = anchor.right - anchor.left;
  const rawLeft =
    align === 'center'
      ? anchor.left + width / 2 - tip.width / 2
      : align === 'right'
        ? anchor.right - tip.width
        : anchor.left;
  const left = clamp(rawLeft, margin, viewport.width - margin - tip.width);

  // Целые пиксели — дробные координаты у fixed размывают текст
  return { top: Math.round(top), left: Math.round(left), placement };
}

/** Зажим в [min, max]; если диапазон пуст (поповер шире окна) — к min. */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(v, max));
}
