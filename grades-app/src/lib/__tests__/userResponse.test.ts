import { describe, it, expect } from 'vitest';
import { userForViewer } from '../userResponse';

// Выдуманная запись: ни имён, ни реальных сумм
const row = {
  id: 7,
  leadId: 10,
  email: 'test@example.com',
  fullName: 'Тест Тестов',
  passwordHash: '$2a$10$fake',
  active: false,
  employmentType: 'staff',
  dismissedAt: new Date('2026-09-01'),
  dismissalType: 'voluntary',
  dismissalReason: 'Переезд',
  plannedRaiseSetAt: new Date('2026-08-01'),
  plannedRaiseAt: null,
  plannedRaiseSalary: 100_000,
  plannedRaiseNote: 'после проекта',
  plannedRaiseSetById: 10,
};

const admin = { id: 1, role: 'admin' };
const ownLead = { id: 10, role: 'lead' };
const otherLead = { id: 11, role: 'lead' };
const stardiz = { id: 20, role: 'stardiz' };

describe('userForViewer', () => {
  it('хэш пароля не уходит никому, даже админу', () => {
    expect(userForViewer(row, admin)).not.toHaveProperty('passwordHash');
    expect(userForViewer(row, ownLead)).not.toHaveProperty('passwordHash');
  });

  it('админ видит увольнение целиком и пересмотр', () => {
    const r = userForViewer(row, admin);
    expect(r.dismissedAt).toEqual(row.dismissedAt);
    expect(r.dismissalType).toBe('voluntary');
    expect(r.dismissalReason).toBe('Переезд');
    expect(r.plannedRaiseSalary).toBe(100_000);
  });

  it('лид видит дату, но не тип и не причину', () => {
    const r = userForViewer(row, ownLead);
    expect(r.dismissedAt).toEqual(row.dismissedAt);
    expect(r).not.toHaveProperty('dismissalType');
    expect(r).not.toHaveProperty('dismissalReason');
  });

  it('пересмотр — только своему лиду', () => {
    expect(userForViewer(row, ownLead).plannedRaiseSalary).toBe(100_000);
    const r = userForViewer(row, otherLead);
    for (const k of [
      'plannedRaiseSetAt',
      'plannedRaiseAt',
      'plannedRaiseSalary',
      'plannedRaiseNote',
      'plannedRaiseSetById',
    ]) {
      expect(r).not.toHaveProperty(k);
    }
  });

  it('стардиз и без сессии — ни увольнения, ни пересмотра', () => {
    for (const me of [stardiz, null]) {
      const r = userForViewer(row, me);
      expect(r).not.toHaveProperty('dismissedAt');
      expect(r).not.toHaveProperty('dismissalType');
      expect(r).not.toHaveProperty('dismissalReason');
      expect(r).not.toHaveProperty('plannedRaiseSalary');
    }
  });

  it('остальные поля не трогает и исходник не мутирует', () => {
    const r = userForViewer(row, stardiz);
    expect(r.fullName).toBe(row.fullName);
    expect(r.active).toBe(false);
    expect(row.passwordHash).toBe('$2a$10$fake');
    expect(row.dismissalType).toBe('voluntary');
  });
});
