import { describe, expect, it, vi } from 'vitest';

// Скрипт тянет Prisma — в тесте базы нет: проверяем разбор аргументов и вывод.
vi.mock('../db', () => ({ prisma: {} }));

import { formatList, parseAmount, parseArgs } from '../../../scripts/salary-override';

describe('scripts/salary-override — аргументы', () => {
  it('--set: email в нижнем регистре, сумма в рублях', () => {
    expect(
      parseArgs(['--set', '--email= Person@Ida.Test ', '--amount=110 000', '--owner=Owner@ida.test']),
    ).toEqual({ mode: 'set', email: 'person@ida.test', amount: 110_000, owner: 'owner@ida.test' });
  });
  it('--remove и --list', () => {
    expect(parseArgs(['--remove', '--email=person@ida.test'])).toEqual({
      mode: 'remove',
      email: 'person@ida.test',
    });
    expect(parseArgs(['--list'])).toEqual({ mode: 'list' });
  });
  it('ровно один режим', () => {
    expect(() => parseArgs([])).toThrow(/ровно один режим/);
    expect(() => parseArgs(['--set', '--list'])).toThrow(/ровно один режим/);
  });
  it('лишнее и неизвестное — ошибка', () => {
    expect(() => parseArgs(['--list', '--email=a@b.c'])).toThrow(/--list — без/);
    expect(() => parseArgs(['--remove', '--email=a@b.c', '--amount=100000'])).toThrow(/только с --email/);
    expect(() => parseArgs(['--set', '--email=a@b.c', '--amount=100000', '--owner=o@b.c', '--force'])).toThrow(
      /Неизвестные аргументы: --force/,
    );
  });
  it('--set без владельца, без email или с плохим email — ошибка', () => {
    expect(() => parseArgs(['--set', '--email=a@b.c', '--amount=100000'])).toThrow(/--owner/);
    expect(() => parseArgs(['--set', '--amount=100000', '--owner=o@b.c'])).toThrow(/--email — без email/);
    expect(() => parseArgs(['--set', '--email=не-почта', '--amount=100000', '--owner=o@b.c'])).toThrow(
      /не похоже на email/,
    );
  });
  it('сумма — целые рубли в разумных пределах', () => {
    expect(parseAmount('150000')).toBe(150_000);
    expect(parseAmount('150_000')).toBe(150_000);
    expect(() => parseAmount('150')).toThrow(/не в тысячах/);
    expect(() => parseAmount('150000.5')).toThrow(/целое число/);
    expect(() => parseAmount('-150000')).toThrow(/целое число/);
    expect(() => parseAmount('99999999')).toThrow(/от 1/);
    expect(() => parseAmount(undefined)).toThrow(/без суммы/);
  });
});

describe('scripts/salary-override — список', () => {
  it('пусто', () => {
    expect(formatList([])).toBe('Записей нет.');
  });
  it('строка на запись; владельца нет — так и пишем', () => {
    const out = formatList([
      {
        email: 'person@ida.test',
        fullName: 'Тест Тестов',
        amount: 110_000,
        ownerEmail: 'owner@ida.test',
        updatedAt: new Date('2026-11-02T07:05:00Z'),
      },
      { email: 'p2@ida.test', fullName: 'Второй', amount: 90_000, ownerEmail: null, updatedAt: new Date('2026-11-01T00:00:00Z') },
    ]);
    expect(out).toMatch(/^Записей: 2/);
    expect(out).toMatch(/Тест Тестов <person@ida\.test> — 110\s000 ₽\/мес · владелец: owner@ida\.test · изменена 02\.11\.2026 10:05 МСК/);
    expect(out).toMatch(/владелец: — \(удалён/);
  });
});
