'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import Avatar from './Avatar';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Админ',
  lead: 'Лид',
  stardiz: 'Стардиз',
  designer: 'Дизайнер',
};

export default function UserMenu({
  fullName,
  role,
  avatarUrl,
}: {
  fullName: string;
  role: string;
  avatarUrl?: string | null;
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
    // В Dynamic Island-хедере — только аватарка; меню раскрывается по
    // ховеру (и по клику — для тача/клавиатуры).
    <div
      className="relative"
      ref={wrapRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="block p-1 rounded-pill hover:bg-cloud/50 transition-colors"
        aria-label={`${fullName} — меню`}
        aria-expanded={open}
      >
        <Avatar name={fullName} avatarUrl={avatarUrl} size={36} />
      </button>

      {open && (
        // pt-2 — «мостик»: зазор между аватаркой и меню входит в hover-зону,
        // курсор не роняет меню по пути к нему.
        <div className="absolute right-0 top-full pt-2 w-56">
          <div className="rounded-card bg-snow border border-cloud shadow-soft-lg overflow-hidden">
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
        </div>
      )}
    </div>
  );
}
