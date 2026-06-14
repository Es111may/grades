'use client';

/**
 * Колонка «% попадания в срок за 6 мес» в hero-карточке портрета.
 *
 * Рендерится КАК колонка внутри Grade card (`grid-cols-[auto_1fr_auto]`).
 * Возвращает null если:
 *   - билд `creator` (Инхаус — у них нет данных в трекерах);
 *   - сама стата не пришла (нет данных / ClickHouse недоступен).
 *
 * Цвет крупной метрики — по зонам из perfScore.ts:
 *   ≥ 85% emerald · 70–84% amber · < 70% blaze.
 */

import type { BuildCode } from '@/lib/types';
import { getOnTimeZone } from '@/lib/perfScore';

const ZONE_COLOR: Record<ReturnType<typeof getOnTimeZone>, string> = {
  emerald: 'text-emerald',
  amber: 'text-amber-600',
  blaze: 'text-blaze',
};

export default function OnTimeChip({
  onTimePercent,
  totalTasks,
  buildCode,
}: {
  onTimePercent: number | null;
  totalTasks: number;
  buildCode: BuildCode | null;
}) {
  if (buildCode === 'creator') return null;
  if (onTimePercent == null || totalTasks === 0) return null;

  const zone = getOnTimeZone(onTimePercent);

  return (
    <div className="text-right">
      <div className="text-[11px] text-stone mb-2">В срок (6 мес)</div>
      <div
        className={`font-display text-4xl font-medium tracking-tight tabular-nums ${ZONE_COLOR[zone]}`}
      >
        {Math.round(onTimePercent)}%
      </div>
      <div className="text-xs text-stone mt-1.5 tabular-nums">
        {totalTasks} {pluralizeTasks(totalTasks)} · цель 85%+
      </div>
    </div>
  );
}

function pluralizeTasks(n: number): string {
  const last = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'задач';
  if (last === 1) return 'задача';
  if (last >= 2 && last <= 4) return 'задачи';
  return 'задач';
}
