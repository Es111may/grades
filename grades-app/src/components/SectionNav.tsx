'use client';

import { useEffect, useState } from 'react';

/**
 * Sticky-навигация по разделам страницы.
 *
 * Появляется снизу по центру при скролле (когда первая секция уехала за
 * viewport). Подсвечивает активный раздел через IntersectionObserver —
 * активной считается та секция, которая ближе к центру экрана.
 *
 * Клик на таб скроллит к якорю. Каждая секция на странице должна иметь
 * `id`, совпадающий с одним из переданных id.
 */
export type SectionNavItem = {
  id: string;
  label: string;
};

export default function SectionNav({ sections }: { sections: SectionNavItem[] }) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? '');
  const [visible, setVisible] = useState(false);

  // Активная секция — та, что пересекает условный «фокус» в верхней
  // трети экрана. rootMargin `-30% 0px -60% 0px` сужает зону наблюдения
  // именно так: секция «активна», когда её верх перешёл за 30% от верха
  // viewport и ещё не уехал ниже -60%.
  useEffect(() => {
    if (sections.length === 0) return;
    const elements = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.filter((e) => e.isIntersecting);
        if (intersecting.length === 0) return;
        // Берём ту, что выше — это «текущая активная»
        const top = intersecting.reduce((acc, e) =>
          e.boundingClientRect.top < acc.boundingClientRect.top ? e : acc,
        );
        setActiveId((top.target as HTMLElement).id);
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    elements.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sections]);

  // Появляется после прокрутки на ~ один экран первой секции.
  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 320);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    // Сдвигаем на высоту шапки-навигации, чтобы заголовок секции не уехал
    // под фиксированный AppHeader.
    const y = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top: y, behavior: 'smooth' });
    history.replaceState(null, '', `#${id}`);
    setActiveId(id);
  }

  if (sections.length === 0) return null;

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 transition-all duration-200 ease-apple-out max-w-[calc(100vw-32px)] ${
        visible
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-3 pointer-events-none'
      }`}
    >
      <div className="bg-snow/95 backdrop-blur-md border border-cloud rounded-pill shadow-soft-lg p-1 overflow-x-auto max-w-full">
        <div className="segmented flex-nowrap">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => handleClick(e, s.id)}
              className={`segmented-item whitespace-nowrap ${
                activeId === s.id ? 'segmented-item-active' : ''
              }`}
            >
              {s.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
