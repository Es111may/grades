import Link from 'next/link';

const ERROR_MESSAGES: Record<string, string> = {
  Configuration: 'Ошибка конфигурации авторизации. Свяжись с администратором.',
  AccessDenied: 'Нет доступа. Учётка отсутствует в системе или деактивирована.',
  Verification: 'Ссылка для входа истекла или уже использована.',
  Default: 'Не удалось войти. Попробуй ещё раз.',
};

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const code = searchParams.error || 'Default';
  const message = ERROR_MESSAGES[code] || ERROR_MESSAGES.Default;

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="text-xs uppercase tracking-widest text-stone mb-3">Грейды</div>
        <h1 className="font-display text-4xl font-light mb-6">Не получилось войти</h1>
        <div className="bg-white border border-cloud rounded-card p-6 shadow-soft mb-6">
          <p className="text-sm text-graphite leading-relaxed">{message}</p>
          <p className="text-xs text-stone mt-3 font-mono">code: {code}</p>
        </div>
        <Link
          href="/auth/signin"
          className="inline-block bg-lime-light border border-lime rounded-pill px-6 py-2.5 font-medium hover:brightness-95 transition"
        >
          Попробовать снова
        </Link>
      </div>
    </main>
  );
}
