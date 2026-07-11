export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions, isUsingDevAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getDashboardForRole } from '@/lib/session';
import SignInForm from './SignInForm';
import BrandLogo from '@/components/BrandLogo';
import TitleAurora from '@/components/TitleAurora';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string };
}) {
  // Если уже залогинены — сразу на dashboard
  const session = await getServerSession(authOptions);
  if (session?.user?.role) {
    redirect(searchParams.callbackUrl || getDashboardForRole(session.user.role));
  }

  // В dev-режиме показываем список пользователей из БД для быстрого логина
  let devUsers: Array<{ email: string; fullName: string; role: string; buildName: string | null }> = [];
  if (isUsingDevAuth) {
    const users = await prisma.user.findMany({
      where: { active: true },
      include: { build: true },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    });
    devUsers = users.map((u) => ({
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      buildName: u.build?.name ?? null,
    }));
  }

  return (
    // Экран входа: аврора за логотипом (как за заголовками разделов),
    // живой BrandLogo, форма-карточка по центру.
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[400px] title-halo">
        <TitleAurora />
        <div className="mb-10 flex flex-col items-center text-center animate-fade-up">
          <BrandLogo className="w-[216px] h-[30px]" />
          <p className="text-sm text-stone mt-5">Войди с рабочей почтой и паролем</p>
        </div>
        <div className="animate-fade-up" style={{ animationDelay: '80ms' }}>
          <SignInForm
            isDev={isUsingDevAuth}
            devUsers={devUsers}
            callbackUrl={searchParams.callbackUrl}
          />
        </div>
      </div>
    </main>
  );
}
