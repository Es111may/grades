import { describe, it, expect } from 'vitest';
import {
  GRADING_BUILD_WHERE,
  NON_GRADING_BUILD_CODES,
  buildCodeOf,
  canSetEmploymentType,
  countsForOnTime,
  isGradable,
  isGradingExempt,
  isHourly,
  isNonGradingBuild,
  nonGradingBuildNote,
  notGradableError,
} from '../employment';

const creator = { code: 'creator' };
const comms = { code: 'communications' };
const designer = { role: 'designer', active: true, employmentType: 'staff', build: creator };
const hourly = { role: 'designer', active: true, employmentType: 'hourly', build: creator };
// Коммуникационный дизайнер: штатный, но билд без грейдов
const commsDesigner = { role: 'designer', active: true, employmentType: 'staff', build: comms };

describe('isHourly', () => {
  it('различает почасовщика и штатного', () => {
    expect(isHourly(hourly)).toBe(true);
    expect(isHourly(designer)).toBe(false);
  });
  it('без поля — штатный (старые записи до миграции)', () => {
    expect(isHourly({})).toBe(false);
    expect(isHourly({ employmentType: null })).toBe(false);
  });
});

describe('билд без грейдов', () => {
  it('«Коммуникации» — в списке, билды с матрицей — нет', () => {
    expect(NON_GRADING_BUILD_CODES.has('communications')).toBe(true);
    for (const code of ['creator', 'visioner', 'navigator']) {
      expect(NON_GRADING_BUILD_CODES.has(code)).toBe(false);
    }
  });
  it('код билда — из связи или плоского поля', () => {
    expect(buildCodeOf({ build: comms })).toBe('communications');
    expect(buildCodeOf({ buildCode: 'communications' })).toBe('communications');
    expect(buildCodeOf({ build: null })).toBeNull();
    expect(buildCodeOf({ buildCode: null })).toBeNull();
  });
  it('isNonGradingBuild — по связи и по buildCode', () => {
    expect(isNonGradingBuild({ build: comms })).toBe(true);
    expect(isNonGradingBuild({ buildCode: 'communications' })).toBe(true);
    expect(isNonGradingBuild({ build: creator })).toBe(false);
    expect(isNonGradingBuild({ build: null })).toBe(false);
  });
  it('подпись-причина — только у билда без грейдов', () => {
    expect(nonGradingBuildNote({ build: comms })).toBe('Билд «Коммуникации» — без грейдов');
    expect(nonGradingBuildNote({ build: creator })).toBeNull();
    expect(nonGradingBuildNote({ buildCode: null })).toBeNull();
  });
  it('отказ API называет билд, иначе — общий текст', () => {
    expect(notGradableError(commsDesigner)).toBe('Билд «Коммуникации» — без грейдов');
    expect(notGradableError(hourly)).toBe('Почасовщиков и неактивных не грейдируют');
  });
  it('фильтр билдов с матрицей исключает «Коммуникации»', () => {
    expect(GRADING_BUILD_WHERE.code.notIn).toContain('communications');
    expect(GRADING_BUILD_WHERE.code.notIn).not.toContain('creator');
  });
});

describe('isGradingExempt — вне грейдирования по формату или билду', () => {
  it('почасовщик и билд без грейдов — да, штатный в билде с матрицей — нет', () => {
    expect(isGradingExempt(hourly)).toBe(true);
    expect(isGradingExempt(commsDesigner)).toBe(true);
    expect(isGradingExempt(designer)).toBe(false);
  });
  it('без билда — по формату', () => {
    expect(isGradingExempt({ employmentType: 'staff', build: null })).toBe(false);
    expect(isGradingExempt({ employmentType: 'hourly', buildCode: null })).toBe(true);
  });
});

describe('isGradable — грейдирование и таланты', () => {
  it('штатный дизайнер и стардиз участвуют', () => {
    expect(isGradable(designer)).toBe(true);
    expect(isGradable({ role: 'stardiz', active: true, build: creator })).toBe(true);
  });
  it('почасовщик не участвует', () => {
    expect(isGradable(hourly)).toBe(false);
  });
  it('билд «Коммуникации» не участвует — и через связь, и через buildCode', () => {
    expect(isGradable(commsDesigner)).toBe(false);
    expect(isGradable({ role: 'designer', active: true, buildCode: 'communications' })).toBe(false);
    expect(isGradable({ role: 'stardiz', active: true, build: comms })).toBe(false);
  });
  it('без билда — грейдируется, как раньше (билд проверяет форма оценки)', () => {
    expect(isGradable({ role: 'designer', active: true, build: null })).toBe(true);
  });
  it('неактивный и лид не участвуют', () => {
    expect(isGradable({ ...designer, active: false })).toBe(false);
    expect(isGradable({ role: 'lead', active: true, build: null })).toBe(false);
  });
});

describe('countsForOnTime — «в срок» команды', () => {
  it('почасовщик и билд без грейдов учитываются, как и штатный', () => {
    expect(countsForOnTime(hourly)).toBe(true);
    expect(countsForOnTime(commsDesigner)).toBe(true);
    expect(countsForOnTime(designer)).toBe(true);
  });
  it('неактивный — нет', () => {
    expect(countsForOnTime({ ...hourly, active: false })).toBe(false);
  });
});

describe('canSetEmploymentType', () => {
  const target = { role: 'designer', leadId: 10 };
  it('админ — любому дизайнеру', () => {
    expect(canSetEmploymentType({ id: 1, role: 'admin' }, target)).toBe(true);
  });
  it('лид — только своему', () => {
    expect(canSetEmploymentType({ id: 10, role: 'lead' }, target)).toBe(true);
    expect(canSetEmploymentType({ id: 11, role: 'lead' }, target)).toBe(false);
  });
  it('стардиз и дизайнер — нет', () => {
    expect(canSetEmploymentType({ id: 20, role: 'stardiz' }, { role: 'designer', leadId: 20 })).toBe(false);
    expect(canSetEmploymentType({ id: 30, role: 'designer' }, target)).toBe(false);
  });
  it('статус есть только у дизайнеров', () => {
    expect(canSetEmploymentType({ id: 1, role: 'admin' }, { role: 'stardiz', leadId: 10 })).toBe(false);
  });
  it('без сессии — нельзя', () => {
    expect(canSetEmploymentType(null, target)).toBe(false);
  });
});
