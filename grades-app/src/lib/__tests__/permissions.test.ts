import { describe, it, expect } from 'vitest';
import {
  canChangeLead,
  canDeactivateUser,
  canEditOwnProfile,
  canEditUser,
  canImpersonateUser,
  canInviteSelfAssessment,
  canIssuePassword,
  canSwitchToUser,
  canViewUserDetails,
} from '../permissions';

const admin = { id: 1, role: 'admin' };
const lead = { id: 10, role: 'lead' };
const otherLead = { id: 11, role: 'lead' };
const stardiz = { id: 20, role: 'stardiz' };
const designer = { id: 30, role: 'designer' };

const myDesigner = { id: 100, role: 'designer', leadId: 10 };
const myStardiz = { id: 101, role: 'stardiz', leadId: 10 };
const foreignDesigner = { id: 102, role: 'designer', leadId: 11 };
const noLeadDesigner = { id: 103, role: 'designer', leadId: null };
// Лид может оказаться «лидом» другого лида или админа — править их нельзя.
const leadUnderLead = { id: 104, role: 'lead', leadId: 10 };
const adminUnderLead = { id: 105, role: 'admin', leadId: 10 };

describe('canEditUser', () => {
  it('админ — любого', () => {
    expect(canEditUser(admin, foreignDesigner)).toBe(true);
    expect(canEditUser(admin, leadUnderLead)).toBe(true);
  });
  it('лид — своих дизайнеров и стардизов', () => {
    expect(canEditUser(lead, myDesigner)).toBe(true);
    expect(canEditUser(lead, myStardiz)).toBe(true);
  });
  it('лид — не чужих и не «ничьих»', () => {
    expect(canEditUser(lead, foreignDesigner)).toBe(false);
    expect(canEditUser(lead, noLeadDesigner)).toBe(false);
  });
  it('лид — не лидов и не админов, даже если указан их лидом', () => {
    expect(canEditUser(lead, leadUnderLead)).toBe(false);
    expect(canEditUser(lead, adminUnderLead)).toBe(false);
  });
  it('стардиз, дизайнер и без сессии — нет', () => {
    expect(canEditUser(stardiz, { id: 106, role: 'designer', leadId: 20 })).toBe(false);
    expect(canEditUser(designer, myDesigner)).toBe(false);
    expect(canEditUser(null, myDesigner)).toBe(false);
  });
});

describe('canChangeLead', () => {
  it('админ — любому и на что угодно, включая «без лида»', () => {
    expect(canChangeLead(admin, foreignDesigner, 10)).toBe(true);
    expect(canChangeLead(admin, foreignDesigner, null)).toBe(true);
  });
  it('лид передаёт своего человека другому лиду', () => {
    expect(canChangeLead(lead, myDesigner, 11)).toBe(true);
    expect(canChangeLead(lead, myStardiz, 11)).toBe(true);
  });
  it('лид не снимает лида и не «передаёт» себе', () => {
    expect(canChangeLead(lead, myDesigner, null)).toBe(false);
    expect(canChangeLead(lead, myDesigner, 10)).toBe(false);
  });
  it('лид не перекладывает чужих — ни себе, ни третьему', () => {
    expect(canChangeLead(lead, foreignDesigner, 10)).toBe(false);
    expect(canChangeLead(lead, foreignDesigner, 12)).toBe(false);
    expect(canChangeLead(lead, noLeadDesigner, 10)).toBe(false);
  });
  it('стардиз, дизайнер и без сессии — нет', () => {
    expect(canChangeLead(stardiz, myDesigner, 11)).toBe(false);
    expect(canChangeLead(designer, myDesigner, 11)).toBe(false);
    expect(canChangeLead(null, myDesigner, 11)).toBe(false);
  });
});

describe('canDeactivateUser', () => {
  it('админ — любого, кроме себя', () => {
    expect(canDeactivateUser(admin, foreignDesigner)).toBe(true);
    expect(canDeactivateUser(admin, leadUnderLead)).toBe(true);
    expect(canDeactivateUser(admin, { id: 1, role: 'admin', leadId: null })).toBe(false);
  });
  it('лид — только своих дизайнеров и стардизов', () => {
    expect(canDeactivateUser(lead, myDesigner)).toBe(true);
    expect(canDeactivateUser(lead, myStardiz)).toBe(true);
    expect(canDeactivateUser(lead, foreignDesigner)).toBe(false);
    expect(canDeactivateUser(otherLead, myDesigner)).toBe(false);
  });
  it('лид — не лидов и не админов', () => {
    expect(canDeactivateUser(lead, leadUnderLead)).toBe(false);
    expect(canDeactivateUser(lead, adminUnderLead)).toBe(false);
  });
  it('стардиз, дизайнер и без сессии — нет', () => {
    expect(canDeactivateUser(stardiz, myDesigner)).toBe(false);
    expect(canDeactivateUser(designer, myDesigner)).toBe(false);
    expect(canDeactivateUser(null, myDesigner)).toBe(false);
  });
});

describe('canViewUserDetails', () => {
  const target = { id: 100, leadId: 10, stardizId: 20 };
  it('сам, админ, лид и стардиз человека', () => {
    expect(canViewUserDetails({ id: 100, role: 'designer' }, target)).toBe(true);
    expect(canViewUserDetails(admin, target)).toBe(true);
    expect(canViewUserDetails(lead, target)).toBe(true);
    expect(canViewUserDetails(stardiz, target)).toBe(true);
  });
  it('чужой лид, чужой стардиз, другой дизайнер — нет', () => {
    expect(canViewUserDetails(otherLead, target)).toBe(false);
    expect(canViewUserDetails({ id: 21, role: 'stardiz' }, target)).toBe(false);
    expect(canViewUserDetails(designer, target)).toBe(false);
  });
  it('без сессии — нет', () => {
    expect(canViewUserDetails(null, target)).toBe(false);
  });
});

describe('canEditOwnProfile', () => {
  it('лид и админ — свою карточку', () => {
    expect(canEditOwnProfile(lead, { id: 10 })).toBe(true);
    expect(canEditOwnProfile(admin, { id: 1 })).toBe(true);
  });
  it('лиду свою карточку canEditUser не открывает — поэтому и нужен этот хелпер', () => {
    expect(canEditUser(lead, { id: 10, role: 'lead', leadId: null })).toBe(false);
  });
  it('чужую — нет', () => {
    expect(canEditOwnProfile(lead, { id: 11 })).toBe(false);
    expect(canEditOwnProfile(lead, myDesigner)).toBe(false);
  });
  it('стардиз и дизайнер модалку «Изменить» не открывают — нет', () => {
    expect(canEditOwnProfile(stardiz, { id: 20 })).toBe(false);
    expect(canEditOwnProfile(designer, { id: 30 })).toBe(false);
  });
  it('без сессии — нет', () => {
    expect(canEditOwnProfile(null, { id: 10 })).toBe(false);
  });
});

// Цель для пароля и приглашения: лид — 10, стардиз — 20
const person = (
  role: string,
  leadId: number | null,
  stardizId: number | null = null,
  id = 500,
) => ({
  id,
  role,
  leadId,
  stardizId,
});

describe('canIssuePassword — как POST /api/users/[id]/password', () => {
  it('админ — дизайнерам, стардизам, лидам и себе', () => {
    expect(canIssuePassword(admin, person('designer', 11))).toBe(true);
    expect(canIssuePassword(admin, person('stardiz', 11))).toBe(true);
    expect(canIssuePassword(admin, person('lead', null))).toBe(true);
    expect(canIssuePassword(admin, person('admin', null, null, admin.id))).toBe(true);
  });
  it('админ — не другому админу: пароль админа меняет только он сам', () => {
    expect(canIssuePassword(admin, person('admin', null, null, 2))).toBe(false);
    expect(canIssuePassword({ id: 2, role: 'admin' }, person('admin', null, null, admin.id))).toBe(false);
  });
  it('лид — своим дизайнерам и стардизам (он лид или стардиз)', () => {
    expect(canIssuePassword(lead, person('designer', 10))).toBe(true);
    expect(canIssuePassword(lead, person('stardiz', 10))).toBe(true);
    expect(canIssuePassword(lead, person('designer', 11, 10))).toBe(true);
  });
  it('лид — не чужим и не лидам/админам, даже если указан их лидом', () => {
    expect(canIssuePassword(lead, person('designer', 11))).toBe(false);
    expect(canIssuePassword(lead, person('designer', null))).toBe(false);
    expect(canIssuePassword(lead, person('lead', 10))).toBe(false);
    expect(canIssuePassword(lead, person('admin', 10))).toBe(false);
  });
  it('стардиз — только своим дизайнерам', () => {
    expect(canIssuePassword(stardiz, person('designer', 10, 20))).toBe(true);
    expect(canIssuePassword(stardiz, person('designer', 20))).toBe(true);
    expect(canIssuePassword(stardiz, person('stardiz', 10, 20))).toBe(false);
    expect(canIssuePassword(stardiz, person('designer', 10, 21))).toBe(false);
  });
  it('дизайнер и без сессии — нет', () => {
    expect(canIssuePassword(designer, person('designer', 30, 30))).toBe(false);
    expect(canIssuePassword(null, person('designer', 10))).toBe(false);
  });
});

describe('canImpersonateUser — «Войти как» и провайдер impersonate', () => {
  const target = (role: string, id = 500, active = true) => ({ id, role, active });
  it('админ — под активным дизайнером, стардизом и лидом', () => {
    expect(canImpersonateUser(admin, target('designer'))).toBe(true);
    expect(canImpersonateUser(admin, target('stardiz'))).toBe(true);
    expect(canImpersonateUser(admin, target('lead'))).toBe(true);
  });
  it('под другим админом — нельзя никому, в обе стороны', () => {
    expect(canImpersonateUser(admin, target('admin', 2))).toBe(false);
    expect(canImpersonateUser({ id: 2, role: 'admin' }, target('admin', admin.id))).toBe(false);
  });
  it('не под собой и не под неактивным', () => {
    expect(canImpersonateUser(admin, target('admin', admin.id))).toBe(false);
    expect(canImpersonateUser(admin, target('designer', 500, false))).toBe(false);
  });
  it('не админ — ни под кем: из-под дизайнера или лида дальше не войти', () => {
    for (const me of [lead, stardiz, designer, null]) {
      expect(canImpersonateUser(me, target('designer'))).toBe(false);
      expect(canImpersonateUser(me, target('admin', admin.id))).toBe(false);
    }
  });
});

describe('canSwitchToUser — цепочки «Войти как» (провайдер impersonate)', () => {
  const row = (id: number, role: string, active = true) => ({ id, role, active });
  const adminA = row(1, 'admin');
  const adminB = row(2, 'admin');
  const designerD = row(30, 'designer');
  const leadL = row(10, 'lead');
  const own = { impersonatorId: null };
  const asA = { impersonatorId: 1 };

  it('админ в своей сессии: к дизайнеру и лиду — да, к другому админу — нет', () => {
    expect(canSwitchToUser(own, adminA, designerD)).toBe(true);
    expect(canSwitchToUser(own, adminA, leadL)).toBe(true);
    expect(canSwitchToUser(own, adminA, adminB)).toBe(false);
  });
  it('из-под дизайнера или лида — не к админу и не к другим', () => {
    for (const actor of [designerD, leadL]) {
      expect(canSwitchToUser(asA, actor, adminB)).toBe(false);
      expect(canSwitchToUser(asA, actor, row(31, 'designer'))).toBe(false);
    }
  });
  it('возврат к исходному админу работает, к неактивному — нет', () => {
    expect(canSwitchToUser(asA, null, adminA)).toBe(true);
    expect(canSwitchToUser(asA, designerD, adminA)).toBe(true);
    expect(canSwitchToUser(asA, null, row(1, 'admin', false))).toBe(false);
  });
  it('админа разжаловали или деактивировали — войти не может', () => {
    expect(canSwitchToUser(own, row(1, 'lead'), designerD)).toBe(false);
    expect(canSwitchToUser(own, row(1, 'admin', false), designerD)).toBe(false);
    expect(canSwitchToUser(own, null, designerD)).toBe(false);
  });
});

describe('canInviteSelfAssessment', () => {
  const invitee = (over: Record<string, unknown> = {}) => ({
    ...person('designer', 10, 20),
    active: true,
    employmentType: 'staff',
    build: { code: 'visioner' },
    ...over,
  });
  it('те же, кто выдаёт пароль: админ, лид и стардиз дизайнера', () => {
    expect(canInviteSelfAssessment(admin, invitee())).toBe(true);
    expect(canInviteSelfAssessment(lead, invitee())).toBe(true);
    expect(canInviteSelfAssessment(stardiz, invitee())).toBe(true);
  });
  it('чужие и без сессии — нет', () => {
    expect(canInviteSelfAssessment(otherLead, invitee())).toBe(false);
    expect(canInviteSelfAssessment({ id: 21, role: 'stardiz' }, invitee())).toBe(false);
    expect(canInviteSelfAssessment(null, invitee())).toBe(false);
  });
  it('самооценка только у дизайнера: стардиза и лида не зовём', () => {
    expect(canInviteSelfAssessment(admin, invitee({ role: 'stardiz' }))).toBe(false);
    expect(canInviteSelfAssessment(lead, invitee({ role: 'stardiz' }))).toBe(false);
    expect(canInviteSelfAssessment(admin, invitee({ role: 'lead' }))).toBe(false);
  });
  it('неактивного, почасовщика и билд без грейдов — нет', () => {
    expect(canInviteSelfAssessment(admin, invitee({ active: false }))).toBe(false);
    expect(canInviteSelfAssessment(lead, invitee({ employmentType: 'hourly' }))).toBe(false);
    expect(canInviteSelfAssessment(lead, invitee({ build: { code: 'communications' } }))).toBe(false);
  });
});
