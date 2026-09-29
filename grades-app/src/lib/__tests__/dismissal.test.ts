import { describe, it, expect } from 'vitest';
import {
  DISMISSAL_TYPES,
  DISMISSAL_TYPE_LABELS,
  canEditDismissal,
  canViewDismissalDate,
  canViewDismissalStatus,
  isDismissalType,
  showsDismissal,
} from '../dismissal';

const admin = { role: 'admin' };
const lead = { role: 'lead' };
const stardiz = { role: 'stardiz' };
const designer = { role: 'designer' };

describe('showsDismissal', () => {
  it('деактивированный — да', () => {
    expect(showsDismissal({ active: false, employmentType: 'staff' })).toBe(true);
  });
  it('почасовщик — да, даже активный: формально выведен из штата', () => {
    expect(showsDismissal({ active: true, employmentType: 'hourly' })).toBe(true);
  });
  it('активный штатный — нет', () => {
    expect(showsDismissal({ active: true, employmentType: 'staff' })).toBe(false);
  });
  it('без поля формата — штатный (старые записи)', () => {
    expect(showsDismissal({ active: true })).toBe(false);
    expect(showsDismissal({ active: true, employmentType: null })).toBe(false);
  });
});

describe('canViewDismissalDate', () => {
  it('админ и лид видят дату', () => {
    expect(canViewDismissalDate(admin)).toBe(true);
    expect(canViewDismissalDate(lead)).toBe(true);
  });
  it('стардиз, дизайнер и без сессии — нет', () => {
    expect(canViewDismissalDate(stardiz)).toBe(false);
    expect(canViewDismissalDate(designer)).toBe(false);
    expect(canViewDismissalDate(null)).toBe(false);
  });
});

describe('canViewDismissalStatus — тип и причина', () => {
  it('только админ', () => {
    expect(canViewDismissalStatus(admin)).toBe(true);
    expect(canViewDismissalStatus(lead)).toBe(false);
    expect(canViewDismissalStatus(stardiz)).toBe(false);
    expect(canViewDismissalStatus(designer)).toBe(false);
    expect(canViewDismissalStatus(null)).toBe(false);
  });
});

describe('canEditDismissal', () => {
  it('только админ — лид дату видит, но не меняет', () => {
    expect(canEditDismissal(admin)).toBe(true);
    expect(canEditDismissal(lead)).toBe(false);
    expect(canEditDismissal(stardiz)).toBe(false);
    expect(canEditDismissal(null)).toBe(false);
  });
});

describe('isDismissalType', () => {
  it('узнаёт все три типа', () => {
    for (const t of DISMISSAL_TYPES) expect(isDismissalType(t)).toBe(true);
  });
  it('чужие значения — нет', () => {
    expect(isDismissalType('fired')).toBe(false);
    expect(isDismissalType('')).toBe(false);
    expect(isDismissalType(null)).toBe(false);
    expect(isDismissalType(undefined)).toBe(false);
  });
});

describe('DISMISSAL_TYPE_LABELS', () => {
  it('у каждого типа есть подпись', () => {
    for (const t of DISMISSAL_TYPES) expect(DISMISSAL_TYPE_LABELS[t]).toBeTruthy();
    expect(Object.keys(DISMISSAL_TYPE_LABELS)).toHaveLength(DISMISSAL_TYPES.length);
  });
});
