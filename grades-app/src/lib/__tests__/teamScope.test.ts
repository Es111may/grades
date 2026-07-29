import { describe, it, expect } from 'vitest';
import {
  buildTeamOptions,
  countMentees,
  isMenteeOf,
  scopeOwnerId,
  type ScopePerson,
} from '../teamScope';

// Слепок структуры команды, приближённый к реальной: три лида, два стардиза,
// дизайнеры под лидами, часть — ещё и под стардизами.
const ADMIN = 1;
const NIKITA = 10; // лид
const SASHA = 11; // лид
const ARTUSH = 12; // лид
const POLINA = 20; // стардиз, лид — Никита
const ELYA = 21; // стардиз, лид — Никита

function p(
  id: number,
  fullName: string,
  role: string,
  leadId: number | null = null,
  stardizId: number | null = null,
  active = true,
): ScopePerson {
  return { id, fullName, role, active, leadId, stardizId };
}

const TEAM: ScopePerson[] = [
  p(ADMIN, 'Павел Г', 'admin'),
  p(NIKITA, 'Никита Хахай', 'lead'),
  p(SASHA, 'Саша Лучшев', 'lead'),
  p(ARTUSH, 'Артуш Манукян', 'lead'),
  p(POLINA, 'Полина Филькова', 'stardiz', NIKITA),
  p(ELYA, 'Эля Гильмуллина', 'stardiz', NIKITA),
  // Подопечные Никиты, двое из них — под стардизами
  p(30, 'Саша Тимкина', 'designer', NIKITA, POLINA),
  p(31, 'Маша Чеченева', 'designer', NIKITA, POLINA),
  p(32, 'Женя Панкратьева', 'designer', NIKITA, ELYA),
  p(33, 'Андрей Назаров', 'designer', NIKITA),
  // Подопечные Саши
  p(40, 'Галя Кузнецова', 'designer', SASHA),
  p(41, 'Катя Черкасова', 'designer', SASHA),
  // Деактивированный — в счётчики не идёт
  p(50, 'Ваня Перов', 'designer', SASHA, null, false),
];

describe('scopeOwnerId', () => {
  it('«Все» не имеет владельца', () => {
    expect(scopeOwnerId('all', ADMIN)).toBeNull();
  });
  it('«Мои» — это я', () => {
    expect(scopeOwnerId('mine', NIKITA)).toBe(NIKITA);
    expect(scopeOwnerId('mine', null)).toBeNull();
  });
  it('«u:N» — конкретный владелец', () => {
    expect(scopeOwnerId('u:20', ADMIN)).toBe(20);
  });
});

describe('isMenteeOf / countMentees', () => {
  it('считает подопечных и по лиду, и по стардизу', () => {
    // У Никиты 4 дизайнера + 2 стардиза = 6
    expect(countMentees(TEAM, NIKITA)).toBe(6);
    // У Полины двое (через stardizId)
    expect(countMentees(TEAM, POLINA)).toBe(2);
    expect(countMentees(TEAM, ELYA)).toBe(1);
  });

  it('деактивированных в счётчик не берёт', () => {
    // У Саши двое активных, Ваня Перов деактивирован
    expect(countMentees(TEAM, SASHA)).toBe(2);
    expect(isMenteeOf(TEAM.find((u) => u.id === 50)!, SASHA)).toBe(true);
  });
});

describe('buildTeamOptions — админ', () => {
  const opts = buildTeamOptions(TEAM, ADMIN, 'admin');

  it('показывает все команды лидов и стардизов', () => {
    expect([...opts.map((o) => o.label)].sort()).toEqual(
      ['Никиты', 'Полины', 'Саши', 'Эли'].sort(),
    );
  });

  it('сортирует по размеру команды, при равенстве — по алфавиту', () => {
    expect(opts.map((o) => o.count)).toEqual([6, 2, 2, 1]);
    // У Саши и Полины по 2 подопечных → «Полины» раньше «Саши»
    expect(opts.map((o) => o.label)).toEqual([
      'Никиты',
      'Полины',
      'Саши',
      'Эли',
    ]);
  });

  it('скрывает лида без подопечных', () => {
    // У Артуша подопечных нет — пункта быть не должно
    expect(opts.some((o) => o.fullName === 'Артуш Манукян')).toBe(false);
  });

  it('помечает роль, чтобы стардизы отличались от лидов', () => {
    expect(opts.find((o) => o.label === 'Полины')?.role).toBe('stardiz');
    expect(opts.find((o) => o.label === 'Никиты')?.role).toBe('lead');
  });

  it('кладёт полное имя для подсказки', () => {
    expect(opts.find((o) => o.label === 'Эли')?.fullName).toBe(
      'Эля Гильмуллина',
    );
  });
});

describe('buildTeamOptions — лид', () => {
  it('видит только команды своих стардизов, не чужих лидов', () => {
    const opts = buildTeamOptions(TEAM, NIKITA, 'lead');
    expect(opts.map((o) => o.label)).toEqual(['Полины', 'Эли']);
  });

  it('себя в список не добавляет — это пункт «Мои»', () => {
    const opts = buildTeamOptions(TEAM, NIKITA, 'lead');
    expect(opts.some((o) => o.fullName === 'Никита Хахай')).toBe(false);
  });

  it('лид без стардизов получает пустой список', () => {
    expect(buildTeamOptions(TEAM, SASHA, 'lead')).toEqual([]);
  });
});

describe('buildTeamOptions — прочие роли', () => {
  it('стардизу и дизайнеру команд не предлагаем', () => {
    expect(buildTeamOptions(TEAM, POLINA, 'stardiz')).toEqual([]);
    expect(buildTeamOptions(TEAM, 30, 'designer')).toEqual([]);
  });
});
