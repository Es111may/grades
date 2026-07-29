import { describe, it, expect } from 'vitest';
import {
  canSeeGradingDate,
  canSetGradingDate,
  gradingPlanStatus,
  gradingPlanTone,
} from '../gradingPlan';

const NOW = new Date('2026-10-07T12:00:00Z');
const d = (s: string) => new Date(s + 'T00:00:00Z');

describe('gradingPlanStatus — состояния', () => {
  it('без даты — «не запланировано»', () => {
    const r = gradingPlanStatus({ nextGradingAt: null }, NOW);
    expect(r.state).toBe('none');
    expect(r.plannedAt).toBeNull();
    expect(r.daysLeft).toBeNull();
  });

  it('дата далеко — «запланировано»', () => {
    const r = gradingPlanStatus({ nextGradingAt: d('2026-11-15') }, NOW);
    expect(r.state).toBe('planned');
    expect(r.daysLeft).toBe(39);
  });

  it('до даты ≤7 дней — «на подходе»', () => {
    expect(gradingPlanStatus({ nextGradingAt: d('2026-10-14') }, NOW).state).toBe(
      'soon',
    );
    // Ровно сегодня — тоже «на подходе», не просрочка
    expect(gradingPlanStatus({ nextGradingAt: d('2026-10-07') }, NOW).state).toBe(
      'soon',
    );
  });

  it('день после даты и до двух недель — «срок подошёл», не тревога', () => {
    expect(gradingPlanStatus({ nextGradingAt: d('2026-10-06') }, NOW).state).toBe(
      'due',
    );
    // Ровно 14 дней просрочки — ещё не тревога (порог Pavel)
    expect(gradingPlanStatus({ nextGradingAt: d('2026-09-23') }, NOW).state).toBe(
      'due',
    );
  });

  it('больше двух недель — «просрочено»', () => {
    const r = gradingPlanStatus({ nextGradingAt: d('2026-09-22') }, NOW);
    expect(r.state).toBe('overdue');
    expect(r.daysLeft).toBe(-15);
  });
});

describe('gradingPlanStatus — «проведено»', () => {
  it('оценка после постановки даты — проведено, с фактической датой', () => {
    // Сценарий Pavel: дату поставили 1 окт на 7 окт, провели 13 окт
    const r = gradingPlanStatus(
      {
        nextGradingAt: d('2026-10-07'),
        nextGradingSetAt: d('2026-10-01'),
        lastPublishedAt: d('2026-10-13'),
      },
      new Date('2026-10-25T12:00:00Z'),
    );
    expect(r.state).toBe('done');
    expect(r.completedAt).toEqual(d('2026-10-13'));
    expect(r.plannedAt).toEqual(d('2026-10-07'));
  });

  it('досрочное грейдирование тоже считается проведённым', () => {
    // План 7 окт, провели 3 окт — раньше плана, но позже постановки
    const r = gradingPlanStatus(
      {
        nextGradingAt: d('2026-10-07'),
        nextGradingSetAt: d('2026-10-01'),
        lastPublishedAt: d('2026-10-03'),
      },
      new Date('2026-10-30T12:00:00Z'),
    );
    expect(r.state).toBe('done');
    // Без этого правила было бы «просрочено» — главный смысл nextGradingSetAt
    expect(r.state).not.toBe('overdue');
  });

  it('старая оценка до постановки даты не закрывает новый план', () => {
    const r = gradingPlanStatus(
      {
        nextGradingAt: d('2026-10-07'),
        nextGradingSetAt: d('2026-10-01'),
        lastPublishedAt: d('2026-05-20'),
      },
      new Date('2026-10-30T12:00:00Z'),
    );
    expect(r.state).toBe('overdue');
  });

  it('без отметки постановки считаем от плановой даты', () => {
    // Данные до этой фазы: nextGradingSetAt пустой
    expect(
      gradingPlanStatus(
        { nextGradingAt: d('2026-10-07'), lastPublishedAt: d('2026-10-13') },
        new Date('2026-10-25T12:00:00Z'),
      ).state,
    ).toBe('done');
    // Оценка раньше плана без отметки — не «проведено», чтобы не врать
    expect(
      gradingPlanStatus(
        { nextGradingAt: d('2026-10-07'), lastPublishedAt: d('2026-10-03') },
        new Date('2026-10-25T12:00:00Z'),
      ).state,
    ).toBe('overdue');
  });

  it('принимает ISO-строки, а не только Date', () => {
    const r = gradingPlanStatus(
      {
        nextGradingAt: '2026-10-07T00:00:00.000Z',
        nextGradingSetAt: '2026-10-01T00:00:00.000Z',
        lastPublishedAt: '2026-10-13T00:00:00.000Z',
      },
      new Date('2026-10-25T12:00:00Z'),
    );
    expect(r.state).toBe('done');
  });

  it('мусорную дату не роняет, а считает отсутствующей', () => {
    expect(gradingPlanStatus({ nextGradingAt: 'не дата' }, NOW).state).toBe('none');
  });
});

describe('gradingPlanTone', () => {
  it('просрочка — danger, подход — warn, проведено — ok', () => {
    expect(gradingPlanTone('overdue')).toBe('danger');
    expect(gradingPlanTone('due')).toBe('warn');
    expect(gradingPlanTone('soon')).toBe('warn');
    expect(gradingPlanTone('done')).toBe('ok');
    expect(gradingPlanTone('planned')).toBe('muted');
    expect(gradingPlanTone('none')).toBe('muted');
  });
});

describe('права на дату', () => {
  const admin = { id: 1, role: 'admin' };
  const lead = { id: 10, role: 'lead' };
  const stardiz = { id: 20, role: 'stardiz' };
  const designer = { id: 30, role: 'designer' };
  // Дизайнер под лидом 10 и стардизом 20
  const target = { id: 30, leadId: 10, stardizId: 20 };
  const other = { id: 31, leadId: 11, stardizId: null };

  it('админ ставит всем', () => {
    expect(canSetGradingDate(admin, target)).toBe(true);
    expect(canSetGradingDate(admin, other)).toBe(true);
  });

  it('лид и стардиз — только своим подопечным', () => {
    expect(canSetGradingDate(lead, target)).toBe(true);
    expect(canSetGradingDate(stardiz, target)).toBe(true);
    expect(canSetGradingDate(lead, other)).toBe(false);
    expect(canSetGradingDate(stardiz, other)).toBe(false);
  });

  it('дизайнер свою дату не меняет', () => {
    expect(canSetGradingDate(designer, target)).toBe(false);
  });

  it('без сессии — нельзя', () => {
    expect(canSetGradingDate(null, target)).toBe(false);
    expect(canSeeGradingDate(null, target)).toBe(false);
  });

  it('свою дату видно, хотя менять нельзя', () => {
    expect(canSeeGradingDate(designer, target)).toBe(true);
    expect(canSetGradingDate(designer, target)).toBe(false);
  });

  it('чужую дату дизайнер не видит', () => {
    expect(canSeeGradingDate(designer, other)).toBe(false);
  });

  it('стардиз видит и свою, и подопечных', () => {
    // Своя строка: стардиз сам грейдируется
    expect(canSeeGradingDate(stardiz, { id: 20, leadId: 10, stardizId: null })).toBe(
      true,
    );
    expect(canSeeGradingDate(stardiz, target)).toBe(true);
  });
});
