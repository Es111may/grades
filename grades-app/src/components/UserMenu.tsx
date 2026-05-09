'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Админ',
  lead: 'Лид',
  stardiz: 'Стардиз',
  designer: 'Дизайнер',
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
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-pill hover:bg-cloud/50 transition-colors"
      >
        <span className="w-8 h-8 rounded-pill bg-cloud flex items-center justify-center text-[11px] font-semibold tracking-tight">
          {initials}
        </span>
        <span className="text-sm leading-tight text-left">
          <span className="block font-medium text-ink">{fullName}</span>
          <span className="block text-[11px] text-stone">{ROLE_LABEL[role] ?? role}</span>
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          className={`text-stone transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none"
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 rounded-card bg-snow border border-cloud shadow-soft-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-cloud">
            <div className="text-sm font-medium text-ink truncate">{fullName}</div>
            <div className="text-xs text-stone mt-0.5">{ROLE_LABEL[role] ?? role}</div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            className="w-full text-left px-4 py-2.5 text-sm text-ink hover:bg-cloud/50 transition-colors"
          >
            Выйти
          </button>
        </div>
      )}
    </div>
  );
}
