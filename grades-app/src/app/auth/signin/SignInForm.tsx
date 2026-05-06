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
  const [loading, setLoading] = useState<string | null>(null);

  async function handleDevLogin(email: string) {
    setLoading(email);
    await signIn('dev', { email, callbackUrl: callbackUrl ?? '/' });
  }

  async function handleKeycloakLogin() {
    setLoading('keycloak');
    await signIn('keycloak', { callbackUrl: callbackUrl ?? '/' });
  }

  if (!isDev) {
    return (
      <div className="bg-white border border-cloud rounded-card p-8 shadow-soft">
        <p className="text-sm text-stone leading-relaxed mb-6">
          Используется корпоративный SSO. Нажми кнопку ниже — откроется страница Keycloak.
        </p>
        <button
          onClick={handleKeycloakLogin}
          disabled={loading !== null}
          className="w-full bg-lime-light border border-lime text-ink rounded-pill py-3 font-medium hover:brightness-95 transition disabled:opacity-50"
        >
          {loading ? 'Перенаправление…' : 'Войти через Keycloak'}
        </button>
      </div>
    );
  }

  // Dev mode
  const grouped: Record<string, DevUser[]> = {};
  for (const u of devUsers) {
    if (!grouped[u.role]) grouped[u.role] = [];
    grouped[u.role].push(u);
  }

  return (
    <div className="bg-white border border-cloud rounded-card p-6 shadow-soft">
      <div className="mb-5">
        <div className="text-xs uppercase tracking-widest text-stone mb-1">Dev mode</div>
        <p className="text-sm text-stone leading-relaxed">
          Авторизация без пароля для локальной разработки. Выбери пользователя.
        </p>
      </div>

      {devUsers.length === 0 ? (
        <div className="bg-canvas border border-cloud rounded-card p-4 text-sm text-stone">
          В БД нет пользователей. Запусти{' '}
          <code className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border border-cloud">
            npm run db:seed
          </code>
          .
        </div>
      ) : (
        <div className="space-y-1">
          {Object.entries(grouped).map(([role, users]) => (
            <div key={role}>
              <div className="text-xs uppercase tracking-widest text-stone py-2 px-1">
                {ROLE_LABEL[role] ?? role}
              </div>
              {users.map((u) => (
                <button
                  key={u.email}
                  onClick={() => handleDevLogin(u.email)}
                  disabled={loading !== null}
                  className="w-full text-left flex items-center justify-between p-3 rounded-card hover:bg-canvas border border-transparent hover:border-cloud transition disabled:opacity-50"
                >
                  <div>
                    <div className="font-medium text-sm">{u.fullName}</div>
                    <div className="text-xs text-stone">
                      {u.email}
                      {u.buildName && (
                        <>
                          {' · '}
                          <span>{u.buildName}</span>
                        </>
                      )}
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
      )}
    </div>
  );
}
