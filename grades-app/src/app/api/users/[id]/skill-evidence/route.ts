/**
 * POST /api/users/[id]/skill-evidence — добавить ссылку-подтверждение
 * владения навыком (Phase 14). Body: { skillId, url, title, description? }.
 *
 * Только ссылки (решение Pavel 11.07.2026): http/https, до 20 на пару
 * (дизайнер, навык). Права: только сам владелец.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { canEditSelfAssessment } from '@/lib/selfAssessmentPermissions';

const MAX_PER_SKILL = 20;

const CreateSchema = z.object({
  skillId: z.number().int().positive(),
  url: z
    .string()
    .url()
    .max(1000)
    .refine((u) => u.startsWith('http://') || u.startsWith('https://'), {
      message: 'Only http(s) links',
    }),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getCurrentUser();
  if (!me?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ownerId = parseInt(params.id, 10);
  if (isNaN(ownerId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, role: true, active: true, leadId: true, stardizId: true },
  });
  if (!owner) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!canEditSelfAssessment({ id: me.id, role: me.role ?? '' }, owner)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const skill = await prisma.skill.findUnique({
    where: { id: parsed.data.skillId },
    select: { id: true, active: true },
  });
  if (!skill || !skill.active) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
  }

  const count = await prisma.skillEvidence.count({
    where: { designerId: ownerId, skillId: parsed.data.skillId },
  });
  if (count >= MAX_PER_SKILL) {
    return NextResponse.json(
      { error: `Не больше ${MAX_PER_SKILL} ссылок на навык` },
      { status: 400 },
    );
  }

  const evidence = await prisma.skillEvidence.create({
    data: {
      designerId: ownerId,
      skillId: parsed.data.skillId,
      url: parsed.data.url,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
    },
    select: {
      id: true,
      skillId: true,
      url: true,
      title: true,
      description: true,
      createdAt: true,
    },
  });

  return NextResponse.json(evidence, { status: 201 });
}
