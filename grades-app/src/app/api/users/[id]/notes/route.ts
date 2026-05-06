export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { z } from 'zod';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me || (me.role !== 'admin' && me.role !== 'lead')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const designerId = parseInt(params.id, 10);

  const notes = await prisma.designerNote.findMany({
    where: { designerId },
    include: { author: { select: { fullName: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(notes);
}

const noteSchema = z.object({
  text: z.string().min(1).max(5000),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me || (me.role !== 'admin' && me.role !== 'lead')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const designerId = parseInt(params.id, 10);
  const body = await req.json();
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const note = await prisma.designerNote.create({
    data: {
      designerId,
      authorId: me.id!,
      text: parsed.data.text,
    },
    include: { author: { select: { fullName: true } } },
  });

  return NextResponse.json(note, { status: 201 });
}
