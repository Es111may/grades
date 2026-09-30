'use client';

import Avatar from '@/components/Avatar';
import Tooltip from '@/components/Tooltip';
import { ArrowUpIcon } from '@/components/icons';
import { formatDateShort } from '@/lib/dates';
import { formatThousands } from '@/lib/compensation';

/** Плановый пересмотр в том виде, в каком он приходит в строку списка. */
export type PlannedRaiseRow = {
  at: string | null;
  salary: number | null;
  note: string | null;
};

export function plannedRaiseHint(p: PlannedRaiseRow): string {
  const parts = ['Планируется пересмотр з/п'];
  if (p.at) parts.push(formatDateShort(p.at));
  if (p.salary) parts.push(`→ ${formatThousands(p.salary)} тыс.`);
  return parts.join(' · ');
}

/**
 * Аватар с бейджем «планируется пересмотр» (Phase 23.4). Бейдж приходит
 * только тем, кто вправе видеть деньги (админ и лид по своим): сервер кладёт
 * plannedRaise в строку лишь им. Выполненный пересмотр сервер уже убрал.
 */
export default function AvatarWithRaise({
  name,
  avatarUrl,
  size,
  planned,
}: {
  name: string;
  avatarUrl?: string | null;
  size: number;
  planned?: PlannedRaiseRow | null;
}) {
  if (!planned) return <Avatar name={name} avatarUrl={avatarUrl} size={size} />;
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar name={name} avatarUrl={avatarUrl} size={size} />
      {/* Позиционирует обёртка, а не Tooltip: в CSS-режиме он ставит себе
          relative, и absolute на нём проиграл бы порядку классов Tailwind.
          portal — карточка таблицы (overflow: hidden) обрезала хинт; поповер
          живёт в body и не наследует salary-sensitive обёртки — вешаем
          класс на него самого. */}
      <span className="salary-sensitive absolute -right-1 -bottom-1">
        <Tooltip
          text={plannedRaiseHint(planned)}
          align="center"
          portal
          className="rounded-full"
          tipClassName="salary-sensitive"
        >
          <span
            className="w-4 h-4 rounded-full bg-lime text-black ring-2 ring-snow
                       flex items-center justify-center"
            aria-label="Планируется пересмотр з/п"
          >
            <ArrowUpIcon className="w-2.5 h-2.5" />
          </span>
        </Tooltip>
      </span>
    </span>
  );
}
