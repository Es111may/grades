import { describe, it, expect } from 'vitest';
import {
  SESSION_REFRESH_MS,
  isRefreshDue,
  resolveSessionRefresh,
  sessionUserIds,
} from '../sessionFreshness';

const now = 1_800_000_000_000;

describe('isRefreshDue', () => {
  it('метки нет (токен до этой версии) — пора', () => {
    expect(isRefreshDue(undefined, now)).toBe(true);
    expect(isRefreshDue('вчера', now)).toBe(true);
  });
  it('меньше 5 минут — рано', () => {
    expect(isRefreshDue(now - 1000, now)).toBe(false);
    expect(isRefreshDue(now - SESSION_REFRESH_MS + 1, now)).toBe(false);
  });
  it('5 минут и больше — пора', () => {
    expect(isRefreshDue(now - SESSION_REFRESH_MS, now)).toBe(true);
    expect(isRefreshDue(now - 60 * 60 * 1000, now)).toBe(true);
  });
  it('метка из будущего — пора', () => {
    expect(isRefreshDue(now + 60_000, now)).toBe(true);
  });
});

describe('sessionUserIds', () => {
  it('обычная сессия — один id', () => {
    expect(sessionUserIds({ numericId: 5, impersonatorId: null })).toEqual([5]);
    expect(sessionUserIds({ numericId: 5 })).toEqual([5]);
  });
  it('имперсонация — оба', () => {
    expect(sessionUserIds({ numericId: 5, impersonatorId: 1 })).toEqual([5, 1]);
  });
});

describe('resolveSessionRefresh', () => {
  const designer = { id: 5, role: 'designer', active: true, fullName: 'Иван Тестов' };
  const admin = { id: 1, role: 'admin', active: true, fullName: 'Админ Тестов' };

  it('активный — живёт, роль и имя из БД', () => {
    expect(
      resolveSessionRefresh({ numericId: 5 }, [{ ...designer, role: 'stardiz', fullName: 'Иван Новый' }]),
    ).toEqual({ ok: true, role: 'stardiz', fullName: 'Иван Новый' });
  });
  it('удалён или деактивирован — сессия мертва', () => {
    expect(resolveSessionRefresh({ numericId: 5 }, [])).toEqual({ ok: false });
    expect(resolveSessionRefresh({ numericId: 5 }, [{ ...designer, active: false }])).toEqual({
      ok: false,
    });
  });
  it('имперсонация: данные — того, под кем вошли', () => {
    expect(resolveSessionRefresh({ numericId: 5, impersonatorId: 1 }, [designer, admin])).toEqual({
      ok: true,
      role: 'designer',
      fullName: 'Иван Тестов',
    });
  });
  it('имперсонация: вошедший перестал быть админом или деактивирован — сессия мертва', () => {
    const t = { numericId: 5, impersonatorId: 1 };
    expect(resolveSessionRefresh(t, [designer, { ...admin, role: 'lead' }])).toEqual({ ok: false });
    expect(resolveSessionRefresh(t, [designer, { ...admin, active: false }])).toEqual({ ok: false });
    expect(resolveSessionRefresh(t, [designer])).toEqual({ ok: false });
  });
  it('имперсонация: цель деактивирована — сессия мертва', () => {
    expect(
      resolveSessionRefresh({ numericId: 5, impersonatorId: 1 }, [{ ...designer, active: false }, admin]),
    ).toEqual({ ok: false });
  });
});
