/**
 * Серверные хелперы для работы с текущей сессией.
 *
 * Используются в layout-ах и server actions/route handlers.
 */

import { cache } from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from './auth';
import type { UserRole } from './types';

/**
 * React.cache() дедуплицирует вызов в рамках одного render-tree:
 * layout → requireRole → getCurrentUser → getServerSession (один вызов)
 * + page → getCurrentUser (использует тот же кеш)
 * — JWT декодируется один раз, а не два.
 */
export const getCurrentUser = cache(async () => {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
});

/**
 * Гарантирует, что пользователь авторизован. Иначе → редирект на signin.
 * Используется в защищённых layout-ах.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user || !user.id) {
    redirect('/auth/signin');
  }
  return user;
}

/**
 * Гарантирует, что пользователь имеет одну из перечисленных ролей.
 * Иначе → редирект на свой dashboard или /auth/error.
 */
export async function requireRole(allowed: UserRole | UserRole[]) {
  const user = await requireUser();
  const roles = Array.isArray(allowed) ? allowed : [allowed];
  if (!roles.includes(user.role)) {
    redirect(getDashboardForRole(user.role));
  }
  return user;
}

export function getDashboardForRole(role: UserRole | undefined): string {
  switch (role) {
    case 'admin':
      return '/admin/users';
    case 'lead':
      return '/admin/users';
    case 'stardiz':
      return '/admin/users';
    case 'designer':
      return '/designer';
    default:
      return '/auth/error?error=AccessDenied';
  }
}
