export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions, isUsingDevAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getDashboardForRole } from '@/lib/session';
import SignInForm from './SignInForm';

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
    <main className="min-h-screen flex items-center justify-center px-4 py-12 bg-canvas">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/grades-logo.png"
            alt="Ида Грейдс"
            width={180}
            height={25}
            className="mx-auto mb-3"
          />
          <p className="text-sm text-stone">Войди с рабочей почтой и паролем</p>
        </div>
        <SignInForm
          isDev={isUsingDevAuth}
          devUsers={devUsers}
          callbackUrl={searchParams.callbackUrl}
        />
      </div>
    </main>
  );
}
