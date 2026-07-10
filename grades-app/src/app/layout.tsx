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
    // suppressHydrationWarning: инлайн-скрипт ниже ставит data-theme ДО
    // гидрации — React не должен ругаться на «лишний» атрибут.
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* Восстановление темы до первой отрисовки — без вспышки тёмной.
            Дефолт — тёмная (без атрибута), 'light' в localStorage — светлая. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('theme')==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}",
          }}
        />
        {/* Onest грузится локально через @font-face в globals.css.
            Preload — чтобы шрифт начал тянуться параллельно HTML и не было
            «вспышки» fallback'а. Один вариативный файл покрывает все веса. */}
        <link
          rel="preload"
          href="/fonts/onest/Onest-Variable.ttf"
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
