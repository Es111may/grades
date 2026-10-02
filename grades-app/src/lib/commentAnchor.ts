/**
 * Комментарии к интерфейсу (как в Figma) — чистая часть: геометрия якоря,
 * жест «точка или рамка», подписи и мелкие форматтеры. Без DOM — всё
 * проверяют тесты. Работа с DOM (поиск элемента под курсором, селектор,
 * перекрытия) — в components/comments/anchorDom.ts.
 *
 * Якорь комментария хранится в БД как JSON (см. UiComment.anchor):
 *   kind      — 'point' (точка) или 'rect' (рамка);
 *   selector  — CSS-селектор элемента-якоря; нет — только abs;
 *   rel       — положение внутри бокса якоря, доли 0..1 (w/h — у рамки);
 *   abs       — запасной вариант в px: x от левого края основного
 *               контейнера страницы (main), y от верха документа;
 *   viewportW — ширина окна в момент постановки (для разбора «уехало»);
 *   snippet   — начало текста якоря: найти место в коде и подсказать в списке;
 *   context   — { label } — в каком поп-апе («Поп-ап: Саша Тимкина»).
 *
 * Чей поп-ап — не в якоре, а в пути треда: /admin/users?person=5
 * (lib/uiCommentsShared, UI_COMMENT_PATH_PARAMS).
 */

import { UI_COMMENT_LIMITS, isUiCommentPopupPath, type UiCommentAnchor } from './uiCommentsShared';

/** Якорь — та же форма, что принимает и отдаёт API (lib/uiCommentsShared). */
export type CommentAnchor = UiCommentAnchor;
export type CommentAnchorKind = CommentAnchor['kind'];

/** Координаты точки или рамки: x, y — левый верхний угол; w, h — у рамки. */
export type AnchorBox = { x: number; y: number; w?: number; h?: number };

/** Прямоугольник во вьюпортных координатах (как у getBoundingClientRect). */
export type ViewRect = { left: number; top: number; width: number; height: number };

export type Point = { x: number; y: number };

/** Сдвиг курсора меньше этого (px) — клик, то есть точка; больше — рамка. */
export const DRAG_THRESHOLD = 4;

/** Максимум символов в snippet (сервер принимает до UI_COMMENT_LIMITS.snippetMax = 200). */
export const SNIPPET_MAX = 120;

// ── Жест ────────────────────────────────────────────────────────────────

/** Клик или протяжка: смотрим на больший из сдвигов по осям. */
export function classifyGesture(start: Point, end: Point): CommentAnchorKind {
  const d = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
  return d < DRAG_THRESHOLD ? 'point' : 'rect';
}

/** Рамка по двум углам в любом порядке (тянуть можно в любую сторону). */
export function normalizeRect(a: Point, b: Point): ViewRect {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

// ── Геометрия якоря ─────────────────────────────────────────────────────

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
// 4 знака: на блоке в 2000px это 0,2px — точнее не нужно, а JSON короче
const round4 = (v: number) => Math.round(v * 10000) / 10000;

/**
 * Положение точки или рамки внутри бокса якоря — в долях. Всё, что вылезло
 * за бокс, прижимаем к краю: якорь выбран так, чтобы содержать отметку,
 * а дробные пиксели на границе не должны давать 1,0003.
 */
export function relWithin(box: ViewRect, target: ViewRect): AnchorBox {
  const w = box.width || 1;
  const h = box.height || 1;
  const x = clamp01((target.left - box.left) / w);
  const y = clamp01((target.top - box.top) / h);
  const rel: AnchorBox = { x: round4(x), y: round4(y) };
  if (target.width > 0 || target.height > 0) {
    rel.w = round4(clamp01(target.width / w));
    rel.h = round4(clamp01(target.height / h));
  }
  return rel;
}

/**
 * Запасные координаты: x — от левого края main (страницы центрированы, так
 * отметка не уезжает при другой ширине окна), y — от верха документа.
 */
export function absFrom(target: ViewRect, mainLeft: number, scrollY: number): AnchorBox {
  const abs: AnchorBox = {
    x: Math.round(target.left - mainLeft),
    y: Math.round(target.top + scrollY),
  };
  if (target.width > 0 || target.height > 0) {
    abs.w = Math.round(target.width);
    abs.h = Math.round(target.height);
  }
  return abs;
}

/** Обратно: доли внутри текущего бокса якоря → вьюпортный прямоугольник. */
export function rectFromRel(box: ViewRect, rel: AnchorBox): ViewRect {
  return {
    left: box.left + rel.x * box.width,
    top: box.top + rel.y * box.height,
    width: (rel.w ?? 0) * box.width,
    height: (rel.h ?? 0) * box.height,
  };
}

/** Обратно: запасные px → вьюпортный прямоугольник при текущем скролле. */
export function rectFromAbs(abs: AnchorBox, mainLeft: number, scrollY: number): ViewRect {
  return {
    left: mainLeft + abs.x,
    top: abs.y - scrollY,
    width: abs.w ?? 0,
    height: abs.h ?? 0,
  };
}

/** Пересечение прямоугольников; пустое — null. */
export function intersectRects(a: ViewRect, b: ViewRect): ViewRect | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  if (right < left || bottom < top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/** Точка внутри прямоугольника (границы включительно). */
export function pointInRect(p: Point, r: ViewRect): boolean {
  return p.x >= r.left && p.x <= r.left + r.width && p.y >= r.top && p.y <= r.top + r.height;
}

/** inner целиком внутри outer — с допуском на дробные пиксели. */
export function containsRect(outer: ViewRect, inner: ViewRect, tolerance = 1): boolean {
  return (
    inner.left >= outer.left - tolerance &&
    inner.top >= outer.top - tolerance &&
    inner.left + inner.width <= outer.left + outer.width + tolerance &&
    inner.top + inner.height <= outer.top + outer.height + tolerance
  );
}

// ── Селекторы ───────────────────────────────────────────────────────────

/**
 * id, на который можно опереться. React useId даёт «:r1:» — он меняется от
 * рендера к рендеру; служебные id Next — тоже мимо.
 */
export function isStableId(id: string | null | undefined): id is string {
  if (!id) return false;
  if (id.includes(':')) return false;
  if (id === '__next' || id.startsWith('__')) return false;
  return /^[A-Za-z][\w-]*$/.test(id);
}

/** Значение атрибута в кавычках для селектора: экранируем \ и ". */
export function attrSelector(name: string, value: string): string {
  return `[${name}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

/** Шаг пути: тег и номер среди соседей того же тега (с 1). */
export type PathStep = { tag: string; index: number };

/** «div:nth-of-type(2) > section:nth-of-type(1)» — короткий путь от корня. */
export function nthPath(steps: PathStep[]): string {
  return steps.map((s) => `${s.tag.toLowerCase()}:nth-of-type(${s.index})`).join(' > ');
}

/** Начало текста якоря: пробелы и переносы схлопнуты, не длиннее max. */
export function trimSnippet(text: string | null | undefined, max = SNIPPET_MAX): string | undefined {
  const s = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return undefined;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

// ── Поп-апы ─────────────────────────────────────────────────────────────

/** Начало подписи места в поп-апе: «Поп-ап: Саша Тимкина». */
export const POPUP_LABEL_PREFIX = 'Поп-ап: ';

/** Подпись поп-апа по его заголовку; пустой заголовок — подписи нет. */
export function popupLabel(heading: string | null | undefined): string | undefined {
  const title = trimSnippet(heading, UI_COMMENT_LIMITS.contextLabelMax - POPUP_LABEL_PREFIX.length);
  return title ? `${POPUP_LABEL_PREFIX}${title}` : undefined;
}

// Опоры, которые живут только в открытом поп-апе: поп-ап 360 и его секции,
// модалка «Изменить», любой role=dialog (опора в components/comments/anchorDom)
const POPUP_SELECTOR_RE = /^(?:\[data-comment-anchor="(?:popup-|user-modal")|\[role="dialog"\])/;

/** Место комментария — внутри поп-апа: без него на странице его не найти. */
export function isPopupAnchor(anchor: CommentAnchor | null | undefined): boolean {
  if (!anchor) return false;
  return !!anchor.context?.label || POPUP_SELECTOR_RE.test(anchor.selector ?? '');
}

/**
 * Подпись треда из другого места этой страницы — в списке «Эта страница»:
 * «В поп-апе: Саша Тимкина», «В поп-апе» (подписи нет — старый тред) или
 * «На странице» (тред самой страницы, а сейчас открыт поп-ап).
 */
export function placeCaption(thread: { path: string; anchor: CommentAnchor | null }): string {
  if (!isUiCommentPopupPath(thread.path)) return 'На странице';
  const label = thread.anchor?.context?.label;
  if (!label) return 'В поп-апе';
  return label.startsWith(POPUP_LABEL_PREFIX) ? `В поп-апе: ${label.slice(POPUP_LABEL_PREFIX.length)}` : label;
}

/** Коротко, для строки списка: место треда в этом месте не нашлось. */
export function missingLabel(anchor: CommentAnchor | null): string {
  return isPopupAnchor(anchor) ? 'Откройте поп-ап, чтобы увидеть место' : 'Место не найдено';
}

/**
 * Пояснение в карточке треда, если метки сейчас не видно; null — видно.
 * here — тред этого места (путь совпал с текущим); missing — место этого
 * места не нашлось на экране.
 */
export function threadHint(t: {
  here: boolean;
  missing: boolean;
  path: string;
  anchor: CommentAnchor | null;
}): string | null {
  if (!t.here) {
    return isUiCommentPopupPath(t.path)
      ? `${placeCaption(t)}. Откройте его, чтобы увидеть метку.`
      : 'Метка — на самой странице. Закройте поп-ап, чтобы её увидеть.';
  }
  if (!t.missing) return null;
  return isPopupAnchor(t.anchor)
    ? `${missingLabel(t.anchor)}.`
    : 'Место не найдено на странице — возможно, вёрстка поменялась.';
}

// ── Ссылка на тред ──────────────────────────────────────────────────────

const HASH_RE = /^#comment-(\d+)$/;

export function commentHash(id: number): string {
  return `#comment-${id}`;
}

/** «#comment-12» → 12; остальное — null. */
export function parseCommentHash(hash: string | null | undefined): number | null {
  const m = HASH_RE.exec(hash ?? '');
  return m ? Number(m[1]) : null;
}

/**
 * Адрес страницы как есть: pathname + search, без hash. В путь комментария
 * он идёт через normalizeUiCommentPath — там остаются только параметры места.
 */
export function commentPath(pathname: string, search: string | null | undefined): string {
  const q = (search ?? '').replace(/^\?/, '');
  return q ? `${pathname}?${q}` : pathname;
}

// ── Подписи ─────────────────────────────────────────────────────────────

export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n);
  const l = a % 10;
  const t = a % 100;
  if (t >= 11 && t <= 14) return forms[2];
  if (l === 1) return forms[0];
  if (l >= 2 && l <= 4) return forms[1];
  return forms[2];
}

const SHORT_DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const SHORT_DATE_YEAR = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * Относительная дата строчными — она идёт продолжением после «·»:
 * «Мира Соколова · 2 ч назад». Старше недели — дата («18 сент.»), другой
 * год — с годом, без «г.».
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const t = d.getTime();
  if (isNaN(t)) return '';
  const sec = Math.max(0, Math.round((now.getTime() - t) / 1000));
  if (sec < 60) return 'только что';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const days = Math.floor(h / 24);
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} ${plural(days, ['день', 'дня', 'дней'])} назад`;
  const fmt = d.getFullYear() === now.getFullYear() ? SHORT_DATE : SHORT_DATE_YEAR;
  return fmt.format(d).replace(/\s*г\.$/, '');
}

/** Инициалы для кружка: «Мира Соколова» → «МС». */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Подписи страниц для списка «Все страницы». */
const PAGE_LABELS: [prefix: string, label: string][] = [
  ['/admin/users', 'Команда'],
  ['/admin/matrix', 'Скиллы'],
  ['/admin/grades', 'Грейды'],
  ['/admin/economics', 'Экономика'],
  ['/admin/audit', 'Действия'],
  ['/admin/features', 'Функционал'],
  ['/admin/lead-reviews/new', 'Загрузка 360-опроса'],
  ['/admin/lead-reviews', 'Портрет лида'],
  ['/lead/assessments', 'Оценки'],
  ['/lead/assess', 'Оценка'],
  ['/lead/portrait', 'Портрет'],
];

/** Человеческое имя страницы по пути; неизвестная — сам путь. */
export function pageLabel(path: string): string {
  const pathname = path.split('?')[0].replace(/\/+$/, '') || '/';
  const hit = PAGE_LABELS.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return hit ? hit[1] : pathname;
}
