'use client';

import { useEffect, useState } from 'react';
import { activeSeason, seasonDeadlineLabel, type Season } from '@/lib/assessmentSeason';

/**
 * Сезонный ремайндер о грейдировании: до старта сезона назначь даты.
 * Показывается месяц перед стартом и в день старта — 1 марта … 1 апреля
 * и 1 сентября … 1 октября (правило и даты — в lib/assessmentSeason).
 *
 * Поведение:
 *  - При mount фон ярко-лаймовый, через 5 секунд плавно затухает до светло-серого.
 *  - Не sticky/fixed — обычный блок над хедером. При скролле вниз страница
 *    уезжает, плашка естественно уходит из видимости, шапка (sticky) остаётся.
 *
 * Адресат: admin / lead / stardiz (designer этот раздел не видит).
 */
export default function AssessmentReminder() {
  // Инициализируем как null, чтобы избежать flash на SSR — фактическое окно
  // вычисляется на клиенте после mount.
  const [period, setPeriod] = useState<Season | null>(null);
  const [highlighted, setHighlighted] = useState(true);

  useEffect(() => {
    setPeriod(activeSeason(new Date()));
  }, []);

  useEffect(() => {
    if (!period) return;
    const t = setTimeout(() => setHighlighted(false), 5000);
    return () => clearTimeout(t);
  }, [period]);

  if (!period) return null;

  const deadline = seasonDeadlineLabel(period);

  return (
    // Капсула в стиле Dynamic Island — центрированная пилюля под хедером
    <div className="relative z-10 px-4 mt-5">
      <div
        className={`w-fit max-w-full mx-auto rounded-pill px-5 py-2 text-sm font-medium
                    text-center transition-colors duration-1000 ease-out ${
                      highlighted
                        ? 'bg-lime text-black shadow-[0_0_24px_rgb(var(--lime-glow-rgb)_/_0.2)]'
                        : 'bg-snow/75 text-graphite border border-cloud/60 backdrop-blur-xl'
                    }`}
      >
        Сезон оценок — до {deadline} назначь даты грейдирования подопечным
      </div>
    </div>
  );
}
