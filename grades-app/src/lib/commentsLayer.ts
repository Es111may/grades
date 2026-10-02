// Слой комментариев к интерфейсу (components/comments) живёт поверх страницы
// порталом в body — вне DOM её поп-апов и меню. Для их обработчиков «клик
// мимо», Escape и ловушек фокуса всё, что происходит в слое, — «снаружи», и
// без проверки поп-ап закрывался бы, а меню сворачивалось, пока человек
// ставит отметку или пишет комментарий внутри них.
//
// Правило для страниц:
//   • клик мимо (mousedown), уход фокуса (focusin), клик по затемнению —
//     начинаются с isFromCommentsLayer(e): событие из слоя не закрывает;
//   • Escape — с isCommentsLayerOpen(): пока в слое что-то открыто
//     (поповер, постановка, поле, карточка), Escape закрывает его, а не
//     поп-ап. Слой и сам гасит Escape на захвате (components/comments/
//     useEscape), проверка — подстраховка: например, Escape, которым
//     отменяют набор IME в поле комментария, слой пропускает дальше. Когда
//     в слое всё закрыто, Escape снова закрывает поп-ап — даже если фокус
//     остался на метке: иначе клавиша была бы мёртвой;
//   • ловушка Tab не возвращает фокус из слоя: isInCommentsLayer(active).
//
// Без DOM-типов в проверках — утиная типизация: так её проверяют тесты в
// node, а в браузере это обычные Element и Event.

/** Атрибут корня слоя: всё внутри — интерфейс комментариев, не страница. */
export const COMMENTS_LAYER_ATTR = 'data-comments-layer';
/** Значение атрибута, пока в слое что-то открыто; иначе — пустая строка. */
export const COMMENTS_LAYER_OPEN = 'open';

const LAYER_SELECTOR = `[${COMMENTS_LAYER_ATTR}]`;

type ElementLike = {
  hasAttribute?: (name: string) => boolean;
  closest?: (selector: string) => unknown;
};
type NodeLike = ElementLike & { nodeType?: number; parentElement?: ElementLike | null };

const ELEMENT_NODE = 1;

function hasLayerAttr(t: unknown): boolean {
  const el = t as ElementLike | null;
  return typeof el?.hasAttribute === 'function' && el.hasAttribute(COMMENTS_LAYER_ATTR);
}

/** Узел (элемент или текст) внутри слоя комментариев. */
export function isInCommentsLayer(node: unknown): boolean {
  const n = node as NodeLike | null | undefined;
  if (!n) return false;
  // Текстовый узел и прочее — от родителя-элемента
  const el = n.nodeType === ELEMENT_NODE || n.nodeType === undefined ? n : n.parentElement;
  return typeof el?.closest === 'function' && !!el.closest(LAYER_SELECTOR);
}

/**
 * Событие пришло из слоя комментариев. Сначала composedPath: он снят в
 * момент события и верен, даже если React уже убрал цель из DOM (оверлей
 * постановки исчезает на pointerup). Пустой путь (событие уже отработало) —
 * по самой цели.
 */
export function isFromCommentsLayer(e: Pick<Event, 'target'> & { composedPath?: () => unknown[] }): boolean {
  const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
  if (path.some(hasLayerAttr)) return true;
  return isInCommentsLayer(e.target);
}

/** В слое комментариев сейчас что-то открыто — Escape его, а не страницы. */
export function isCommentsLayerOpen(
  doc: { querySelector: (selector: string) => unknown } | undefined = typeof document === 'undefined'
    ? undefined
    : document,
): boolean {
  return !!doc?.querySelector(`[${COMMENTS_LAYER_ATTR}="${COMMENTS_LAYER_OPEN}"]`);
}
