'use client';

import {
  gradingPlanStatus,
  gradingPlanTone,
  type GradingPlanState,
} from '@/lib/gradingPlan';
import { formatDateShort } from '@/lib/dates';
import { CalendarIcon } from '@/components/icons';
import Tooltip from '@/components/Tooltip';

export type GradingPlanSource = {
  nextGradingAt?: string | null;
  nextGradingSetAt?: string | null;
  /** publishedAt последней опубликованной оценки. */
  lastAssessedAt?: string | null;
};

const TONE_CLASS: Record<ReturnType<typeof gradingPlanTone>, string> = {
  danger: 'bg-blaze/10 text-blaze border-blaze/15',
  warn: 'bg-sunset/10 text-sunset border-sunset/15',
  ok: 'bg-emerald/10 text-emerald border-emerald/15',
  muted: 'bg-ink/5 text-stone border-ink/10',
};

/** Короткая подпись состояния — для чипа и для строки в поп-апе. */
export function gradingPlanLabel(
  state: GradingPlanState,
  daysLeft: number | null,
): string {
  switch (state) {
    case 'none':
      return 'Не запланировано';
    case 'planned':
      return `через ${daysLeft} дн.`;
    case 'soon':
      return daysLeft === 0 ? 'сегодня' : `через ${daysLeft} дн.`;
    case 'due':
      return 'срок подошёл';
    case 'overdue':
      return `просрочено на ${-(daysLeft ?? 0)} дн.`;
    case 'done':
      return 'проведено';
  }
}

/**
 * Иконка «грейдирование запланировано» — для списка команды.
 *
 * Pavel: в таблице нужна не колонка, а иконка у тех, у кого грейдирование
 * запланировано; по ховеру — дата; после проведения иконка исчезает.
 * Поэтому здесь ничего не рендерится в состояниях 'done' и 'none' — пустой
 * список читается как «планировать нечего или уже сделано», а разбор этих
 * двух случаев живёт в фиде «Требует внимания».
 *
 * Тон сохраняем: просроченное грейдирование подсвечивается, иначе контроль
 * «не забыли ли» пришлось бы держать только в фиде.
 */
export function GradingPlanIcon({ user }: { user: GradingPlanSource }) {
  const st = gradingPlanStatus({
    nextGradingAt: user.nextGradingAt ?? null,
    nextGradingSetAt: user.nextGradingSetAt ?? null,
    lastPublishedAt: user.lastAssessedAt ?? null,
  });
  if (st.state === 'none' || st.state === 'done' || !st.plannedAt) return null;

  const tone = gradingPlanTone(st.state);
  const color =
    tone === 'danger' ? 'text-blaze' : tone === 'warn' ? 'text-sunset' : 'text-ash';

  return (
    <Tooltip
      text={`Грейдирование — ${formatDateShort(st.plannedAt.toISOString())} · ${gradingPlanLabel(
        st.state,
        st.daysLeft,
      )}`}
      align="center"
    >
      <CalendarIcon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
    </Tooltip>
  );
}

/**
 * Полный чип с датой — для поп-апа 360 и портрета, где важна подробность:
 * Pavel хочет видеть по итогу, что грейдирование состоялось и когда именно.
 *
 * Состояние не хранится, а выводится: «проведено» = есть опубликованная
 * оценка после постановки даты (см. lib/gradingPlan). Поэтому чип не может
 * разойтись с реальностью, как разошёлся бы ручной флаг.
 */
export default function GradingPlanChip({
  user,
  size = 'sm',
  showLabel = true,
}: {
  user: GradingPlanSource;
  size?: 'sm' | 'md';
  /** false — только дата, без пояснения в скобках (для тесных мест). */
  showLabel?: boolean;
}) {
  const st = gradingPlanStatus({
    nextGradingAt: user.nextGradingAt ?? null,
    nextGradingSetAt: user.nextGradingSetAt ?? null,
    lastPublishedAt: user.lastAssessedAt ?? null,
  });
  const tone = gradingPlanTone(st.state);
  const label = gradingPlanLabel(st.state, st.daysLeft);

  if (st.state === 'none') {
    return (
      <span className={`text-ash ${size === 'md' ? 'text-sm' : 'text-xs'}`}>—</span>
    );
  }

  // Для «проведено» показываем фактическую дату — Pavel: важно видеть, что
  // грейдирование состоялось, и когда именно.
  const shown = st.state === 'done' ? st.completedAt : st.plannedAt;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border px-2 h-6
                  whitespace-nowrap ${TONE_CLASS[tone]} ${
                    size === 'md' ? 'text-xs' : 'text-[11px]'
                  }`}
      title={
        st.state === 'done' && st.plannedAt
          ? `План — ${formatDateShort(st.plannedAt.toISOString())}`
          : undefined
      }
    >
      <span className="tabular-nums">
        {shown ? formatDateShort(shown.toISOString()) : '—'}
      </span>
      {showLabel && <span className="opacity-70">{label}</span>}
    </span>
  );
}
