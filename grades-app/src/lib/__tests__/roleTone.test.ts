import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { ROLE_LABEL, roleLabel, roleToneClass } from '../roleTone';

const ROLES = ['admin', 'lead', 'stardiz', 'designer'];

describe('roleLabel', () => {
  it('подписывает четыре роли', () => {
    expect(roleLabel('admin')).toBe('Админ');
    expect(roleLabel('lead')).toBe('Лид');
    expect(roleLabel('stardiz')).toBe('Стардиз');
    expect(roleLabel('designer')).toBe('Дизайнер');
  });

  it('неизвестную роль показывает как есть', () => {
    expect(roleLabel('intern')).toBe('intern');
  });
});

describe('roleToneClass', () => {
  it('у каждой роли свой класс тона', () => {
    expect(new Set(ROLES.map(roleToneClass)).size).toBe(4);
    expect(roleToneClass('stardiz')).toBe('chip-role-stardiz');
  });

  it('неизвестная роль — нейтральный тон дизайнера', () => {
    expect(roleToneClass('intern')).toBe(roleToneClass('designer'));
  });

  // Классы живут в globals.css: переименовали там — тест напомнит здесь
  it('все классы тона объявлены в globals.css, у стардиза — правка светлой темы', () => {
    const css = readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf8');
    for (const r of Object.keys(ROLE_LABEL)) {
      expect(css).toContain(`.${roleToneClass(r)} {`);
    }
    expect(css).toMatch(/html\[data-theme='light'\] \.chip-role-stardiz \{\s*@apply text-ink;/);
  });
});
