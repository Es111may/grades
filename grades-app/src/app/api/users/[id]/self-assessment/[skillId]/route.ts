/**
 * PUT    /api/users/[id]/self-assessment/[skillId] — поставить/обновить
 *        самооценку уровня по навыку (upsert). Body: { level, comment? }.
 * DELETE /api/users/[id]/self-assessment/[skillId] — снять самооценку.
 *
 * Права: только сам владелец (designer, активный) —
 * см. src/lib/selfAssessmentPermissions.ts. Самооценка НЕ участвует в
 * расчёте XP/грейда — только референс для лида.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { canEditSelfAssessment } from '@/lib/selfAssessmentPermissions';

const PutSchema = z.object({
  level: z.number().int().min(1),
  comment: z.string().max(2000).nullable().optional(),
});

async function resolveAccess(meIdRole: { id: number; role: string }, params: {
  id: string;
  skillId: string;
}) {
  const ownerId = parseInt(params.id, 10);
  const skillId = parseInt(params.skillId, 10);
  if (isNaN(ownerId) || isNaN(skillId)) {
    return { error: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) };
  }
  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, role: true, active: true, leadId: true, stardizId: true },
  });
  if (!owner) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  if (!canEditSelfAssessment(meIdRole, owner)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ownerId, skillId };
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; skillId: string } },
) {
  const me = await getCurrentUser();
  if (!me?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const access = await resolveAccess({ id: me.id, role: me.role ?? '' }, params);
  if ('error' in access) return access.error;
  const { ownerId, skillId } = access;

  const body = await req.json().catch(() => null);
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Уровень не может превышать максимум лестницы навыка
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    select: { id: true, active: true, maxMasteryLevel: true },
  });
  if (!skill || !skill.active) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
  }
  if (parsed.data.level > skill.maxMasteryLevel) {
    return NextResponse.json(
      { error: `Level exceeds max (${skill.maxMasteryLevel})` },
      { status: 400 },
    );
  }

  const sa = await prisma.selfAssessment.upsert({
    where: { designerId_skillId: { designerId: ownerId, skillId } },
    update: { level: parsed.data.level, comment: parsed.data.comment ?? null },
    create: {
      designerId: ownerId,
      skillId,
      level: parsed.data.level,
      comment: parsed.data.comment ?? null,
    },
    select: { skillId: true, level: true, comment: true, updatedAt: true },
  });

  return NextResponse.json(sa);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; skillId: string } },
) {
  const me = await getCurrentUser();
  if (!me?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const access = await resolveAccess({ id: me.id, role: me.role ?? '' }, params);
  if ('error' in access) return access.error;
  const { ownerId, skillId } = access;

  await prisma.selfAssessment.deleteMany({
    where: { designerId: ownerId, skillId },
  });
  return NextResponse.json({ ok: true });
}
