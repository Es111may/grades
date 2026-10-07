import { describe, it, expect } from 'vitest';
import { GRADE_CODES, GRADE_NAMES, GRADE_ORDER, gradeName } from '../types';
import { LEVEL_LABEL } from '../economics';

describe('названия грейдов', () => {
  it('GRADE_CODES — все грейды снизу вверх, как GRADE_ORDER', () => {
    expect(GRADE_CODES).toEqual(
      Object.entries(GRADE_ORDER)
        .sort((a, b) => a[1] - b[1])
        .map(([code]) => code),
    );
  });

  it('gradeName: название по коду, незнакомый код — как есть', () => {
    expect(gradeName('premiddle')).toBe('Пре-мидл');
    expect(gradeName('middle_plus')).toBe('Мидл+');
    expect(gradeName('intern')).toBe('intern');
  });

  it('уровни «Экономики» берут названия грейдов из GRADE_NAMES', () => {
    for (const code of GRADE_CODES) expect(LEVEL_LABEL[code]).toBe(GRADE_NAMES[code]);
    expect(LEVEL_LABEL.stardiz).toBe('Стардиз');
    expect(LEVEL_LABEL.lead).toBe('Лид');
  });
});
