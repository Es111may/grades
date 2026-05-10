'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { ChevronDownIcon } from '@/components/icons';

type DevUser = {
  email: string;
  fullName: string;
  role: string;
  buildName: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  lead: 'Lead',
  designer: 'Designer',
  stardiz: 'Stardiz',
};

export default function SignInForm({
  isDev,
  devUsers,
  callbackUrl,
}: {
  isDev: boolean;
  devUsers: DevUser[];
  callbackUrl?: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) return;
    setLoading('password');
    const res = await signIn('password', {
      email: email.trim(),
      password,
      redirect: false,
      callbackUrl: callbackUrl ?? '/',
    });
    if (res?.error) {
      setError('Неверный email или пароль');
      setLoading(null);
      return;
    }
    if (res?.url) window.location.href = res.url;
  }

  async function handleDevLogin(devEmail: string) {
    setLoading(devEmail);
    await signIn('dev', { email: devEmail, callbackUrl: callbackUrl ?? '/' });
  }

  // Dev mode helper
  const grouped: Record<string, DevUser[]> = {};
  for (const u of devUsers) {
    if (!grouped[u.role]) grouped[u.role] = [];
    grouped[u.role].push(u);
  }

  return (
    <div className="space-y-4">
      {/* Password form (always visible) */}
      <form
        onSubmit={handlePasswordLogin}
        className="card p-6 space-y-4"
      >
        <div>
          <label className="text-xs font-medium text-stone block mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ivan@idaproject.com"
            autoComplete="email"
            className="input"
            required
          />
        </div>
        <div>
          <label className="text-xs font-medium text-stone block mb-1.5">Пароль</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="input"
            required
          />
        </div>
        {error && <div className="text-xs text-blaze">{error}</div>}
        <button type="submit" disabled={loading !== null} className="btn-accent w-full">
          {loading === 'password' ? 'Вхожу…' : 'Войти'}
        </button>
        <p className="text-xs text-stone text-center">
          Если ещё нет доступа — попроси админа создать аккаунт.
        </p>
      </form>

      {/* Dev mode helper */}
      {isDev && devUsers.length > 0 && (
        <details className="card group">
          <summary className="cursor-pointer px-5 py-3.5 text-[11px] uppercase tracking-widest text-stone hover:bg-canvas/60 rounded-card transition-colors flex items-center justify-between">
            <span>Dev mode · быстрый вход</span>
            <ChevronDownIcon className="w-3.5 h-3.5 text-ash transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-5 pb-4 -mt-1">
            <p className="text-xs text-stone mb-3">
              Доступно только при <code className="font-mono">AUTH_MODE=dev</code>.
            </p>
            <div className="space-y-1 max-h-80 overflow-y-auto -mx-1">
              {Object.entries(grouped).map(([role, users]) => (
                <div key={role}>
                  <div className="text-[11px] uppercase tracking-widest text-stone py-1.5 px-2">
                    {ROLE_LABEL[role] ?? role}
                  </div>
                  {users.map((u) => (
                    <button
                      key={u.email}
                      type="button"
                      onClick={() => handleDevLogin(u.email)}
                      disabled={loading !== null}
                      className="w-full text-left flex items-center justify-between px-2 py-2 rounded-card hover:bg-canvas/80 transition-colors disabled:opacity-50"
                    >
                      <div>
                        <div className="font-medium text-sm leading-tight">
                          {u.fullName}
                        </div>
                        <div className="text-xs text-stone leading-tight mt-0.5">
                          {u.email}
                          {u.buildName && <> · {u.buildName}</>}
                        </div>
                      </div>
                      <span className="text-ash">
                        {loading === u.email ? '…' : '→'}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
