'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { activeSeason, seasonDeadlineLabel, type Season } from '@/lib/assessmentSeason';

/**
 * Сезонное напоминание ДИЗАЙНЕРУ: обнови самооценку и приложи работы
 * до старта сезона оценок. Окна — те же, что у AssessmentReminder
 * (1 марта — 1 апреля, 1 сентября — 1 октября; lib/assessmentSeason),
 * адресат другой.
 *
 * Поведение капсулы: при mount — лаймовая, через 5 секунд затухает.
 */
export default function SelfAssessmentReminder() {
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
    <div className="relative z-10 px-4 mt-5">
      <Link
        href="/designer"
        className={`block w-fit max-w-full mx-auto rounded-pill px-5 py-2 text-sm
                    font-medium text-center transition-colors duration-1000 ease-out
                    hover:brightness-95 ${
                      highlighted
                        ? 'bg-lime text-black shadow-[0_0_24px_rgb(var(--lime-glow-rgb)_/_0.2)]'
                        : 'bg-snow/75 text-graphite border border-cloud/60 backdrop-blur-xl'
                    }`}
      >
        Сезон оценок — до {deadline} обнови самооценку и приложи работы
        <span className="ml-2 opacity-75">→</span>
      </Link>
    </div>
  );
}
