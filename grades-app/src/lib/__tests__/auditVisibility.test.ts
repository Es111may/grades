import { describe, it, expect } from 'vitest';
import { auditVisibilityWhere, canSeeAuditEntry, isCompAuditAction } from '../auditVisibility';

const admin = { id: 1, role: 'admin' };
const lead = { id: 10, role: 'lead' };
const stardiz = { id: 20, role: 'stardiz' };

// 100 — свой человек лида (деньги видны), 101 — подопечный только по стардизу.
const compIds = [100];

describe('isCompAuditAction', () => {
  it('плановый пересмотр и премии — денежные', () => {
    expect(isCompAuditAction('planned_raise_set')).toBe(true);
    expect(isCompAuditAction('planned_raise_cleared')).toBe(true);
    expect(isCompAuditAction('bonus_created')).toBe(true);
    expect(isCompAuditAction('bonus_deleted')).toBe(true);
  });
  it('остальное — нет', () => {
    expect(isCompAuditAction('grading_date_set')).toBe(false);
    expect(isCompAuditAction('dismissal_updated')).toBe(false);
    expect(isCompAuditAction('user_lead_changed')).toBe(false);
  });
});

describe('canSeeAuditEntry', () => {
  const raise = (targetId: number | null) => ({
    action: 'planned_raise_set',
    targetType: 'user',
    targetId,
  });

  it('админ видит всё', () => {
    expect(canSeeAuditEntry(admin, raise(555), [])).toBe(true);
    expect(canSeeAuditEntry(admin, { action: 'dismissal_updated', targetType: 'user', targetId: 1 }, [])).toBe(true);
  });
  it('лид видит деньги своих', () => {
    expect(canSeeAuditEntry(lead, raise(100), compIds)).toBe(true);
    expect(canSeeAuditEntry(lead, { action: 'bonus_created', targetType: 'user', targetId: 100 }, compIds)).toBe(true);
  });
  it('лид не видит деньги тех, чьи деньги ему не положены', () => {
    expect(canSeeAuditEntry(lead, raise(101), compIds)).toBe(false);
    expect(canSeeAuditEntry(lead, raise(null), compIds)).toBe(false);
    expect(canSeeAuditEntry(lead, { action: 'bonus_deleted', targetType: 'user', targetId: 555 }, compIds)).toBe(false);
  });
  it('лид видит увольнение (дату он и так видит)', () => {
    expect(canSeeAuditEntry(lead, { action: 'dismissal_updated', targetType: 'user', targetId: 101 }, compIds)).toBe(true);
  });
  it('стардиз не видит увольнение и деньги', () => {
    expect(canSeeAuditEntry(stardiz, { action: 'dismissal_updated', targetType: 'user', targetId: 101 }, [])).toBe(false);
    expect(canSeeAuditEntry(stardiz, raise(101), [])).toBe(false);
  });
  it('обычные события не режутся', () => {
    expect(canSeeAuditEntry(lead, { action: 'grading_date_set', targetType: 'user', targetId: 101 }, compIds)).toBe(true);
  });
});

describe('auditVisibilityWhere', () => {
  it('админу — без условий', () => {
    expect(auditVisibilityWhere(admin, [])).toEqual({});
  });
  it('лиду — деньги только по разрешённым людям, увольнение не режется', () => {
    expect(auditVisibilityWhere(lead, compIds)).toEqual({
      AND: [
        {
          OR: [
            {
              NOT: [
                { action: { startsWith: 'planned_raise_' } },
                { action: { startsWith: 'bonus_' } },
              ],
            },
            { targetType: 'user', targetId: { in: [100] } },
          ],
        },
      ],
    });
  });
  it('не-админу и не-лиду — ещё и без увольнений', () => {
    const where = auditVisibilityWhere(stardiz, []) as { AND: unknown[] };
    expect(where.AND).toContainEqual({ action: { not: 'dismissal_updated' } });
  });
});
