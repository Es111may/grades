'use client';

/**
 * Client-часть плашки про зависшие черновики. Логику «брать или нет»
 * решает server-component `DraftsReminder.tsx` — здесь только рендер.
 *
 * Анимация — как у AssessmentReminder: при mount фон ярко-выраженный
 * (красный, если есть зависшие черновики >7 дней; нейтрально-серый,
 * если только свежие), через 5 сек плавно затухает до светло-серого.
 * Не sticky/fixed — обычный блок над хедером, при скролле уезжает.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function DraftsReminderBanner({
  total,
  hasStale,
  oldestDesignerName,
  oldestAgeDays,
}: {
  total: number;
  hasStale: boolean;
  oldestDesignerName: string;
  oldestAgeDays: number;
}) {
  const [highlighted, setHighlighted] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setHighlighted(false), 5000);
    return () => clearTimeout(t);
  }, []);

  // Цвета:
  // - hasStale + highlighted → красный (blaze, ink-white текст)
  // - hasStale + faded       → светло-красный фон, blaze-текст
  // - не stale + highlighted → нейтральный graphite
  // - не stale + faded       → светло-серый
  const cls = hasStale
    ? highlighted
      ? 'bg-blaze text-white'
      : 'bg-blaze/10 text-blaze backdrop-blur-xl border border-blaze/15'
    : highlighted
      ? 'bg-cloud/60 text-graphite'
      : 'bg-cloud/40 text-stone';

  // Коротко (Pavel): детали — на странице оценок по клику
  const message = hasStale
    ? `${total} ${pluralizeDrafts(total)} без движения`
    : `${total} ${pluralizeDrafts(total)} в работе`;

  return (
    // Обычный блок под островом (не sticky) — при скролле уезжает вверх.
    // Зазор до соседней капсулы 8px; компенсацию sticky-сдвига острова
    // даёт обёртка в layout.
    <div className="relative z-10 px-4 mt-5">
      <Link
        href="/lead/assessments"
        className={`block w-fit max-w-full mx-auto rounded-pill px-5 py-2 text-sm
                    font-medium text-center transition-colors duration-1000 ease-out
                    hover:brightness-95 ${cls}`}
      >
        {message}
        <span className="ml-2 opacity-75">→</span>
      </Link>
    </div>
  );
}

function pluralizeDrafts(n: number): string {
  const last = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'черновиков';
  if (last === 1) return 'черновик';
  if (last >= 2 && last <= 4) return 'черновика';
  return 'черновиков';
}

function pluralizeDays(n: number): string {
  const last = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'дней';
  if (last === 1) return 'день';
  if (last >= 2 && last <= 4) return 'дня';
  return 'дней';
}
