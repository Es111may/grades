'use client';

/**
 * Тонкая sticky-полоса наверху, появляется когда hero уезжает за
 * вьюпорт (порог 280px по скроллу). Сохраняет контекст «кого мы
 * читаем» при просмотре длинного портрета.
 *
 * Содержит:
 *   - мини-аватар 32px
 *   - имя
 *   - chip с грейдом (заливка по уровню — та же палитра, что hero-карта)
 *   - chip с XP
 *   - chip «В срок 6 мес» (только если у дизайнера есть данные)
 *
 * Высота ~52px. Появляется с плавным fade-in.
 */

import { useEffect, useState } from 'react';
import Avatar from '@/components/Avatar';
import { GRADE_NAMES } from '@/lib/types';
import type { BuildCode, GradeCode } from '@/lib/types';

const GRADE_CHIP_STYLE: Record<string, { bg: string; fg: string }> = {
  junior:      { bg: '#f5f5f7', fg: '#1d1d1f' },
  junior_plus: { bg: '#e9ebee', fg: '#1d1d1f' },
  premiddle:   { bg: '#d6dae0', fg: '#1d1d1f' },
  middle:      { bg: '#929298', fg: '#ffffff' },
  middle_plus: { bg: '#4f5358', fg: '#ffffff' },
  senior:      { bg: '#1a1b1d', fg: '#d5ff0c' },
  stardiz:     { bg: '#1a1b1d', fg: '#d5ff0c' },
  lead:        { bg: '#1a1b1d', fg: '#d5ff0c' },
};

export default function PortraitStickyHeader({
  fullName,
  avatarUrl,
  effectiveGrade,
  totalXp,
  maxXp,
  onTimePercent,
  buildCode,
}: {
  fullName: string;
  avatarUrl: string | null;
  effectiveGrade: GradeCode;
  totalXp: number;
  maxXp: number;
  onTimePercent: number | null;
  buildCode: BuildCode | null;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame: number | null = null;
    const onScroll = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        // Порог появления — примерно когда нижняя кромка hero уехала.
        // Точнее в проекте 80px аватар + 44px имя + 14px мета ≈ 200px,
        // плюс верхний паддинг 32px — 280 как «эмпирически нормально».
        setVisible(window.scrollY > 280);
        frame = null;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  const gradeStyle = GRADE_CHIP_STYLE[effectiveGrade] ?? GRADE_CHIP_STYLE.junior;
  const showOnTime =
    onTimePercent != null && buildCode !== 'creator';
  const onTimeColor =
    onTimePercent == null
      ? ''
      : onTimePercent >= 85
        ? 'text-emerald'
        : onTimePercent >= 70
          ? 'text-amber-600'
          : 'text-blaze';

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-30 transition-all duration-200 ${
        visible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 -translate-y-2 pointer-events-none'
      }`}
      // backdrop-filter blur — компромисс между «не закрывает что-то под
      // ним совсем» и «читаемо при цветных карточках наверху».
      style={{
        background: 'rgba(255, 255, 255, 0.86)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
      }}
    >
      <div className="max-w-[1400px] mx-auto px-8 py-2.5 flex items-center gap-3">
        <Avatar name={fullName} avatarUrl={avatarUrl} size={32} />
        <div className="font-medium text-ink truncate">{fullName}</div>
        <div className="flex-1" />
        <div
          className="inline-flex items-center px-2.5 py-1 rounded-pill text-xs font-semibold"
          style={{ background: gradeStyle.bg, color: gradeStyle.fg }}
        >
          {GRADE_NAMES[effectiveGrade]}
        </div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-xs tabular-nums text-ink bg-canvas border border-cloud">
          <span className="text-stone">XP</span>
          <span className="font-semibold">
            {totalXp}
            <span className="text-stone font-normal">/{maxXp}</span>
          </span>
        </div>
        {showOnTime && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-xs tabular-nums bg-canvas border border-cloud">
            <span className="text-stone">В срок</span>
            <span className={`font-semibold ${onTimeColor}`}>
              {Math.round(onTimePercent!)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
