import { beforeEach, describe, expect, it, vi } from 'vitest';

// В тесте базы нет: строку зрителя отдаёт поддельный клиент
const findUnique = vi.fn();
vi.mock('../db', () => ({ prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));

import { isActingPrimaryAdmin, managesAdmins } from '../primaryAdmin';
import { describePrimary, parseArgs } from '../../../scripts/primary-admin';

const row = { primary: true, role: 'admin', active: true };
const own = { impersonatorId: null };

describe('isActingPrimaryAdmin', () => {
  it('флаг, активный админ, вошёл сам — да', () => {
    expect(isActingPrimaryAdmin(row, own)).toBe(true);
  });
  it('флага нет, не админ, неактивен — нет', () => {
    expect(isActingPrimaryAdmin({ ...row, primary: false }, own)).toBe(false);
    expect(isActingPrimaryAdmin({ ...row, role: 'lead' }, own)).toBe(false);
    expect(isActingPrimaryAdmin({ ...row, active: false }, own)).toBe(false);
    expect(isActingPrimaryAdmin(null, own)).toBe(false);
  });
  it('под «Войти как» — нет; поля impersonatorId нет — тоже нет', () => {
    expect(isActingPrimaryAdmin(row, { impersonatorId: 7 })).toBe(false);
    expect(isActingPrimaryAdmin(row, {} as { impersonatorId: number | null })).toBe(false);
    expect(isActingPrimaryAdmin(row, null)).toBe(false);
  });
});

describe('managesAdmins — по строке из БД', () => {
  beforeEach(() => {
    findUnique.mockReset();
  });
  it('читает зрителя из БД', async () => {
    findUnique.mockResolvedValue({ role: 'admin', active: true, primaryAdmin: { slot: 1 } });
    expect(await managesAdmins({ id: 1, impersonatorId: null })).toBe(true);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1 } }));
  });
  it('без сессии в БД не ходит', async () => {
    expect(await managesAdmins(null)).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });
  it('роль в БД уже не admin — нет, даже если сессия ещё «админская»', async () => {
    findUnique.mockResolvedValue({ role: 'designer', active: true, primaryAdmin: { slot: 1 } });
    expect(await managesAdmins({ id: 1, impersonatorId: null })).toBe(false);
  });
  it('не главный — нет', async () => {
    findUnique.mockResolvedValue({ role: 'admin', active: true, primaryAdmin: null });
    expect(await managesAdmins({ id: 2, impersonatorId: null })).toBe(false);
  });
});

describe('scripts/primary-admin — аргументы и вывод', () => {
  it('режимы', () => {
    expect(parseArgs(['--set', '--email= Admin@Ida.Test '])).toEqual({ mode: 'set', email: 'admin@ida.test' });
    expect(parseArgs(['--unset'])).toEqual({ mode: 'unset' });
    expect(parseArgs(['--show'])).toEqual({ mode: 'show' });
  });
  it('ошибки', () => {
    expect(() => parseArgs([])).toThrow(/ровно один режим/);
    expect(() => parseArgs(['--set', '--unset'])).toThrow(/ровно один режим/);
    expect(() => parseArgs(['--set'])).toThrow(/нужен --email/);
    expect(() => parseArgs(['--set', '--email=не-почта'])).toThrow(/не похоже на email/);
    expect(() => parseArgs(['--unset', '--email=a@b.c'])).toThrow(/без --email/);
    expect(() => parseArgs(['--show', '--force'])).toThrow(/Неизвестные аргументы: --force/);
  });
  it('--show: не назначен, назначен, флаг не действует', () => {
    expect(describePrimary(null)).toMatch(/не назначен/);
    const p = { fullName: 'Админ Тестов', email: 'a@ida.test', role: 'admin', active: true };
    expect(describePrimary(p)).toBe('Главный админ: Админ Тестов <a@ida.test>.');
    expect(describePrimary({ ...p, role: 'lead' })).toMatch(/не действуют/);
    expect(describePrimary({ ...p, active: false })).toMatch(/Неактивен/);
  });
});
