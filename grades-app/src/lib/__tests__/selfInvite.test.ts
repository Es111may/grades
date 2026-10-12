import { describe, it, expect } from 'vitest';
import {
  SELF_ASSESSMENT_PATH,
  isSelfParam,
  selfAssessmentInvite,
  withoutSelfParam,
} from '../selfInvite';

describe('selfAssessmentInvite', () => {
  it('имя — первое слово ФИО, ссылка — портрет дизайнера с ?self=1', () => {
    expect(selfAssessmentInvite('Мария Соколова', 'https://grades.example')).toBe(
      'Привет, Мария! Оцени себя, пожалуйста, в Грейдах: https://grades.example/designer?self=1',
    );
  });
  it('лишний слэш в origin не удваивается, пробелы в имени не мешают', () => {
    expect(selfAssessmentInvite('  Саша  Тимкина ', 'http://localhost:3000/')).toBe(
      'Привет, Саша! Оцени себя, пожалуйста, в Грейдах: http://localhost:3000/designer?self=1',
    );
  });
  it('путь — /designer, а не админский адрес «Команды»', () => {
    expect(SELF_ASSESSMENT_PATH).toBe('/designer?self=1');
  });
});

describe('isSelfParam', () => {
  it('только «1»', () => {
    expect(isSelfParam('1')).toBe(true);
    expect(isSelfParam('0')).toBe(false);
    expect(isSelfParam('')).toBe(false);
    expect(isSelfParam(undefined)).toBe(false);
    expect(isSelfParam(null)).toBe(false);
    expect(isSelfParam(['1', '1'])).toBe(false);
  });
});

describe('withoutSelfParam', () => {
  it('убирает self, остальное оставляет', () => {
    expect(withoutSelfParam('http://x/designer?self=1')).toBe('/designer');
    expect(withoutSelfParam('/designer?assessmentId=3&self=1#skills')).toBe(
      '/designer?assessmentId=3#skills',
    );
    expect(withoutSelfParam('/designer')).toBe('/designer');
  });
});
