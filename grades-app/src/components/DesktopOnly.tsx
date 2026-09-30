'use client';

import { useEffect, useState } from 'react';
import TitleAurora from './TitleAurora';

/** Граница Tailwind lg (1024px): ниже неё сервис скрыт заглушкой */
const NARROW_QUERY = '(max-width: 1023.98px)';

/**
 * Заглушка для телефона и планшета (Pavel 29.09.2026): мобильную вёрстку не
 * прорабатываем. Ниже lg (1024px) сервис скрыт, вместо него — надпись и
 * свечение. Показ и скрытие — чистым CSS, без JS: никаких вспышек интерфейса.
 *
 * Аврора (WebGL) монтируется только на узком экране: на десктопе заглушка
 * скрыта CSS'ом, но канвас с шейдером всё равно создавался бы и держал
 * GL-контекст. Флаг — по matchMedia с подпиской на смену ширины; на SSR и
 * до гидрации авроры нет, надпись при этом видна сразу.
 */
export default function DesktopOnly() {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    setNarrow(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return (
    <div
      className="lg:hidden fixed inset-0 z-[100] flex items-center justify-center px-6 overflow-hidden"
      style={{ background: 'rgb(var(--c-page))' }}
    >
      <div className="relative text-center title-halo">
        {narrow && <TitleAurora />}
        <p className="font-display text-[32px] leading-tight font-medium tracking-[-0.02em] text-ink">
          Доступно только на десктопе
        </p>
      </div>
    </div>
  );
}
