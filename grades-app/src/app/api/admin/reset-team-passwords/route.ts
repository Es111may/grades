export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { canAssignAdminRole } from '@/lib/permissions';

// Без визуально похожих символов (0/O, l/1/I и т.д.).
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePassword(len = 10): string {
  let pw = '';
  for (let i = 0; i < len; i++) {
    pw += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return pw;
}

/**
 * POST /api/admin/reset-team-passwords
 *
 * Только admin. Генерирует новые пароли для всех active-пользователей
 * с role !== 'admin', сохраняет bcrypt-хеши, возвращает список:
 *   { id, fullName, email, role, department, password }[]
 *
 * Пароли в ответе — единственное место, где они видны открытым текстом.
 * Передавай дальше по защищённому каналу.
 */
export async function POST() {
  const me = await getCurrentUser();
  if (!me || !canAssignAdminRole(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const targets = await prisma.user.findMany({
    where: { active: true, role: { not: 'admin' } },
    select: { id: true, fullName: true, email: true, role: true, department: true },
    orderBy: [{ department: 'asc' }, { fullName: 'asc' }],
  });

  const result: Array<{
    id: number;
    fullName: string;
    email: string;
    role: string;
    department: string | null;
    password: string;
  }> = [];

  for (const u of targets) {
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: u.id },
      data: { passwordHash },
    });
    result.push({ ...u, password });
  }

  return NextResponse.json({ users: result });
}
