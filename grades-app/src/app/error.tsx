'use client';

import { startTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Ошибка рендера страницы (внутри корневого layout — тема и шрифты на месте).
 * Никаких деталей и стектрейсов: они уходят в логи сервера / консоль
 * браузера, пользователю — только понятный текст и повтор.
 *
 * «Обновить»: router.refresh() заново запрашивает серверные данные (ошибка
 * могла быть в серверном компоненте), reset() перерисовывает сегмент.
 */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="text-center animate-fade-up">
        <h1 className="font-display text-[32px] leading-tight font-medium tracking-[-0.02em] text-ink">
          Что-то пошло не так
        </h1>
        <button type="button" onClick={retry} className="btn-accent mt-6">
          Обновить
        </button>
      </div>
    </main>
  );
}
