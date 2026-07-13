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
      {/* Glass-карточка над авророй; поля крупные, фокус — фирменный лайм */}
      <form
        onSubmit={handlePasswordLogin}
        className="rounded-modal border border-cloud/60 bg-snow/70 backdrop-blur-2xl
                   shadow-soft-lg p-8 space-y-5"
        style={{ WebkitBackdropFilter: 'blur(24px) saturate(160%)' }}
      >
        <div className="space-y-2">
          <label htmlFor="login-email" className="label-mono text-stone block">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ivan@idaproject.com"
            autoComplete="email"
            className="w-full h-12 rounded-[14px] bg-ink/5 border border-ink/10 px-4
                       text-[15px] text-ink placeholder:text-ash transition-all
                       focus:outline-none focus:border-lime/50 focus:ring-4 focus:ring-lime/10"
            required
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="login-password" className="label-mono text-stone block">
            Пароль
          </label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full h-12 rounded-[14px] bg-ink/5 border border-ink/10 px-4
                       text-[15px] text-ink placeholder:text-ash transition-all
                       focus:outline-none focus:border-lime/50 focus:ring-4 focus:ring-lime/10"
            required
          />
        </div>
        {error && (
          <div className="text-[13px] text-blaze bg-blaze/10 border border-blaze/15
                          rounded-[12px] px-4 py-2.5">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading !== null}
          className="w-full h-12 rounded-pill bg-lime text-black font-medium text-[15px]
                     transition-all duration-200 ease-apple-out
                     shadow-[0_0_28px_rgb(var(--lime-glow-rgb)_/_0.22)]
                     hover:-translate-y-px hover:shadow-[0_0_40px_rgb(var(--lime-glow-rgb)_/_0.34)]
                     disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {loading === 'password' ? 'Вхожу…' : 'Войти'}
        </button>
      </form>
      <p className="text-xs text-stone text-center">
        Если ещё нет доступа — попроси админа создать аккаунт.
      </p>

      {/* Dev mode helper */}
      {isDev && devUsers.length > 0 && (
        <details className="card group">
          <summary className="cursor-pointer px-5 py-3.5 text-[11px]  text-stone hover:bg-canvas/60 rounded-card transition-colors flex items-center justify-between">
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
                  <div className="text-[11px]  text-stone py-1.5 px-2">
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
