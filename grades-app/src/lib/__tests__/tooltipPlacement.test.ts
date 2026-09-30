import { describe, it, expect } from 'vitest';
import { placeTooltip } from '../tooltipPlacement';

const viewport = { width: 1280, height: 800 };
// Иконка 16×16 в середине экрана
const anchor = { top: 300, left: 600, right: 616, bottom: 316 };
const tip = { width: 200, height: 60 };

describe('placeTooltip', () => {
  it('по умолчанию — под якорем с зазором 8px', () => {
    const p = placeTooltip(anchor, tip, viewport, 'left');
    expect(p).toEqual({ top: 324, left: 600, placement: 'bottom' });
  });

  it('выравнивание: center — по центру якоря, right — по правому краю', () => {
    expect(placeTooltip(anchor, tip, viewport, 'center').left).toBe(508);
    expect(placeTooltip(anchor, tip, viewport, 'right').left).toBe(416);
  });

  it('снизу не влезает — переворачивается над якорем', () => {
    const low = { top: 760, left: 600, right: 616, bottom: 776 };
    const p = placeTooltip(low, tip, viewport, 'center');
    expect(p.placement).toBe('top');
    expect(p.top).toBe(760 - 8 - 60);
  });

  it('ровно впритык к нижнему отступу — ещё снизу', () => {
    // 316 + 8 + 60 = 384 = 392 - 8
    const p = placeTooltip(anchor, tip, { width: 1280, height: 392 }, 'left');
    expect(p.placement).toBe('bottom');
    expect(p.top).toBe(324);
  });

  it('не влезает нигде — сторона, где места больше, и прижим к краю окна', () => {
    const tall = { width: 200, height: 500 };
    const p = placeTooltip(anchor, tall, viewport, 'left');
    // Снизу 800-8-324 = 468, сверху 300-8-8 = 284 → снизу, прижат к низу
    expect(p.placement).toBe('bottom');
    expect(p.top).toBe(800 - 8 - 500);
  });

  it('у левого края зажимается в отступ 8px', () => {
    const edge = { top: 300, left: 4, right: 20, bottom: 316 };
    expect(placeTooltip(edge, tip, viewport, 'center').left).toBe(8);
    expect(placeTooltip(edge, tip, viewport, 'right').left).toBe(8);
  });

  it('у правого края зажимается в отступ 8px', () => {
    const edge = { top: 300, left: 1250, right: 1266, bottom: 316 };
    expect(placeTooltip(edge, tip, viewport, 'left').left).toBe(1280 - 8 - 200);
    expect(placeTooltip(edge, tip, viewport, 'center').left).toBe(1280 - 8 - 200);
  });

  it('поповер шире окна — прижат к левому отступу', () => {
    const p = placeTooltip(anchor, { width: 400, height: 60 }, { width: 360, height: 800 }, 'center');
    expect(p.left).toBe(8);
  });

  it('координаты — целые пиксели', () => {
    const frac = { top: 300.4, left: 600.3, right: 615.7, bottom: 315.6 };
    const p = placeTooltip(frac, { width: 201, height: 60 }, viewport, 'center');
    expect(Number.isInteger(p.top)).toBe(true);
    expect(Number.isInteger(p.left)).toBe(true);
  });
});
