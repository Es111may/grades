import type { ReactNode } from 'react';
import Avatar from '@/components/Avatar';
import { BuildDot } from '@/components/BuildChip';
import TitleAurora from '@/components/TitleAurora';
import Tooltip from '@/components/Tooltip';
import { formatDateShort } from '@/lib/dates';
import type { BuildCode, GradeCode } from '@/lib/types';

/**
 * Общие куски портрета дизайнера: страница, hero и ряд действий. Ими собраны
 * и портрет с оценкой (app/designer/Portrait), и портрет без оценки
 * (app/designer/PortraitPending) — шапка у них одна.
 */

/** Человек на портрете — шапка и чипы. Собирает lib/portrait (portraitPerson). */
export type PortraitPerson = {
  fullName: string;
  avatarUrl: string | null;
  buildCode: BuildCode | null;
  buildName: string;
  department: string | null;
  leadName: string | null;
  gradeFloor: GradeCode | null;
  // Phase 23.2 — план грейдирования. Дизайнер видит свою дату, но не меняет.
  nextGradingAt?: string | null;
  nextGradingSetAt?: string | null;
  lastAssessedAt?: string | null;
};

/** Glass-чип hero: билд, лид, дата грейдов, цикл. */
export const HERO_CHIP = 'chip bg-snow/60 backdrop-blur-md border border-cloud/40 text-ink';
/** Главный чип hero — грейд, а без оценки — «Без оценки» или закреплённый грейд. */
export const HERO_STATUS_CHIP = 'chip bg-ink text-snow';

/** Страница портрета: колонка 1180 и отступ сверху под hero. */
export function PortraitMain({ children }: { children: ReactNode }) {
  return <main className="max-w-[1180px] mx-auto px-8 pt-[164px] pb-16">{children}</main>;
}

/**
 * Hero по центру (концепт v6): аврора, аватар 96, имя 44px, ряд чипов.
 * Порядок чипов: главный (status) → позиция 9-Box → билд → лид → дата
 * грейдов → trailing (у портрета с оценкой — циклы или дата публикации).
 */
export function PortraitHero({
  person,
  status,
  nineBoxTitle = null,
  trailing,
}: {
  person: PortraitPerson;
  /** Первый, белый чип (HERO_STATUS_CHIP) — грейд или его замена. */
  status: ReactNode;
  /** Позиция 9-Box — сервер передаёт только admin/lead. */
  nineBoxTitle?: string | null;
  trailing?: ReactNode;
}) {
  return (
    <div data-comment-anchor="page-title" className="mb-[164px] flex flex-col items-center text-center animate-fade-up title-halo">
      <TitleAurora />
      {/* Аватар без кольца (Pavel: обводки вокруг аватарок убраны везде) */}
      <Avatar name={person.fullName} avatarUrl={person.avatarUrl} size={96} />
      <h1 className="font-display text-[44px] leading-tight font-medium tracking-tight mt-6">
        {person.fullName}
      </h1>
      <div className="flex items-center justify-center gap-1 flex-wrap mt-3.5">
        {status}
        {nineBoxTitle && (
          <span className="chip bg-lime text-black">{nineBoxTitle} · 9-Box</span>
        )}
        {person.buildCode && (
          <span className={HERO_CHIP}>
            <BuildDot code={person.buildCode} />
            {person.buildName}
          </span>
        )}
        {person.leadName && <span className={HERO_CHIP}>Лид: {person.leadName}</span>}
        {/* Ближайшее грейдирование — главный ответ на «что дальше».
            Только чтение: дату ставят лид, стардиз или админ. */}
        {person.nextGradingAt && (
          <Tooltip
            text="Дата ближайшего грейдирования. Её ставит лид, стардиз или админ — если она сдвинулась, спроси у лида."
            align="center"
          >
            <span className={HERO_CHIP}>Грейды будут: {formatDateShort(person.nextGradingAt)}</span>
          </Tooltip>
        )}
        {trailing}
      </div>
    </div>
  );
}

/** Ряд действий — по центру, вплотную к карточкам bento (Pavel). */
export function PortraitActionsRow({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-center justify-center gap-1 flex-wrap mb-5 animate-fade-up"
      style={{ animationDelay: '60ms' }}
    >
      {children}
    </div>
  );
}
