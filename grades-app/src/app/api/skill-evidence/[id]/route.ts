/**
 * DELETE /api/skill-evidence/[id] — удалить свою ссылку-подтверждение
 * (Phase 14). Права: только владелец (designer, активный).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { canEditSelfAssessment } from '@/lib/selfAssessmentPermissions';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getCurrentUser();
  if (!me?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const evidenceId = parseInt(params.id, 10);
  if (isNaN(evidenceId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const evidence = await prisma.skillEvidence.findUnique({
    where: { id: evidenceId },
    select: {
      id: true,
      designer: {
        select: { id: true, role: true, active: true, leadId: true, stardizId: true },
      },
    },
  });
  if (!evidence) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!canEditSelfAssessment({ id: me.id, role: me.role ?? '' }, evidence.designer)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.skillEvidence.delete({ where: { id: evidenceId } });
  return NextResponse.json({ ok: true });
}
