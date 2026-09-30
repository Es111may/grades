import { describe, it, expect } from 'vitest';
import { validateScores } from '../assessmentScores';

const skills = [
  { id: 1, maxMasteryLevel: 5 },
  { id: 2, maxMasteryLevel: 3 },
];

describe('validateScores', () => {
  it('корректные баллы, включая 0 и максимум', () => {
    expect(
      validateScores(
        [
          { skillId: 1, masteryLevel: 0 },
          { skillId: 1, masteryLevel: 5 },
          { skillId: 2, masteryLevel: 3 },
        ],
        skills,
      ),
    ).toBeNull();
  });
  it('только флажок, без уровня — можно', () => {
    expect(validateScores([{ skillId: 2, flagged: true }], skills)).toBeNull();
  });
  it('пустой список — можно', () => {
    expect(validateScores([], skills)).toBeNull();
  });
  it('навык не из матрицы оценки — ошибка, даже с одним флажком', () => {
    expect(validateScores([{ skillId: 99, masteryLevel: 1 }], skills)).toMatch(/#99/);
    expect(validateScores([{ skillId: 99, flagged: true }], skills)).toMatch(/#99/);
  });
  it('уровень выше максимума навыка', () => {
    expect(validateScores([{ skillId: 2, masteryLevel: 4 }], skills)).toMatch(/от 0 до 3/);
  });
  it('отрицательный и дробный уровень', () => {
    expect(validateScores([{ skillId: 1, masteryLevel: -1 }], skills)).not.toBeNull();
    expect(validateScores([{ skillId: 1, masteryLevel: 2.5 }], skills)).not.toBeNull();
    expect(validateScores([{ skillId: 1, masteryLevel: NaN }], skills)).not.toBeNull();
  });
  it('одна плохая запись валит всю пачку', () => {
    expect(
      validateScores(
        [
          { skillId: 1, masteryLevel: 2 },
          { skillId: 2, masteryLevel: 9 },
        ],
        skills,
      ),
    ).not.toBeNull();
  });
});
