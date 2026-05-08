'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';

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
        className="bg-white border border-cloud rounded-card p-6 shadow-soft space-y-4"
      >
        <div>
          <label className="text-xs uppercase tracking-widest text-stone block mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ivan@idaproject.com"
            autoComplete="email"
            className="w-full bg-canvas border border-cloud rounded px-3 py-2 text-sm focus:outline-none focus:border-lime"
            required
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-stone block mb-1.5">
            Пароль
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full bg-canvas border border-cloud rounded px-3 py-2 text-sm focus:outline-none focus:border-lime"
            required
          />
        </div>
        {error && <div className="text-xs text-sunset">{error}</div>}
        <button
          type="submit"
          disabled={loading !== null}
          className="w-full bg-lime border border-lime text-ink rounded-pill py-2.5 text-sm font-medium hover:brightness-95 transition disabled:opacity-50"
        >
          {loading === 'password' ? 'Вхожу…' : 'Войти'}
        </button>
        <p className="text-xs text-stone text-center leading-relaxed">
          Если ещё нет доступа — попроси админа создать аккаунт.
        </p>
      </form>

      {/* Dev mode helper */}
      {isDev && devUsers.length > 0 && (
        <details className="bg-white border border-cloud rounded-card shadow-soft">
          <summary className="cursor-pointer px-6 py-4 text-xs uppercase tracking-widest text-stone hover:bg-canvas">
            Dev mode — быстрый вход без пароля
          </summary>
          <div className="px-6 pb-4">
            <p className="text-xs text-stone mb-3">
              Доступно только при <code className="font-mono">AUTH_MODE=dev</code>.
              Выбери пользователя:
            </p>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {Object.entries(grouped).map(([role, users]) => (
                <div key={role}>
                  <div className="text-xs uppercase tracking-widest text-stone py-2 px-1">
                    {ROLE_LABEL[role] ?? role}
                  </div>
                  {users.map((u) => (
                    <button
                      key={u.email}
                      type="button"
                      onClick={() => handleDevLogin(u.email)}
                      disabled={loading !== null}
                      className="w-full text-left flex items-center justify-between p-2.5 rounded-card hover:bg-canvas border border-transparent hover:border-cloud transition disabled:opacity-50"
                    >
                      <div>
                        <div className="font-medium text-sm">{u.fullName}</div>
                        <div className="text-xs text-stone">
                          {u.email}
                          {u.buildName && <> · {u.buildName}</>}
                        </div>
                      </div>
                      <div className="text-xs text-stone font-mono">
                        {loading === u.email ? '…' : '→'}
                      </div>
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
