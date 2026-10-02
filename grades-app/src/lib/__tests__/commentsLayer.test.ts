import { describe, expect, it } from 'vitest';
import {
  COMMENTS_LAYER_ATTR,
  COMMENTS_LAYER_OPEN,
  isCommentsLayerOpen,
  isFromCommentsLayer,
  isInCommentsLayer,
} from '../commentsLayer';

// Без DOM (vitest в node): элементы — объекты с hasAttribute и closest,
// дерево — цепочка parent. Хватает, чтобы проверить сами правила.
type FakeEl = {
  nodeType: 1;
  attrs: Set<string>;
  parent: FakeEl | null;
  hasAttribute: (n: string) => boolean;
  closest: (sel: string) => FakeEl | null;
};

function el(parent: FakeEl | null = null, attrs: string[] = []): FakeEl {
  const e: FakeEl = {
    nodeType: 1,
    attrs: new Set(attrs),
    parent,
    hasAttribute: (n) => e.attrs.has(n),
    closest: (sel) => {
      const name = /^\[([\w-]+)\]$/.exec(sel)?.[1];
      for (let x: FakeEl | null = e; x; x = x.parent) if (name && x.attrs.has(name)) return x;
      return null;
    },
  };
  return e;
}

const pathOf = (e: FakeEl | null) => {
  const out: unknown[] = [];
  for (let x = e; x; x = x.parent) out.push(x);
  return out;
};

describe('слой комментариев', () => {
  const body = el();
  const layer = el(body, [COMMENTS_LAYER_ATTR]);
  const composer = el(el(layer));
  const popup = el(body, ['data-comment-anchor']);
  const inPopup = el(popup);

  it('узел внутри слоя — свой, страница — нет', () => {
    expect(isInCommentsLayer(composer)).toBe(true);
    expect(isInCommentsLayer(layer)).toBe(true);
    expect(isInCommentsLayer(inPopup)).toBe(false);
    expect(isInCommentsLayer(null)).toBe(false);
    expect(isInCommentsLayer(undefined)).toBe(false);
  });

  it('текстовый узел — по родителю-элементу', () => {
    expect(isInCommentsLayer({ nodeType: 3, parentElement: composer })).toBe(true);
    expect(isInCommentsLayer({ nodeType: 3, parentElement: inPopup })).toBe(false);
    expect(isInCommentsLayer({ nodeType: 3, parentElement: null })).toBe(false);
  });

  it('событие из слоя — по composedPath, даже если цель уже вне DOM', () => {
    // Оверлей постановки убран на pointerup: closest у цели уже ничего не найдёт
    const detached = el(null);
    expect(isFromCommentsLayer({ target: detached as unknown as EventTarget, composedPath: () => [detached, layer, body] })).toBe(true);
    expect(isFromCommentsLayer({ target: inPopup as unknown as EventTarget, composedPath: () => pathOf(inPopup) })).toBe(false);
  });

  it('пустой composedPath (событие отработало) или его нет — по цели', () => {
    expect(isFromCommentsLayer({ target: composer as unknown as EventTarget, composedPath: () => [] })).toBe(true);
    expect(isFromCommentsLayer({ target: composer as unknown as EventTarget })).toBe(true);
    expect(isFromCommentsLayer({ target: inPopup as unknown as EventTarget })).toBe(false);
    expect(isFromCommentsLayer({ target: null })).toBe(false);
    // window и document в пути — без hasAttribute, не мешают
    expect(isFromCommentsLayer({ target: null, composedPath: () => [{}, { nodeType: 9 }, layer] })).toBe(true);
  });

  it('Escape страниц молчит, только пока в слое что-то открыто', () => {
    const doc = (open: boolean) => ({
      querySelector: (sel: string) =>
        open && sel === `[${COMMENTS_LAYER_ATTR}="${COMMENTS_LAYER_OPEN}"]` ? layer : null,
    });
    expect(isCommentsLayerOpen(doc(true))).toBe(true);
    expect(isCommentsLayerOpen(doc(false))).toBe(false);
    // На сервере и в node без document — закрыто
    expect(isCommentsLayerOpen()).toBe(false);
  });
});
