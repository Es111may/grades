import { describe, it, expect } from 'vitest';
import { pendingPortraitView } from '../portraitPending';

const designer = {
  id: 21,
  role: 'designer',
  active: true,
  employmentType: 'staff',
  build: { code: 'navigator' },
  gradeFloor: null,
};
const hourly = { ...designer, employmentType: 'hourly' };
// Коммуникационный дизайнер: штатный, но билд без грейдов
const comms = { ...designer, build: { code: 'communications' } };

describe('pendingPortraitView — лид/админ/стардиз', () => {
  it('может оценивать — «Провести оценку» в форму этого человека', () => {
    const v = pendingPortraitView({ viewer: 'manager', person: designer, canAssess: true });
    expect(v.gradable).toBe(true);
    expect(v.action).toEqual({ href: '/lead/assess?id=21', label: 'Провести оценку' });
    expect(v.status).toEqual({ label: 'Без оценки', floor: false });
    expect(v.xp).toEqual({ text: 'Появится после первой оценки', note: null, track: true });
  });

  it('есть черновик — «Продолжить черновик» туда же', () => {
    const v = pendingPortraitView({ viewer: 'manager', person: designer, canAssess: true, hasDraft: true });
    expect(v.action).toEqual({ href: '/lead/assess?id=21', label: 'Продолжить черновик' });
  });

  it('смотрит, но не оценивает — без кнопки, с подсказкой, кто проводит', () => {
    const v = pendingPortraitView({ viewer: 'manager', person: designer, canAssess: false, hasDraft: true });
    expect(v.action).toBeNull();
    expect(v.xp.note).toBe('Оценку проводит лид или стардиз этого человека');
  });

  it('почасовщик — без кнопки (даже с правом), «Без грейда», без бара', () => {
    const v = pendingPortraitView({ viewer: 'manager', person: hourly, canAssess: true });
    expect(v.gradable).toBe(false);
    expect(v.action).toBeNull();
    expect(v.status).toEqual({ label: 'Без грейда', floor: false });
    expect(v.xp).toEqual({ text: 'Почасовщик — не грейдируется', note: 'Оценок и XP не будет', track: false });
  });

  it('билд без грейдов — причина по билду', () => {
    const v = pendingPortraitView({ viewer: 'manager', person: comms, canAssess: true });
    expect(v.action).toBeNull();
    expect(v.xp.text).toBe('Билд «Коммуникации» — без грейдов');
  });

  it('неактивный или лид — общая причина', () => {
    expect(pendingPortraitView({ viewer: 'manager', person: { ...designer, active: false } }).xp.text).toBe(
      'Сейчас не грейдируется',
    );
    expect(pendingPortraitView({ viewer: 'manager', person: { ...designer, role: 'lead' } }).xp.text).toBe(
      'Сейчас не грейдируется',
    );
  });

  it('закреплённый грейд — чипом вместо «Без оценки»', () => {
    const v = pendingPortraitView({ viewer: 'manager', person: { ...designer, gradeFloor: 'middle' } });
    expect(v.status).toEqual({ label: 'Мидл · закреплён', floor: true });
  });
});

describe('pendingPortraitView — свой портрет', () => {
  it('ждёт оценку лида, кнопки нет', () => {
    const v = pendingPortraitView({ viewer: 'self', person: designer, canAssess: true });
    expect(v.action).toBeNull();
    expect(v.xp).toEqual({ text: 'Появится, когда лид опубликует первую оценку', note: null, track: true });
  });

  it('билд без грейдов — та же причина, что у лида', () => {
    const v = pendingPortraitView({ viewer: 'self', person: comms });
    expect(v.status.label).toBe('Без грейда');
    expect(v.xp).toEqual({ text: 'Билд «Коммуникации» — без грейдов', note: 'Оценок и XP не будет', track: false });
  });
});
