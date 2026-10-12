import { describe, it, expect } from 'vitest';
import { isPlainClick } from '../linkClick';

const click = (over: Partial<Parameters<typeof isPlainClick>[0]> = {}) => ({
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});

describe('isPlainClick', () => {
  it('левая кнопка без модификаторов (и Enter на ссылке) — обычный', () => {
    expect(isPlainClick(click())).toBe(true);
  });
  it('Cmd, Ctrl, Shift, Alt — за браузером', () => {
    expect(isPlainClick(click({ metaKey: true }))).toBe(false);
    expect(isPlainClick(click({ ctrlKey: true }))).toBe(false);
    expect(isPlainClick(click({ shiftKey: true }))).toBe(false);
    expect(isPlainClick(click({ altKey: true }))).toBe(false);
  });
  it('средняя и правая кнопки — за браузером', () => {
    expect(isPlainClick(click({ button: 1 }))).toBe(false);
    expect(isPlainClick(click({ button: 2 }))).toBe(false);
  });
});
