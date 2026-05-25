export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

const PostSchema = z.object({
  /** Если задан — используем этот пароль. Иначе сгенерируем сами. */
  password: z.string().min(8).max(128).optional(),
});

const ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // без 0/O/1/I/l

function generatePassword(length = 12): string {
  let out = '';
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) {
    out += ALPHABET[arr[i] % ALPHABET.length];
  }
  return out;
}

/**
 * POST /api/users/[id]/password
 *
 * Кто может выдавать пароли:
 *   - admin    — любому пользователю
 *   - lead     — только дизайнеру, которого он ведёт (target.leadId === me.id)
 *   - stardiz  — только дизайнеру, у которого он стардиз (target.stardizId === me.id),
 *                либо если он формальный лид (target.leadId === me.id)
 *
 * Лиды и стардизы НЕ могут выдавать пароли другим лидам/стардизам/админам —
 * только своим подопечным-дизайнерам. Иначе это эскалация привилегий.
 *
 * Body: { password? }. Если password не передан — генерим случайный.
 * Ответ: { password } — открытый текст показываем один раз, чтобы выдающий
 * скопировал и переслал владельцу.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = parseInt(params.id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      leadId: true,
      stardizId: true,
    },
  });
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isAdmin = me.role === 'admin';
  // Лид/стардиз могут только своим подопечным-дизайнерам. Это закрывает
  // лазейку «лид выдаёт пароль другому лиду и заходит под ним».
  const isManaging =
    (me.role === 'lead' || me.role === 'stardiz') &&
    user.role === 'designer' &&
    (user.leadId === me.id || user.stardizId === me.id);

  if (!isAdmin && !isManaging) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const password = parsed.data.password ?? generatePassword(12);
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  return NextResponse.json({ ok: true, password });
}
