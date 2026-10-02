// Комментарии к интерфейсу — работа с DOM: что лежит под курсором, к какому
// элементу привязать отметку и где она сейчас на экране. Чистая геометрия —
// в lib/commentAnchor (там тесты); здесь только то, что требует документа.

import {
  absFrom,
  attrSelector,
  containsRect,
  intersectRects,
  isStableId,
  nthPath,
  pointInRect,
  popupLabel,
  rectFromAbs,
  rectFromRel,
  relWithin,
  trimSnippet,
  type CommentAnchor,
  type CommentAnchorKind,
  type PathStep,
  type ViewRect,
} from '@/lib/commentAnchor';
import { isInCommentsLayer } from '@/lib/commentsLayer';
import { UI_COMMENT_LIMITS } from '@/lib/uiCommentsShared';

/** Стабильные области страницы для привязки (ставятся в вёрстке). */
export const ANCHOR_ATTR = 'data-comment-anchor';
/**
 * Подпись места на корне поп-апа: data-comment-context="Поп-ап: Саша
 * Тимкина". Нет — у role=dialog подпись берём из его заголовка.
 */
export const CONTEXT_ATTR = 'data-comment-context';

/** Длина пути nth-of-type от опорного предка: короче — устойчивее к правкам. */
const MAX_PATH_DEPTH = 5;

function toViewRect(r: DOMRect): ViewRect {
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function viewportRect(): ViewRect {
  const root = document.documentElement;
  return { left: 0, top: 0, width: root.clientWidth, height: root.clientHeight };
}

function mainLeft(): number {
  return document.querySelector('main')?.getBoundingClientRect().left ?? 0;
}

/** Верхний элемент страницы под точкой — мимо слоя комментариев. */
export function pageElementAt(x: number, y: number): Element | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (!isInCommentsLayer(el)) return el;
  }
  return null;
}

function safeQuery(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    // Битый селектор из БД — как «не нашли»
    return null;
  }
}

/** Опорный предок со своим именем: data-comment-anchor или стабильный id. */
function stableName(el: Element): string | null {
  const name = el.getAttribute(ANCHOR_ATTR);
  if (name) return attrSelector(ANCHOR_ATTR, name);
  if (isStableId(el.id)) return `#${el.id}`;
  return null;
}

/** Номер среди соседей того же тега, с 1. */
function nthOfType(el: Element): number {
  let i = 1;
  for (let s = el.previousElementSibling; s; s = s.previousElementSibling) {
    if (s.tagName === el.tagName) i++;
  }
  return i;
}

/** Селектор корня пути: свой (имя, dialog, main) или body. */
function rootSelector(root: Element): string {
  const named = stableName(root);
  if (named) return named;
  if (root.getAttribute('role') === 'dialog') {
    const dialogs = document.querySelectorAll('[role="dialog"]');
    return dialogs.length === 1 ? '[role="dialog"]' : '';
  }
  if (root.tagName === 'MAIN') return document.querySelector('main') === root ? 'main' : '';
  return root === document.body ? 'body' : '';
}

function isBoundary(el: Element): boolean {
  return el === document.body || el === document.documentElement;
}

/**
 * Элемент-якорь и селектор к нему.
 *
 * 1. Поднимаемся от элемента под курсором до ближайшего предка со своим
 *    именем — data-comment-anchor (ставим в вёрстке на крупные блоки) или
 *    стабильным id. У рамки предок ещё и должен её вмещать. Нашли — якорь он.
 * 2. Нет — опора: ближайший role=dialog, затем main, затем body. Якорь —
 *    предок элемента под курсором не глубже MAX_PATH_DEPTH от опоры (и
 *    вмещающий рамку), селектор — короткий путь nth-of-type от опоры.
 * 3. Селектор проверяем: document.querySelector должен вернуть тот же
 *    элемент. Не вернул — селектора нет, отметка живёт по abs.
 */
function pickAnchor(
  target: Element,
  selection: ViewRect,
  kind: CommentAnchorKind,
): { el: Element; selector?: string } {
  const fits = (el: Element) =>
    kind === 'point' || containsRect(toViewRect(el.getBoundingClientRect()), selection, 2);

  // SVG внутри иконки/графика: опираемся на сам <svg> — у его детей
  // регистрозависимые теги и путь ломается от перерисовки графика
  let start: Element = target;
  if (target instanceof SVGElement && !(target instanceof SVGSVGElement)) {
    start = target.ownerSVGElement ?? target;
  }

  for (let el: Element | null = start; el && !isBoundary(el); el = el.parentElement) {
    const name = stableName(el);
    if (name && fits(el)) {
      if (safeQuery(name) === el) return { el, selector: name };
      break; // имя не уникально — дальше по пути
    }
  }

  const root =
    start.closest('[role="dialog"]') ?? start.closest('main') ?? document.body;
  // Цепочка от опоры вниз до элемента под курсором
  const chain: Element[] = [];
  for (let el: Element | null = start; el && el !== root; el = el.parentElement) chain.unshift(el);
  // Самый глубокий допустимый: не глубже MAX_PATH_DEPTH и вмещает рамку
  let depth = Math.min(chain.length, MAX_PATH_DEPTH);
  while (depth > 0 && !fits(chain[depth - 1])) depth--;
  const el = depth > 0 ? chain[depth - 1] : root;

  const rootSel = rootSelector(root);
  if (!rootSel) return { el };
  const steps: PathStep[] = chain.slice(0, depth).map((e) => ({ tag: e.tagName, index: nthOfType(e) }));
  const selector = steps.length ? `${rootSel} > ${nthPath(steps)}` : rootSel;
  return safeQuery(selector) === el ? { el, selector } : { el };
}

/** В каком поп-апе отметка: подпись с корня поп-апа или заголовок диалога. */
function contextLabel(target: Element): string | undefined {
  const own = target.closest(`[${CONTEXT_ATTR}]`)?.getAttribute(CONTEXT_ATTR);
  if (own?.trim()) return trimSnippet(own, UI_COMMENT_LIMITS.contextLabelMax);
  const dialog = target.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]');
  if (!dialog) return undefined;
  const labelledBy = dialog.getAttribute('aria-labelledby')?.split(/\s+/)[0];
  const heading = (labelledBy ? document.getElementById(labelledBy) : null) ?? dialog.querySelector('h1, h2, h3');
  return popupLabel(heading?.innerText || dialog.getAttribute('aria-label'));
}

/**
 * Якорь для новой отметки: точка (рамка нулевого размера) или рамка во
 * вьюпортных координатах. Вызывать, пока оверлей постановки ещё в DOM —
 * он отсекается как часть слоя.
 */
export function buildAnchor(kind: CommentAnchorKind, selection: ViewRect): CommentAnchor | null {
  const cx = selection.left + selection.width / 2;
  const cy = selection.top + selection.height / 2;
  const target = pageElementAt(cx, cy);
  if (!target) return null;

  const { el, selector } = pickAnchor(target, selection, kind);
  const box = toViewRect(el.getBoundingClientRect());
  const anchor: CommentAnchor = {
    kind,
    abs: absFrom(selection, mainLeft(), window.scrollY),
    viewportW: document.documentElement.clientWidth,
  };
  if (kind === 'rect') {
    // У рамки размеры обязательны и в abs, и в rel — даже вырожденные
    anchor.abs.w ??= 0;
    anchor.abs.h ??= 0;
  }
  if (selector) {
    anchor.selector = selector;
    anchor.rel = relWithin(box, selection);
    if (kind === 'rect') {
      anchor.rel.w ??= 0;
      anchor.rel.h ??= 0;
    } else {
      delete anchor.rel.w;
      delete anchor.rel.h;
    }
  }
  const text = el instanceof HTMLElement ? el.innerText : el.textContent;
  const snippet = trimSnippet(text);
  if (snippet) anchor.snippet = snippet;
  const label = contextLabel(target);
  if (label) anchor.context = { label };
  return anchor;
}

// ── Где отметка сейчас ──────────────────────────────────────────────────

/**
 * ok — видна; offscreen — найдена, но не видна (прокручена, под модалкой,
 * за краем); hidden — элемент есть, но скрыт (display: none); missing —
 * селектор не нашёл элемент (другая вёрстка, закрытый поп-ап).
 */
export type AnchorStatus = 'ok' | 'offscreen' | 'hidden' | 'missing';

export type AnchorGeom = {
  status: AnchorStatus;
  /** Левый верхний угол отметки (точка или угол рамки), вьюпорт. */
  x: number;
  y: number;
  /** Рамка целиком — для позиционирования карточки. */
  rect?: ViewRect;
  /** Видимая часть рамки (обрезанная прокручиваемыми предками). */
  clip?: ViewRect;
  el?: Element;
};

// Предки, которые обрезают содержимое (overflow не visible). Кэш — до
// следующей мутации DOM: getComputedStyle на каждый кадр скролла дорог.
let clipCache = new WeakMap<Element, Element[]>();

export function resetAnchorCaches() {
  clipCache = new WeakMap();
}

function clippingAncestors(el: Element): Element[] {
  const hit = clipCache.get(el);
  if (hit) return hit;
  const list: Element[] = [];
  for (let p = el.parentElement; p && !isBoundary(p); p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') list.push(p);
    // Дальше fixed-предка обрезка прокруткой документа не действует
    if (cs.position === 'fixed') break;
  }
  clipCache.set(el, list);
  return list;
}

function clipRectFor(el: Element): ViewRect | null {
  let clip: ViewRect | null = viewportRect();
  for (const a of clippingAncestors(el)) {
    clip = intersectRects(clip, toViewRect(a.getBoundingClientRect()));
    if (!clip) return null;
  }
  return clip;
}

/**
 * Не перекрыта ли точка чужим слоем: модалкой с затемнением, островом
 * шапки. Сверху под точкой должен оказаться сам якорь или его потомок.
 */
function isCovered(el: Element, x: number, y: number): boolean {
  const hit = pageElementAt(x, y);
  if (!hit) return true;
  return !(el === hit || el.contains(hit) || hit.contains(el));
}

export function measureAnchor(anchor: CommentAnchor | null): AnchorGeom {
  if (!anchor) return { status: 'missing', x: 0, y: 0 };
  let target: ViewRect;
  let el: Element | undefined;
  if (anchor.selector) {
    const found = safeQuery(anchor.selector);
    if (!found) return { status: 'missing', x: 0, y: 0 };
    el = found;
    const r = found.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return { status: 'hidden', x: 0, y: 0, el };
    target = anchor.rel
      ? rectFromRel(toViewRect(r), anchor.rel)
      : rectFromAbs(anchor.abs, mainLeft(), window.scrollY);
  } else {
    target = rectFromAbs(anchor.abs, mainLeft(), window.scrollY);
  }

  const x = Math.round(target.left);
  const y = Math.round(target.top);
  const rect: ViewRect = {
    left: x,
    top: y,
    width: Math.round(target.width),
    height: Math.round(target.height),
  };
  const clip = el ? clipRectFor(el) : viewportRect();
  const isRect = anchor.kind === 'rect';
  const visiblePart = clip ? intersectRects(rect, clip) : null;

  // Проверяем точку чуть внутри элемента: на самой границе elementsFromPoint
  // уже попадает в соседа
  let visible = !!clip && pointInRect({ x, y }, clip);
  if (visible && el) {
    const r = el.getBoundingClientRect();
    const px = Math.min(Math.max(x + (isRect ? 2 : 0), r.left + 1), r.right - 1);
    const py = Math.min(Math.max(y + (isRect ? 2 : 0), r.top + 1), r.bottom - 1);
    visible = !isCovered(el, px, py);
  }
  return {
    status: visible ? 'ok' : 'offscreen',
    x,
    y,
    rect,
    clip: isRect && visible && visiblePart ? visiblePart : undefined,
    el,
  };
}

/** Подвести отметку в поле зрения: прокрутить предков и окно. */
export function revealAnchor(anchor: CommentAnchor | null) {
  if (!anchor) return;
  const g = measureAnchor(anchor);
  if (g.status === 'missing' || g.status === 'hidden') return;
  const vh = document.documentElement.clientHeight;
  // Прокручиваемые предки (поп-ап, таблица) — до элемента
  if (g.el && clippingAncestors(g.el).length) {
    g.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  const after = measureAnchor(anchor);
  // Отметку — на треть высоты окна: карточка треда раскрывается под ней
  if (after.y < 80 || after.y > vh - 160) {
    window.scrollTo({ top: Math.max(0, window.scrollY + after.y - vh / 3), behavior: 'smooth' });
  }
}
