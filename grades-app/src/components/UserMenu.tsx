'use client';

import { signOut } from 'next-auth/react';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  lead: 'Lead',
  designer: 'Designer',
};

export default function UserMenu({
  fullName,
  role,
  initials,
}: {
  fullName: string;
  role: string;
  initials: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <div className="text-sm font-medium">{fullName}</div>
        <div className="text-xs text-stone">{ROLE_LABEL[role] ?? role}</div>
      </div>
      <div className="w-9 h-9 rounded-pill bg-cloud flex items-center justify-center text-xs font-medium">
        {initials}
      </div>
      <button
        onClick={() => signOut({ callbackUrl: '/auth/signin' })}
        className="text-xs text-stone hover:text-ink underline-offset-2 hover:underline transition"
        title="Выйти"
      >
        Выйти
      </button>
    </div>
  );
}
