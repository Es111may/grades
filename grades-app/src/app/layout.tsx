import type { Metadata } from 'next';
import SessionProvider from '@/components/SessionProvider';
import DesktopOnly from '@/components/DesktopOnly';
import './globals.css';

export const metadata: Metadata = {
  title: 'Грейды',
  description: 'Веб-сервис грейдирования дизайнеров',
  manifest: '/manifest.webmanifest',
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
        {/* Восстановление темы и выключателя зарплат до первой отрисовки —
            без вспышки тёмной темы и без мелькания цифр. Дефолт — тёмная тема
            и зарплаты видны; 'light' и 'salary-hidden' хранятся в localStorage. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('theme')==='light')document.documentElement.setAttribute('data-theme','light');if(localStorage.getItem('salary-hidden')==='1')document.documentElement.setAttribute('data-salary','hidden')}catch(e){}",
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
        {/* Только десктоп: ниже lg сервис скрыт, поверх — заглушка */}
        <DesktopOnly />
        <div className="hidden lg:block">
          <SessionProvider>{children}</SessionProvider>
        </div>
      </body>
    </html>
  );
}
