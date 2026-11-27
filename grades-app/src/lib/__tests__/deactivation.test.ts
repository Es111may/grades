import { describe, expect, it } from 'vitest';
import { deactivationWrites } from '../deactivation';

const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TODAY = D('2026-11-27');

describe('deactivationWrites — интерфейс (как было в DELETE /api/users/[id])', () => {
  it('даты увольнения нет — ставим сегодняшнюю, в «Действия» две записи', () => {
    const w = deactivationWrites({ id: 5, hiredAt: D('2024-01-01'), dismissedAt: null }, { actorId: 1, today: TODAY });
    expect(w.data).toEqual({ active: false, dismissedAt: TODAY });
    expect(w.audits).toEqual([
      { actorId: 1, action: 'user_deactivated', targetType: 'user', targetId: 5, details: { before: true, after: false } },
      {
        actorId: 1,
        action: 'dismissal_updated',
        targetType: 'user',
        targetId: 5,
        details: { before: null, after: '2026-11-27', typeChanged: false, reasonChanged: false, auto: true },
      },
    ]);
  });

  it('дата есть и не раньше найма — не трогаем, одна запись', () => {
    const w = deactivationWrites({ id: 5, hiredAt: D('2024-01-01'), dismissedAt: D('2026-10-31') }, { actorId: 1, today: TODAY });
    expect(w.data).toEqual({ active: false });
    expect(w.audits.map((a) => a.action)).toEqual(['user_deactivated']);
  });

  it('дата от прошлого трудоустройства (раньше найма) — новая', () => {
    const w = deactivationWrites({ id: 5, hiredAt: D('2024-01-01'), dismissedAt: D('2022-05-01') }, { actorId: 1, today: TODAY });
    expect(w.data.dismissedAt).toEqual(TODAY);
    expect(w.audits[1].details).toMatchObject({ before: '2022-05-01', after: '2026-11-27' });
  });
});

describe('deactivationWrites — сверка с HR', () => {
  const note = { reason: 'Сверка с HR', hrId: 'hr-1' };

  it('пустая дата — из HR, пометка в обеих записях', () => {
    const w = deactivationWrites(
      { id: 5, hiredAt: D('2024-01-01'), dismissedAt: null },
      { actorId: 1, today: TODAY, hrDismissedAt: D('2026-09-30'), note },
    );
    expect(w.data).toEqual({ active: false, dismissedAt: D('2026-09-30') });
    expect(w.audits.map((a) => a.details)).toEqual([
      { before: true, after: false, reason: 'Сверка с HR', hrId: 'hr-1' },
      { before: null, after: '2026-09-30', typeChanged: false, reasonChanged: false, auto: true, reason: 'Сверка с HR', hrId: 'hr-1' },
    ]);
  });

  it('дата из HR раньше найма в Грейдах или в будущем — сегодняшняя, как в интерфейсе', () => {
    for (const hr of [D('2023-06-01'), D('2026-12-15')]) {
      const w = deactivationWrites(
        { id: 5, hiredAt: D('2024-01-01'), dismissedAt: null },
        { actorId: 1, today: TODAY, hrDismissedAt: hr, note },
      );
      expect(w.data.dismissedAt).toEqual(TODAY);
    }
  });

  it('дата в Грейдах уже стоит — HR её не перетирает', () => {
    const w = deactivationWrites(
      { id: 5, hiredAt: D('2024-01-01'), dismissedAt: D('2026-08-01') },
      { actorId: 1, today: TODAY, hrDismissedAt: D('2026-09-30'), note },
    );
    expect(w.data).toEqual({ active: false });
  });
});
