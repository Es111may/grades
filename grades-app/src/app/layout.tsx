import type { Metadata } from 'next';
import SessionProvider from '@/components/SessionProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Грейды',
  description: 'Веб-сервис грейдирования дизайнеров',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <head>
        {/* Aeonik Pro грузится локально через @font-face в globals.css.
            Preload — чтобы шрифт начал тянуться параллельно HTML и не было
            «вспышки» fallback'а. Один вариативный файл покрывает все веса. */}
        <link
          rel="preload"
          href="/fonts/aeonik-pro/AeonikPro-Variable.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
