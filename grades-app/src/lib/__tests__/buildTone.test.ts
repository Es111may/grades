import { describe, it, expect } from 'vitest';
import { BUILD_DOT, NEUTRAL_DOT, buildDotColor } from '../buildTone';
import { BUILD_NAMES } from '../types';
import { NON_GRADING_BUILDS } from '../employment';

describe('buildDotColor', () => {
  // Хексы — те же, что были в копиях по файлам: точки не должны поменяться
  it('сохраняет прежние цвета билдов с грейдами', () => {
    expect(buildDotColor('creator')).toBe('#00ca48');
    expect(buildDotColor('visioner')).toBe('#7c3aed');
    expect(buildDotColor('navigator')).toBe('#0ea5e9');
  });

  it('у «Коммуникаций» свой нейтральный тон, не голубой Импрува', () => {
    expect(buildDotColor('communications')).toBe(NEUTRAL_DOT);
    expect(buildDotColor('communications')).not.toBe(buildDotColor('navigator'));
  });

  it('неизвестный и пустой билд — нейтральная точка, а не чужой цвет', () => {
    expect(buildDotColor('new-build')).toBe(NEUTRAL_DOT);
    expect(buildDotColor(null)).toBe(NEUTRAL_DOT);
    expect(buildDotColor(undefined)).toBe(NEUTRAL_DOT);
    expect(buildDotColor('')).toBe(NEUTRAL_DOT);
  });

  it('цвета билдов с грейдами различаются между собой', () => {
    const graded = ['creator', 'visioner', 'navigator'].map((c) => BUILD_DOT[c]);
    expect(new Set(graded).size).toBe(3);
  });
});

describe('BUILD_DOT', () => {
  // Завели билд — заведи и цвет: иначе он молча станет нейтральной точкой
  it('есть цвет у каждого билда из BUILD_NAMES и NON_GRADING_BUILDS', () => {
    for (const code of [...Object.keys(BUILD_NAMES), ...Object.keys(NON_GRADING_BUILDS)]) {
      expect(BUILD_DOT[code], code).toBeTruthy();
    }
  });
});
