/**
 * NextAuth конфигурация.
 *
 * Два режима:
 *   1) PROD — provider 'password': email + bcrypt-hash в БД. Админ задаёт
 *      пароли вручную (см. /admin/users → «Сбросить пароль»).
 *   2) DEV  — provider 'dev': без пароля, выбор пользователя из списка.
 *      Используется только для локальной разработки. Включается через AUTH_MODE=dev.
 */

import type { NextAuthOptions, Session } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getToken, type JWT } from 'next-auth/jwt';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { writeAudit } from './audit';
import {
  isRefreshDue,
  resolveSessionRefresh,
  sessionUserIds,
  type SessionUserRow,
} from './sessionFreshness';
import type { BuildCode, GradeCode, UserRole } from './types';

const authMode = process.env.AUTH_MODE || 'password';
const isDevAuth = authMode === 'dev';

const providers = [];

if (isDevAuth) {
  // DEV — без пароля, для локальной разработки.
  providers.push(
    CredentialsProvider({
      id: 'dev',
      name: 'Dev login',
      credentials: {
        email: { label: 'Email', type: 'email' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
          include: { build: true },
        });
        if (!user || !user.active) return null;
        return userToAuthPayload(user);
      },
    }),
  );
}

// Имперсонация: админ входит «под» любым активным пользователем
// (кнопка «Войти как» в карточке 360). Не-админу разрешён единственный
// переход — обратно в свой аккаунт (по impersonatorId из текущего JWT).
// Каждый вход логируется в аудит.
providers.push(
  CredentialsProvider({
    id: 'impersonate',
    name: 'Impersonate',
    credentials: {
      targetUserId: { label: 'User ID', type: 'text' },
    },
    async authorize(credentials) {
      const targetId = parseInt(credentials?.targetUserId ?? '', 10);
      if (isNaN(targetId)) return null;

      // Текущий JWT — из cookies запроса (authorize выполняется в
      // request-scope апп-роутера, next/headers доступен).
      let token = null;
      try {
        const store = cookies();
        const cookieMap: Record<string, string> = {};
        for (const c of store.getAll()) cookieMap[c.name] = c.value;
        token = await getToken({
          req: { cookies: cookieMap, headers: {} } as never,
        });
      } catch {
        return null;
      }
      if (!token?.numericId || token.invalid) return null;

      const returningToSelf =
        typeof token.impersonatorId === 'number' &&
        token.impersonatorId === targetId;
      if (!returningToSelf) {
        // Роль в cookie может отставать от БД (сессия живёт 8 часов, а
        // getToken читает cookie как есть) — админство проверяем по БД.
        const actor = await prisma.user.findUnique({
          where: { id: token.numericId },
          select: { role: true, active: true },
        });
        if (!actor?.active || actor.role !== 'admin') return null;
      }

      const target = await prisma.user.findUnique({
        where: { id: targetId },
        include: { build: true },
      });
      if (!target || !target.active) return null;

      // Кто «настоящий» админ в новой сессии: при возврате в себя — никто,
      // при входе под другим — исходный админ (или уже сохранённый).
      const impersonatorId = returningToSelf
        ? null
        : target.id === token.numericId
          ? null
          : ((token.impersonatorId as number | null) ?? token.numericId);

      await writeAudit({
        actorId: token.numericId as number,
        action: returningToSelf ? 'impersonation_ended' : 'impersonation_started',
        targetType: 'user',
        targetId: target.id,
      });

      return { ...userToAuthPayload(target), impersonatorId };
    },
  }),
);

// Password-провайдер активен всегда (даже в dev — на случай если админ хочет
// проверить email+password на локалке).
providers.push(
  CredentialsProvider({
    id: 'password',
    name: 'Email и пароль',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Пароль', type: 'password' },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;
      const user = await prisma.user.findUnique({
        where: { email: credentials.email.toLowerCase().trim() },
        include: { build: true },
      });
      if (!user || !user.active || !user.passwordHash) return null;
      const ok = await bcrypt.compare(credentials.password, user.passwordHash);
      if (!ok) return null;
      return userToAuthPayload(user);
    },
  }),
);

function userToAuthPayload(user: {
  id: number;
  email: string;
  fullName: string;
  role: string;
  buildId: number | null;
  build: { code: string } | null;
  leadId: number | null;
  gradeFloor: string | null;
  department: string | null;
}) {
  return {
    id: String(user.id),
    numericId: user.id,
    email: user.email,
    name: user.fullName,
    role: user.role as UserRole,
    buildId: user.buildId,
    buildCode: (user.build?.code as BuildCode) ?? null,
    leadId: user.leadId,
    gradeFloor: (user.gradeFloor as GradeCode) ?? null,
    department: user.department,
  };
}

// ── Свежесть сессии ──────────────────────────────────────────────────────
//
// Роль, активность и имя перечитываем из БД не реже раза в 5 минут (правила —
// lib/sessionFreshness). Метка времени лежит в токене, но в серверных
// компонентах и роутах getServerSession cookie не перезаписывает — токен
// там каждый раз прежний. Поэтому держим ещё кеш процесса на те же 5 минут:
// иначе каждый рендер ходил бы в БД.

const sessionUserCache = new Map<number, { row: SessionUserRow | null; at: number }>();

/** Строки для проверки сессии; null — БД не ответила, решать не берёмся. */
async function loadSessionUsers(ids: number[], now: number): Promise<SessionUserRow[] | null> {
  const stale = ids.filter((id) => {
    const cached = sessionUserCache.get(id);
    return !cached || isRefreshDue(cached.at, now);
  });
  if (stale.length > 0) {
    try {
      const rows = await prisma.user.findMany({
        where: { id: { in: stale } },
        select: { id: true, role: true, active: true, fullName: true },
      });
      for (const id of stale) {
        sessionUserCache.set(id, { row: rows.find((r) => r.id === id) ?? null, at: now });
      }
    } catch (err) {
      console.error('[auth] session refresh failed:', err);
      return null;
    }
  }
  return ids
    .map((id) => sessionUserCache.get(id)?.row)
    .filter((r): r is SessionUserRow => !!r);
}

/**
 * Сбросить кеш сессии человека — после смены роли, деактивации или
 * удаления. Подействует на ближайшей проверке токена: у токена, проверенного
 * меньше 5 минут назад, она наступит, когда выйдет его метка.
 */
export function forgetSessionUser(id: number): void {
  sessionUserCache.delete(id);
}

export const authOptions: NextAuthOptions = {
  providers,
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 8, // 8 часов
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.numericId = (user as any).numericId;
        token.role = (user as any).role;
        token.buildId = (user as any).buildId;
        token.buildCode = (user as any).buildCode;
        token.leadId = (user as any).leadId;
        token.gradeFloor = (user as any).gradeFloor;
        token.department = (user as any).department;
        // Имперсонация: обычный вход всегда сбрасывает метку
        token.impersonatorId = (user as any).impersonatorId ?? null;
        // Данные только что из БД (authorize) — перечитывать пока не нужно.
        token.refreshedAt = Date.now();
        delete token.invalid;
        return token;
      }

      if (token.invalid || !token.numericId) return token;
      const now = Date.now();
      if (!isRefreshDue(token.refreshedAt, now)) return token;

      const rows = await loadSessionUsers(sessionUserIds(token), now);
      if (!rows) return token;
      const fresh = resolveSessionRefresh(token, rows);
      if (!fresh.ok) {
        // Удалён, деактивирован или вошедший «под» ним больше не админ —
        // сессия мертва. Личность из токена убираем целиком, чтобы её не
        // подхватил никто, кто читает cookie напрямую (getToken).
        return { invalid: true } as unknown as JWT;
      }
      token.role = fresh.role as UserRole;
      token.name = fresh.fullName;
      token.refreshedAt = now;
      return token;
    },

    async session({ session, token }) {
      // Мёртвая сессия — пустой ответ: getServerSession вернёт null, клиент
      // увидит «не вошёл».
      if (token.invalid || !token.numericId) return {} as Session;
      session.user.id = token.numericId;
      // Имя — из токена: его освежает jwt-колбэк, а session.user.name
      // NextAuth собирает из исходного cookie.
      session.user.name = token.name ?? session.user.name;
      session.user.role = token.role;
      session.user.buildId = token.buildId;
      session.user.buildCode = token.buildCode;
      session.user.leadId = token.leadId;
      session.user.gradeFloor = token.gradeFloor;
      session.user.department = token.department;
      session.user.impersonatorId = token.impersonatorId ?? null;
      return session;
    },
  },
};

export const isUsingDevAuth = isDevAuth;
