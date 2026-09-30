'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

/**
 * Клиентская сессия нужна только UserMenu — ради impersonatorId (кнопка
 * «Вернуться в свой аккаунт»). По умолчанию NextAuth дёргает
 * /api/auth/session на каждый фокус окна — лишний запрос на каждое
 * переключение вкладки. Сессию берём один раз при загрузке страницы;
 * вход/выход/имперсонация и так перезагружают страницу, а синхронизация
 * между вкладками (storage-событие NextAuth) продолжает работать.
 */
export default function SessionProvider({ children }: { children: ReactNode }) {
  return (
    <NextAuthSessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      {children}
    </NextAuthSessionProvider>
  );
}
