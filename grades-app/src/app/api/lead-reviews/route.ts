export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { parseLeadReviewCsv } from '@/lib/parseLeadReviewCsv';
import { SURVEY_VERSION } from '@/lib/leadSurvey';

const createSchema = z.object({
  targetUserId: z.number().int().positive(),
  period: z.string().min(1).max(120),
  rawCsv: z.string().min(1).max(2_000_000),
});

/**
 * POST /api/lead-reviews — создаёт новую 360-оценку лида/стардиза.
 * Только admin. Лид-оценок дизайнеру создавать нельзя.
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me || me.role !== 'admin' || !me.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { targetUserId, period, rawCsv } = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) {
    return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
  }
  if (target.role !== 'lead' && target.role !== 'stardiz') {
    return NextResponse.json(
      {
        error: '360-оценка доступна только для роли «Лид» или «Стардиз». Для дизайнеров — обычная форма оценки.',
      },
      { status: 400 },
    );
  }

  const result = parseLeadReviewCsv(rawCsv);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, missingColumns: result.missingColumns ?? [] },
      { status: 400 },
    );
  }

  const review = await prisma.leadReview.create({
    data: {
      targetUserId,
      period: period.trim(),
      surveyVersion: SURVEY_VERSION,
      responseCount: result.responseCount,
      rawCsv,
      aggregates: result.aggregates as unknown as Prisma.InputJsonValue,
      createdById: me.id,
    },
    select: { id: true },
  });

  return NextResponse.json({
    id: review.id,
    warnings: result.warnings,
  });
}
