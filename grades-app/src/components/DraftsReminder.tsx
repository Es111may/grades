/**
 * Серверный server-component: тянет «зависшие» черновики оценок и
 * рендерит плашку-ремайндер по образу `AssessmentReminder`.
 *
 * Видимость:
 *   - admin    — все черновики (для общего обзора)
 *   - lead     — свои (где leadId === me.id) + черновики его подопечных
 *   - stardiz  — черновики его подопечных дизайнеров
 *   - designer — null (роль не видит ремайндер о чужих оценках)
 *
 * Сценарии:
 *   - есть хотя бы один draft старше STALE_DAYS → красная плашка «N зависших»
 *   - есть свежие draft'ы (<STALE_DAYS) → нейтральная серая «N в работе»
 *   - нет ни одного → null (не рендерим)
 *
 * Клик по плашке ведёт на `/lead/assessments` — там есть блок «Черновики»
 * с кнопкой «Продолжить» по каждому.
 */

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import DraftsReminderBanner from './DraftsReminderBanner';

/** Сколько дней без движения → черновик считается «зависшим». */
const STALE_DAYS = 7;

export default async function DraftsReminder() {
  const me = await getCurrentUser();
  if (!me?.id) return null;
  if (me.role !== 'admin' && me.role !== 'lead' && me.role !== 'stardiz') {
    return null;
  }

  // Scope — синхронизирован со списком в /lead/assessments.
  let where: Record<string, unknown> = { status: 'draft' };
  if (me.role === 'lead') {
    where = {
      status: 'draft',
      OR: [
        { leadId: me.id },
        { designer: { OR: [{ leadId: me.id }, { stardizId: me.id }] } },
      ],
    };
  } else if (me.role === 'stardiz') {
    where = {
      status: 'draft',
      designer: { OR: [{ stardizId: me.id }, { leadId: me.id }] },
    };
  }

  const drafts = await prisma.assessment.findMany({
    where,
    orderBy: { updatedAt: 'asc' }, // самый старый — первым
    select: {
      id: true,
      updatedAt: true,
      designer: { select: { fullName: true } },
    },
  });

  if (drafts.length === 0) return null;

  const now = Date.now();
  const staleThresholdMs = STALE_DAYS * 24 * 60 * 60 * 1000;
  const oldest = drafts[0];
  const oldestAgeMs = now - new Date(oldest.updatedAt).getTime();
  const oldestAgeDays = Math.floor(oldestAgeMs / (24 * 60 * 60 * 1000));
  const hasStale = oldestAgeMs >= staleThresholdMs;

  return (
    <DraftsReminderBanner
      total={drafts.length}
      hasStale={hasStale}
      oldestDesignerName={oldest.designer.fullName}
      oldestAgeDays={oldestAgeDays}
    />
  );
}
