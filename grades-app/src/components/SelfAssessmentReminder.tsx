'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Сезонное напоминание ДИЗАЙНЕРУ: обнови самооценку и приложи работы
 * до дедлайна грейдирования. Окна — те же, что у AssessmentReminder
 * (15 марта — 15 апреля, 15 сентября — 15 октября), адресат другой.
 *
 * Поведение капсулы: при mount — лаймовая, через 5 секунд затухает.
 */
function activePeriod(): 'spring' | 'autumn' | null {
  const now = new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  if ((m === 3 && d >= 15) || (m === 4 && d <= 15)) return 'spring';
  if ((m === 9 && d >= 15) || (m === 10 && d <= 15)) return 'autumn';
  return null;
}

export default function SelfAssessmentReminder() {
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
