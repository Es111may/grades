'use client';

import { useEffect, useState } from 'react';

/**
 * Сезонный ремайндер о грейдировании. Показывается только в окнах
 * 15 марта — 15 апреля и 15 сентября — 15 октября.
 *
 * Поведение:
 *  - При mount фон ярко-лаймовый, через 5 секунд плавно затухает до светло-серого.
 *  - Не sticky/fixed — обычный блок над хедером. При скролле вниз страница
 *    уезжает, плашка естественно уходит из видимости, шапка (sticky) остаётся.
 *
 * Адресат: admin / lead / stardiz (designer этот раздел не видит).
 */
function activePeriod(): 'spring' | 'autumn' | null {
  const now = new Date();
  const m = now.getMonth() + 1; // 1..12
  const d = now.getDate();
  // TEMP: добавлен май для временной визуальной проверки. Удалить `|| m === 5`,
  // когда Pavel подтвердит, что плашка выглядит как нужно.
  if ((m === 3 && d >= 15) || (m === 4 && d <= 15) || m === 5) return 'spring';
  if ((m === 9 && d >= 15) || (m === 10 && d <= 15)) return 'autumn';
  return null;
}

export default function AssessmentReminder() {
  // Инициализируем как null, чтобы избежать flash на SSR — фактическое окно
  // вычисляется на клиенте после mount.
  const [period, setPeriod] = useState<'spring' | 'autumn' | null>(null);
  const [highlighted, setHighlighted] = useState(true);

  useEffect(() => {
    setPeriod(activePeriod());
  }, []);

  useEffect(() => {
    if (!period) return;
    const t = setTimeout(() => setHighlighted(false), 5000);
    return () => clearTimeout(t);
  }, [period]);

  if (!period) return null;

  const deadline = period === 'spring' ? '15 апреля' : '15 октября';

  return (
    <div
      className={`w-full transition-colors duration-1000 ease-out ${
        highlighted ? 'bg-lime text-ink' : 'bg-cloud/60 text-graphite'
      }`}
    >
      <div className="max-w-[1400px] mx-auto px-6 py-2 text-sm font-medium text-center">
        Сезон оценок — до {deadline} назначь даты грейдирования подопечным
      </div>
    </div>
  );
}
