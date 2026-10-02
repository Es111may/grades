import { describe, expect, it } from 'vitest';
import { PERSON_PARAM, parsePersonParam, withPersonParam } from '../personParam';

describe('?person= — ссылка на поп-ап 360', () => {
  it('id — целое > 0 без ведущих нулей', () => {
    expect(PERSON_PARAM).toBe('person');
    expect(parsePersonParam('5')).toBe(5);
    expect(parsePersonParam('1234567890')).toBe(1234567890);
    for (const bad of [null, undefined, '', '0', '05', '-1', '5.0', '1e3', 'abc', '12345678901']) {
      expect(parsePersonParam(bad as string | null), String(bad)).toBeNull();
    }
  });

  it('ставит и убирает параметр, остальное в адресе не трогает', () => {
    expect(withPersonParam('/admin/users', 5)).toBe('/admin/users?person=5');
    expect(withPersonParam('/admin/users?person=5', 7)).toBe('/admin/users?person=7');
    expect(withPersonParam('/admin/users?person=5', null)).toBe('/admin/users');
    expect(withPersonParam('https://grades.local/admin/users?x=1&person=5#comment-3', null)).toBe(
      '/admin/users?x=1#comment-3',
    );
    expect(withPersonParam('/admin/users#comment-3', 9)).toBe('/admin/users?person=9#comment-3');
  });
});
