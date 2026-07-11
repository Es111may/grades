import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';

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
      <div className="w-full max-w-[400px] flex flex-col items-center text-center">
        <BrandLogo className="w-[180px] h-[25px] mb-4" />
        <p className="text-sm text-stone mb-6">Не получилось войти</p>
        <div className="card p-6 mb-5 w-full">
          <p className="text-sm text-ink leading-relaxed">{message}</p>
          <p className="text-[11px] text-stone mt-3 font-mono">code: {code}</p>
        </div>
        <Link href="/auth/signin" className="btn-accent">
          Попробовать снова
        </Link>
      </div>
    </main>
  );
}
