import { describe, it, expect } from 'vitest';
import { designerPortraitHref, leadPortraitHref, portraitHref } from '../portraitHref';

const admin = { id: 1, role: 'admin' };
const lead = { id: 10, role: 'lead' };
const otherLead = { id: 11, role: 'lead' };
const stardiz = { id: 20, role: 'stardiz' };

const p = (role: string, over: Partial<{ id: number; active: boolean; leadId: number | null; stardizId: number | null }> = {}) => ({
  id: 100,
  role,
  active: true,
  leadId: 10,
  stardizId: 20,
  ...over,
});

describe('portraitHref — дизайнер', () => {
  it('админ, лид и стардиз дизайнера — /lead/portrait', () => {
    expect(portraitHref(p('designer'), admin)).toBe('/lead/portrait?id=100');
    expect(portraitHref(p('designer'), lead)).toBe('/lead/portrait?id=100');
    expect(portraitHref(p('designer'), stardiz)).toBe('/lead/portrait?id=100');
  });
  it('стардиз, указанный лидом, тоже проходит (как на странице)', () => {
    expect(portraitHref(p('designer', { leadId: 20, stardizId: null }), stardiz)).toBe(
      '/lead/portrait?id=100',
    );
  });
  it('чужой лид или стардиз — без ссылки: страница вернула бы в «Команду»', () => {
    expect(portraitHref(p('designer'), otherLead)).toBeNull();
    expect(portraitHref(p('designer'), { id: 21, role: 'stardiz' })).toBeNull();
  });
  it('дизайнер-зритель — без ссылки: раздел /lead ему закрыт', () => {
    expect(portraitHref(p('designer', { leadId: 30 }), { id: 30, role: 'designer' })).toBeNull();
  });
  it('неактивный — без ссылки, как прежняя кнопка поп-апа', () => {
    expect(portraitHref(p('designer', { active: false }), admin)).toBeNull();
  });
});

describe('portraitHref — лид и стардиз', () => {
  it('админу — портрет 360', () => {
    expect(portraitHref(p('lead', { id: 10 }), admin)).toBe('/admin/lead-reviews?userId=10');
    expect(portraitHref(p('stardiz', { id: 20 }), admin)).toBe('/admin/lead-reviews?userId=20');
  });
  it('самому себе — свой портрет 360', () => {
    expect(portraitHref(p('lead', { id: 10 }), lead)).toBe('/admin/lead-reviews?userId=10');
    expect(portraitHref(p('stardiz', { id: 20 }), stardiz)).toBe('/admin/lead-reviews?userId=20');
  });
  it('лиду своего стардиза и чужих лидов — нет: портрет 360 смотрят админ и сам человек', () => {
    expect(portraitHref(p('stardiz', { id: 20 }), lead)).toBeNull();
    expect(portraitHref(p('lead', { id: 11 }), lead)).toBeNull();
  });
  it('неактивный — нет', () => {
    expect(portraitHref(p('lead', { id: 10, active: false }), admin)).toBeNull();
  });
});

describe('portraitHref — прочее', () => {
  it('админ-человек и без сессии — без ссылки', () => {
    expect(portraitHref(p('admin', { id: 2 }), admin)).toBeNull();
    expect(portraitHref(p('designer'), null)).toBeNull();
  });
  it('пути', () => {
    expect(designerPortraitHref(7)).toBe('/lead/portrait?id=7');
    expect(leadPortraitHref(7)).toBe('/admin/lead-reviews?userId=7');
  });
});
