import { describe, it, expect } from 'vitest';
import {
  canHaveGradingDate,
  gradingDateChange,
  mentorError,
  needsDismissalDate,
  selfEditLockedFields,
  todayMoscowDate,
} from '../userUpdate';

const d = (iso: string) => new Date(iso);

describe('needsDismissalDate — дата увольнения при деактивации', () => {
  it('даты нет — ставим', () => {
    expect(needsDismissalDate({ dismissedAt: null, hiredAt: d('2024-03-01') })).toBe(true);
    expect(needsDismissalDate({ dismissedAt: null, hiredAt: null })).toBe(true);
  });
  it('вернувшийся: старая дата раньше найма — ставим новую', () => {
    expect(
      needsDismissalDate({ dismissedAt: d('2023-05-10'), hiredAt: d('2025-01-15') }),
    ).toBe(true);
  });
  it('дата после найма — не трогаем', () => {
    expect(
      needsDismissalDate({ dismissedAt: d('2026-09-01'), hiredAt: d('2025-01-15') }),
    ).toBe(false);
  });
  it('уволен в день найма — не трогаем', () => {
    expect(
      needsDismissalDate({ dismissedAt: d('2025-01-15'), hiredAt: d('2025-01-15') }),
    ).toBe(false);
  });
  it('дата есть, найма нет — не трогаем', () => {
    expect(needsDismissalDate({ dismissedAt: d('2026-09-01'), hiredAt: null })).toBe(false);
  });
});

describe('todayMoscowDate', () => {
  it('полночь UTC московской даты', () => {
    expect(todayMoscowDate(d('2026-09-30T12:00:00Z')).toISOString()).toBe(
      '2026-09-30T00:00:00.000Z',
    );
  });
  it('с 00:00 до 03:00 по Москве — уже сегодняшняя дата, а не вчерашняя по UTC', () => {
    // 22:30 UTC 30.09 = 01:30 МСК 1.10
    expect(todayMoscowDate(d('2026-09-30T22:30:00Z')).toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    );
  });
});

describe('gradingDateChange', () => {
  const current = d('2026-10-05T00:00:00.000Z');

  it('та же дата — не меняется (и в виде ISO со временем)', () => {
    expect(gradingDateChange(current, '2026-10-05')).toEqual({ changed: false });
    expect(gradingDateChange(current, '2026-10-05T10:00:00.000Z')).toEqual({ changed: false });
  });
  it('новая дата — меняется', () => {
    const r = gradingDateChange(current, '2026-10-12');
    expect(r).toEqual({ changed: true, nextGradingAt: d('2026-10-12T00:00:00.000Z') });
  });
  it('снять дату: null и пустая строка', () => {
    expect(gradingDateChange(current, null)).toEqual({ changed: true, nextGradingAt: null });
    expect(gradingDateChange(current, '')).toEqual({ changed: true, nextGradingAt: null });
  });
  it('снять, когда и так нет — не меняется', () => {
    expect(gradingDateChange(null, null)).toEqual({ changed: false });
  });
  it('поставить, когда не было', () => {
    expect(gradingDateChange(null, '2026-11-02')).toEqual({
      changed: true,
      nextGradingAt: d('2026-11-02T00:00:00.000Z'),
    });
  });
  it('мусор — ошибка', () => {
    expect(gradingDateChange(current, 'завтра')).toEqual({
      error: 'Некорректная дата грейдирования',
    });
    expect(gradingDateChange(current, '05.10.2026')).toHaveProperty('error');
    expect(gradingDateChange(current, '2026-13-45')).toHaveProperty('error');
  });
});

describe('canHaveGradingDate', () => {
  const creator = { code: 'creator' };
  it('дизайнер и стардиз на штате — да', () => {
    expect(canHaveGradingDate({ role: 'designer', employmentType: 'staff', build: creator })).toBe(true);
    expect(canHaveGradingDate({ role: 'stardiz', build: null })).toBe(true);
  });
  it('почасовщик, лид, админ — нет', () => {
    expect(canHaveGradingDate({ role: 'designer', employmentType: 'hourly', build: creator })).toBe(false);
    expect(canHaveGradingDate({ role: 'lead', employmentType: 'staff', build: null })).toBe(false);
    expect(canHaveGradingDate({ role: 'admin', build: null })).toBe(false);
  });
  it('билд без грейдов («Коммуникации») — нет', () => {
    expect(
      canHaveGradingDate({ role: 'designer', employmentType: 'staff', build: { code: 'communications' } }),
    ).toBe(false);
    expect(canHaveGradingDate({ role: 'designer', buildCode: 'communications' })).toBe(false);
  });
});

describe('mentorError', () => {
  const lead = { id: 10, role: 'lead', active: true };
  const admin = { id: 1, role: 'admin', active: true };
  const stardiz = { id: 20, role: 'stardiz', active: true };
  const designer = { id: 30, role: 'designer', active: true };

  it('лидом — активный лид или админ', () => {
    expect(mentorError('lead', lead, 100)).toBeNull();
    expect(mentorError('lead', admin, 100)).toBeNull();
  });
  it('лидом — не стардиз и не дизайнер', () => {
    expect(mentorError('lead', stardiz, 100)).toMatch(/лида или админа/);
    expect(mentorError('lead', designer, 100)).not.toBeNull();
  });
  it('стардизом — активный стардиз, лид или админ', () => {
    expect(mentorError('stardiz', stardiz, 100)).toBeNull();
    expect(mentorError('stardiz', lead, 100)).toBeNull();
    expect(mentorError('stardiz', admin, 100)).toBeNull();
    expect(mentorError('stardiz', designer, 100)).toMatch(/стардиза, лида или админа/);
  });
  it('неактивный или несуществующий — нельзя', () => {
    expect(mentorError('lead', { ...lead, active: false }, 100)).not.toBeNull();
    expect(mentorError('stardiz', null, 100)).not.toBeNull();
  });
  it('самому себе — нельзя', () => {
    expect(mentorError('stardiz', stardiz, 20)).toMatch(/самому себе/);
  });
  it('у нового человека id нет — проверяется только роль', () => {
    expect(mentorError('lead', lead)).toBeNull();
  });
});

describe('selfEditLockedFields — лид правит свою карточку', () => {
  // Выдуманная строка лида в БД
  const me = {
    id: 10,
    fullName: 'Тест Лидов',
    email: 'lead@example.com',
    role: 'lead',
    buildId: null,
    department: 'Криэйт',
    leadId: null,
    stardizId: null,
    hiredAt: d('2024-03-01T00:00:00.000Z'),
    active: true,
    gradeFloor: null,
    gradeFloorReason: null,
    avatarUrl: 'data:image/jpeg;base64,AAAA',
    nextGradingAt: null,
    employmentType: 'staff',
    dismissedAt: null,
    dismissalType: null,
    dismissalReason: null,
  };

  it('имя и аватар — можно', () => {
    expect(
      selfEditLockedFields({ fullName: 'Новое Имя', avatarUrl: 'data:image/jpeg;base64,BBBB' }, me),
    ).toEqual([]);
    expect(selfEditLockedFields({ avatarUrl: null }, me)).toEqual([]);
  });

  it('карточка целиком с теми же значениями — не правка', () => {
    expect(
      selfEditLockedFields(
        {
          fullName: 'Новое Имя',
          email: 'LEAD@example.com',
          role: 'lead',
          buildId: null,
          department: 'Криэйт',
          leadId: null,
          stardizId: null,
          hiredAt: '2024-03-01',
          active: true,
          gradeFloor: null,
          gradeFloorReason: null,
          employmentType: 'staff',
        },
        me,
      ),
    ).toEqual([]);
  });

  it('пустая строка — то же, что пусто', () => {
    expect(selfEditLockedFields({ department: '' }, { ...me, department: null })).toEqual([]);
  });

  it('любое другое изменённое поле — нельзя', () => {
    expect(selfEditLockedFields({ role: 'admin' }, me)).toEqual(['role']);
    expect(selfEditLockedFields({ email: 'other@example.com' }, me)).toEqual(['email']);
    expect(selfEditLockedFields({ department: 'Инхаус' }, me)).toEqual(['department']);
    expect(selfEditLockedFields({ leadId: 11 }, me)).toEqual(['leadId']);
    expect(selfEditLockedFields({ active: false }, me)).toEqual(['active']);
    expect(selfEditLockedFields({ hiredAt: '2024-03-02' }, me)).toEqual(['hiredAt']);
    expect(selfEditLockedFields({ gradeFloor: 'senior' }, me)).toEqual(['gradeFloor']);
    expect(selfEditLockedFields({ nextGradingAt: '2026-10-15' }, me)).toEqual(['nextGradingAt']);
    expect(selfEditLockedFields({ dismissalType: 'voluntary' }, me)).toEqual(['dismissalType']);
  });

  it('несколько полей — все в списке, имя с ними не прячется', () => {
    expect(
      selfEditLockedFields({ fullName: 'X', role: 'admin', active: false }, me).sort(),
    ).toEqual(['active', 'role']);
  });

  it('кривая дата — считается правкой', () => {
    expect(selfEditLockedFields({ hiredAt: 'не дата' }, me)).toEqual(['hiredAt']);
  });
});
