import TitleAurora from './TitleAurora';

/**
 * Заглушка для телефона и планшета (Pavel 29.09.2026): мобильную вёрстку не
 * прорабатываем. Ниже lg (1024px) сервис скрыт, вместо него — надпись и
 * свечение. Показ и скрытие — чистым CSS, без JS: никаких вспышек интерфейса.
 */
export default function DesktopOnly() {
  return (
    <div
      className="lg:hidden fixed inset-0 z-[100] flex items-center justify-center px-6 overflow-hidden"
      style={{ background: 'rgb(var(--c-page))' }}
    >
      <div className="relative text-center title-halo">
        <TitleAurora />
        <p className="font-display text-[32px] leading-tight font-medium tracking-[-0.02em] text-ink">
          Доступно только на десктопе
        </p>
      </div>
    </div>
  );
}
