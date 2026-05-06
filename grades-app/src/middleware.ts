/**
 * Edge middleware: гейт-проверка доступа к защищённым маршрутам.
 *
 * Проверяет JWT-токен NextAuth (без обращения к БД, чтобы не утяжелять edge).
 * Тонкая роль-проверка делается дополнительно в layout-ах через requireRole().
 */

import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/auth/signin',
  },
});

export const config = {
  // Защищаем все ролевые маршруты. Все остальное (auth, api/auth, _next/static и т.п.) пропускаем.
  matcher: ['/admin/:path*', '/lead/:path*', '/designer/:path*'],
};
