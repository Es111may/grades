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
 * ok — видна на экране; offscreen — найдена, но сейчас не на экране (за
 * краем окна, обрезана прокруткой, под модалкой); hidden — элемент есть, но
 * скрыт (display: none); missing — селектор не нашёл элемент (другая
 * вёрстка, закрытый поп-ап).
 */
export type AnchorStatus = 'ok' | 'offscreen' | 'hidden' | 'missing';

/**
 * Где живёт метка.
 *
 * page — якорь в потоке страницы. Метка стоит в координатах документа и
 * едет со скроллом сама, силами композитора: без пересчёта и записи в DOM на
 * каждый кадр, без отставания от содержимого. Слой таких меток — под шапкой
 * (Z.pagePins): у шапки метка уходит под стеклянный остров, как любое
 * содержимое страницы, а не мигает поверх него (Pavel, 02.10.2026).
 *
 * fixed — якорь внутри fixed-контейнера (поп-ап, модалка) или в самой
 * шапке: метка в координатах окна и над поп-апами (Z.pins).
 */
export type PinMode = 'page' | 'fixed';

export type AnchorGeom = {
  status: AnchorStatus;
  /** Левый верхний угол отметки (точка или угол рамки), вьюпорт. */
  x: number;
  y: number;
  /** Рамка целиком, вьюпорт — для позиционирования карточки. */
  rect?: ViewRect;
  el?: Element;
  mode: PinMode;
  /**
   * Рисовать ли метку. page — точку не обрезали прокручиваемые предки и она
   * не под fixed-слоем (модалкой); за краем окна метка остаётся в DOM — она
   * просто вне экрана, при скролле её не надо ни снимать, ни ставить. fixed —
   * точка на экране и не перекрыта.
   */
  shown: boolean;
  /**
   * Точка и видимая часть рамки в координатах слоя метки: документа (page)
   * или окна (fixed). Их пишет в DOM useAnchorGeoms, не React.
   */
  place: { x: number; y: number; clip?: ViewRect };
  /**
   * Скролл окна не двигает метку в координатах её слоя: у page документ
   * едет вместе с ней, у fixed якорь не едет вовсе. Нет — у якоря есть
   * sticky-предок (или он сам sticky): прилипая, он смещается и в документе,
   * и в окне. Таким меткам пересчёт нужен на каждом кадре скролла окна,
   * остальным — нет.
   */
  steady: boolean;
};

function absent(status: 'missing' | 'hidden', el?: Element): AnchorGeom {
  return { status, x: 0, y: 0, el, mode: 'page', shown: false, place: { x: 0, y: 0 }, steady: true };
}

/** Шапка приложения: метки на ней — над островом, а не под ним. */
const APP_HEADER = attrSelector(ANCHOR_ATTR, 'header');

/**
 * Что элементу дают предки (и он сам): какие из предков обрезают содержимое
 * (overflow не visible), есть ли fixed (поп-ап, модалка, плавающая панель) и
 * sticky до него. Кэш — до следующей мутации DOM: getComputedStyle на каждый
 * кадр скролла дорог.
 */
type Ancestry = { clips: Element[]; fixed: boolean; sticky: boolean };
let ancestryCache = new WeakMap<Element, Ancestry>();
// Якорь по селектору — тоже до мутации: querySelector по атрибуту обходит
// весь документ, и на каждом кадре скролла это была главная статья расхода
let queryCache = new Map<string, Element | null>();

export function resetAnchorCaches() {
  ancestryCache = new WeakMap();
  queryCache = new Map();
}

function cachedQuery(selector: string): Element | null {
  const hit = queryCache.get(selector);
  if (hit !== undefined && (hit === null || hit.isConnected)) return hit;
  const el = safeQuery(selector);
  queryCache.set(selector, el);
  return el;
}

function ancestry(el: Element): Ancestry {
  const hit = ancestryCache.get(el);
  if (hit) return hit;
  const clips: Element[] = [];
  const own = getComputedStyle(el).position;
  let fixed = own === 'fixed';
  let sticky = own === 'sticky';
  // Дальше fixed-предка обрезка прокруткой документа не действует
  for (let p = el.parentElement; p && !fixed && !isBoundary(p); p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') clips.push(p);
    if (cs.position === 'fixed') fixed = true;
    if (cs.position === 'sticky') sticky = true;
  }
  const a = { clips, fixed, sticky };
  ancestryCache.set(el, a);
  return a;
}

/** Без границ: метку страницы край окна не обрезает. */
const UNBOUNDED: ViewRect = { left: -1e9, top: -1e9, width: 2e9, height: 2e9 };

/** Видимая область вокруг элемента: start (окно или без границ) ∩ обрезающие предки. */
function clipWithin(el: Element | undefined, start: ViewRect): ViewRect | null {
  let clip: ViewRect | null = start;
  if (!el) return clip;
  for (const a of ancestry(el).clips) {
    clip = intersectRects(clip, toViewRect(a.getBoundingClientRect()));
    if (!clip) return null;
  }
  return clip;
}

/** Сверху под точкой — сам якорь, его потомок или предок. */
function hitsAnchor(el: Element, hit: Element): boolean {
  return el === hit || el.contains(hit) || hit.contains(el);
}

/**
 * Метка fixed: не перекрыта ли точка чужим слоем — модалкой с затемнением
 * поверх поп-апа, другим поп-апом.
 */
function isCovered(el: Element, x: number, y: number): boolean {
  const hit = pageElementAt(x, y);
  if (!hit) return true;
  return !hitsAnchor(el, hit);
}

/**
 * Метка страницы: не под fixed-слоем ли точка (модалка с затемнением,
 * плавающая панель). Шапка и меню страницы — не fixed: под них метка уходит
 * сама, по z-index слоя.
 */
function isUnderOverlay(el: Element, x: number, y: number): boolean {
  const hit = pageElementAt(x, y);
  if (!hit || hitsAnchor(el, hit)) return false;
  return ancestry(hit).fixed;
}

export function measureAnchor(anchor: CommentAnchor | null): AnchorGeom {
  if (!anchor) return absent('missing');
  let target: ViewRect;
  let el: Element | undefined;
  if (anchor.selector) {
    const found = cachedQuery(anchor.selector);
    if (!found) return absent('missing');
    el = found;
    const r = found.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return absent('hidden', el);
    target = anchor.rel
      ? rectFromRel(toViewRect(r), anchor.rel)
      : rectFromAbs(anchor.abs, mainLeft(), window.scrollY);
  } else {
    target = rectFromAbs(anchor.abs, mainLeft(), window.scrollY);
  }

  const mode: PinMode = el && (ancestry(el).fixed || el.closest(APP_HEADER)) ? 'fixed' : 'page';
  const x = Math.round(target.left);
  const y = Math.round(target.top);
  const rect: ViewRect = {
    left: x,
    top: y,
    width: Math.round(target.width),
    height: Math.round(target.height),
  };
  const isRect = anchor.kind === 'rect';
  const view = viewportRect();
  const clip = clipWithin(el, mode === 'page' ? UNBOUNDED : view);
  const onScreen = pointInRect({ x, y }, view);
  let shown = !!clip && pointInRect({ x, y }, clip);

  // Перекрытие проверяем только на экране: за его краем elementsFromPoint
  // пуст. Точку берём чуть внутри элемента: на самой границе
  // elementsFromPoint уже попадает в соседа
  if (shown && onScreen && el) {
    const r = el.getBoundingClientRect();
    const px = Math.min(Math.max(x + (isRect ? 2 : 0), r.left + 1), r.right - 1);
    const py = Math.min(Math.max(y + (isRect ? 2 : 0), r.top + 1), r.bottom - 1);
    shown = mode === 'page' ? !isUnderOverlay(el, px, py) : !isCovered(el, px, py);
  }
  if (mode === 'fixed') shown = shown && onScreen;

  // Координаты слоя: у page — документ. Считаем от дробных значений, иначе
  // округление гуляло бы на пиксель от кадра к кадру скролла
  const ox = mode === 'page' ? window.scrollX : 0;
  const oy = mode === 'page' ? window.scrollY : 0;
  const placed: ViewRect = {
    left: Math.round(target.left + ox),
    top: Math.round(target.top + oy),
    width: rect.width,
    height: rect.height,
  };
  const visiblePart =
    isRect && shown && clip
      ? intersectRects(placed, { ...clip, left: clip.left + ox, top: clip.top + oy })
      : null;
  return {
    status: shown && onScreen ? 'ok' : 'offscreen',
    x,
    y,
    rect,
    el,
    mode,
    shown,
    steady: !el || !ancestry(el).sticky,
    place: {
      x: placed.left,
      y: placed.top,
      clip: visiblePart
        ? {
            left: Math.round(visiblePart.left),
            top: Math.round(visiblePart.top),
            width: Math.round(visiblePart.width),
            height: Math.round(visiblePart.height),
          }
        : undefined,
    },
  };
}

/** Подвести отметку в поле зрения: прокрутить предков и окно. */
export function revealAnchor(anchor: CommentAnchor | null) {
  if (!anchor) return;
  const g = measureAnchor(anchor);
  if (g.status === 'missing' || g.status === 'hidden') return;
  const vh = document.documentElement.clientHeight;
  // Прокручиваемые предки (поп-ап, таблица) — до элемента
  if (g.el && ancestry(g.el).clips.length) {
    g.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  const after = measureAnchor(anchor);
  // Отметку — на треть высоты окна: карточка треда раскрывается под ней
  if (after.y < 80 || after.y > vh - 160) {
    window.scrollTo({ top: Math.max(0, window.scrollY + after.y - vh / 3), behavior: 'smooth' });
  }
}
