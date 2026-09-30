import type { Metadata } from 'next';
import SessionProvider from '@/components/SessionProvider';
import DesktopOnly from '@/components/DesktopOnly';
import { onest, jetbrainsMono } from './fonts';
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
    // Классы шрифтов объявляют --font-onest / --font-jetbrains-mono — на них
    // завязаны body, Tailwind font-sans/display/mono и .label-mono.
    <html
      lang="ru"
      className={`${onest.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
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
        {/* Шрифты — через next/font (src/app/fonts.ts): прелоад Onest и
            @font-face Next вставляет сам. */}
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
