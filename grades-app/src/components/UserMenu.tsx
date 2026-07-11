'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut, signIn, useSession } from 'next-auth/react';
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
  // Имперсонация: если в сессии есть impersonatorId — показываем возврат
  const { data: session } = useSession();
  const impersonatorId = session?.user?.impersonatorId ?? null;
  // Небольшая задержка на закрытие — курсор может на миг «срезать» зазор
  // между аватаркой и меню; без грейс-периода меню мигало бы (Pavel:
  // «ведёшь курсор вниз и меню схлопывается»).
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openNow() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  }
  function closeSoon() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('mousedown', onClick);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  return (
    // В Dynamic Island-хедере — только аватарка; меню раскрывается по
    // ховеру (и по клику — для тача/клавиатуры).
    <div
      className="relative"
      ref={wrapRef}
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
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
        // По центру под аватаркой (left-1/2 -translate-x-1/2). pt-2 —
        // «мостик»: зазор входит в hover-зону, и он ровно под аватаркой,
        // так что движение курсора вниз держит меню открытым.
        <div className="absolute left-1/2 -translate-x-1/2 top-full pt-2 w-56 z-40">
          <div className="rounded-card bg-snow border border-cloud shadow-soft-lg overflow-hidden animate-scale-in">
            <div className="px-4 py-3 border-b border-cloud">
              <div className="text-sm font-medium text-ink truncate">{fullName}</div>
              <div className="text-xs text-stone mt-0.5">{ROLE_LABEL[role] ?? role}</div>
            </div>
            {impersonatorId !== null && (
              <button
                onClick={() =>
                  signIn('impersonate', {
                    targetUserId: String(impersonatorId),
                    callbackUrl: '/admin/users',
                  })
                }
                className="w-full text-left px-4 py-2.5 text-sm text-sunset hover:bg-cloud/50 transition-colors border-b border-cloud"
              >
                Вернуться в свой аккаунт
              </button>
            )}
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
