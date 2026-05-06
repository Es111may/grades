/**
 * NextAuth конфигурация.
 *
 * Два режима:
 *   1) DEV  — Credentials provider без пароля. Логинимся как любой
 *      пользователь из БД по email. Нужен только для локальной разработки.
 *   2) PROD — Keycloak OIDC. Маппинг пользователя по `ssoId` (Keycloak `sub`).
 *
 * Режим выбирается через AUTH_MODE: 'dev' | 'keycloak'.
 * По умолчанию: 'dev' если NODE_ENV !== 'production', иначе 'keycloak'.
 */

import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import KeycloakProvider from 'next-auth/providers/keycloak';
import { prisma } from './db';
import type { BuildCode, GradeCode, UserRole } from './types';

const authMode = process.env.AUTH_MODE || 'dev';
const isDevAuth = authMode === 'dev';

const providers = [];

if (isDevAuth) {
  // DEV provider — без пароля. Только для localhost.
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
      },
    }),
  );
} else {
  // PROD provider — Keycloak OIDC.
  if (!process.env.KEYCLOAK_ISSUER || !process.env.KEYCLOAK_CLIENT_ID || !process.env.KEYCLOAK_CLIENT_SECRET) {
    throw new Error(
      'KEYCLOAK_ISSUER / KEYCLOAK_CLIENT_ID / KEYCLOAK_CLIENT_SECRET обязательны в проде',
    );
  }
  providers.push(
    KeycloakProvider({
      issuer: process.env.KEYCLOAK_ISSUER,
      clientId: process.env.KEYCLOAK_CLIENT_ID,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
    }),
  );
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
    /**
     * При первом входе или после логина обогащаем токен данными из БД.
     * Для dev-провайдера user уже содержит всё нужное (см. authorize).
     * Для Keycloak — поднимаем User по ssoId (account.providerAccountId).
     */
    async jwt({ token, user, account }) {
      if (user) {
        // Логин через dev — все данные в user
        token.numericId = (user as any).numericId;
        token.role = (user as any).role;
        token.buildId = (user as any).buildId;
        token.buildCode = (user as any).buildCode;
        token.leadId = (user as any).leadId;
        token.gradeFloor = (user as any).gradeFloor;
        token.department = (user as any).department;
        return token;
      }

      // Keycloak login: подтягиваем по ssoId
      if (account?.provider === 'keycloak' && account.providerAccountId) {
        const dbUser = await prisma.user.findUnique({
          where: { ssoId: account.providerAccountId },
          include: { build: true },
        });
        if (!dbUser || !dbUser.active) {
          // Пользователь не заведён в системе. Возвращаем токен без role —
          // middleware/layout-проверки развернут обратно на /auth/signin.
          return token;
        }
        token.numericId = dbUser.id;
        token.role = dbUser.role as UserRole;
        token.buildId = dbUser.buildId;
        token.buildCode = (dbUser.build?.code as BuildCode) ?? null;
        token.leadId = dbUser.leadId;
        token.gradeFloor = (dbUser.gradeFloor as GradeCode) ?? null;
        token.department = dbUser.department;
        token.email = dbUser.email;
        token.name = dbUser.fullName;
      }
      return token;
    },

    async session({ session, token }) {
      if (token.numericId) {
        session.user.id = token.numericId;
        session.user.role = token.role;
        session.user.buildId = token.buildId;
        session.user.buildCode = token.buildCode;
        session.user.leadId = token.leadId;
        session.user.gradeFloor = token.gradeFloor;
        session.user.department = token.department;
      }
      return session;
    },
  },
};

export const isUsingDevAuth = isDevAuth;
