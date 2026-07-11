/**
 * DELETE /api/notes/[id] — удалить заметку по дизайнеру.
 * Права: admin — любую, lead — только свою (авторскую).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getCurrentUser();
  if (!me?.id || (me.role !== 'admin' && me.role !== 'lead')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const noteId = parseInt(params.id, 10);
  if (isNaN(noteId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const note = await prisma.designerNote.findUnique({
    where: { id: noteId },
    select: { id: true, authorId: true },
  });
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (me.role !== 'admin' && note.authorId !== me.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.designerNote.delete({ where: { id: noteId } });
  return NextResponse.json({ ok: true });
}
