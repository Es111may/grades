import { describe, it, expect } from 'vitest';
import { canSetEmploymentType, countsForOnTime, isGradable, isHourly } from '../employment';

const designer = { role: 'designer', active: true, employmentType: 'staff' };
const hourly = { role: 'designer', active: true, employmentType: 'hourly' };

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

describe('isGradable — грейдирование и таланты', () => {
  it('штатный дизайнер и стардиз участвуют', () => {
    expect(isGradable(designer)).toBe(true);
    expect(isGradable({ role: 'stardiz', active: true })).toBe(true);
  });
  it('почасовщик не участвует', () => {
    expect(isGradable(hourly)).toBe(false);
  });
  it('неактивный и лид не участвуют', () => {
    expect(isGradable({ ...designer, active: false })).toBe(false);
    expect(isGradable({ role: 'lead', active: true })).toBe(false);
  });
});

describe('countsForOnTime — «в срок» команды', () => {
  it('почасовщик учитывается, как и штатный', () => {
    expect(countsForOnTime(hourly)).toBe(true);
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
