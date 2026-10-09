'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import SectionNav from '@/components/SectionNav';
import Tooltip from '@/components/Tooltip';
import {
  HERO_STATUS_CHIP,
  PortraitActionsRow,
  PortraitHero,
  PortraitMain,
  type PortraitPerson,
} from '@/components/portrait/PortraitHero';
import {
  BentoBar,
  BentoCard,
  BentoNumber,
  NineBoxCell,
  OnTimeCell,
  SalaryCell,
} from '@/components/portrait/PortraitBento';
import {
  PortraitWorkSections,
  performanceVisible,
  portraitBaseSections,
} from '@/components/portrait/PortraitSections';
import type { PendingPortraitView } from '@/lib/portraitPending';

/**
 * Портрет без опубликованной оценки (Pavel, 09.10.2026): то же оформление,
 * что у портрета с оценкой (Portrait), — hero, ряд действий, bento, «Проекты»
 * и «Перформанс». Нет блоков, которым нужна оценка: циклов, радара, разбора
 * по таксономиям и навыкам, гейтов, «Выводов» и ИПР. Вместо грейда — чип
 * «Без оценки» (или закреплённый грейд), вместо XP — пустая ячейка;
 * оценивающему — кнопка «Провести оценку».
 *
 * Тексты и кнопку считает сервер (lib/portraitPending), здесь — разметка.
 */

// Ячеек bento здесь 1–3 (по правам и данным), а не 4: делят ряд поровну —
// края совпадают с «Проектами» и «Перформансом» ниже, дыр в сетке нет,
// и при скрытых зарплатах ряд сам смыкается. 240px — порог переноса в
// столбик на узком экране.
const CELL = 'grow basis-[240px] min-w-0';

const FLOOR_HINT =
  'Грейд закреплён при переходе с прежней системы. Если оценка по новой матрице даст ниже — останется этот.';

export default function PortraitPending({
  person,
  view,
  userId,
  canViewSalary = false,
  nineBoxTitle = null,
  initialProjects,
  canEditProjects = false,
  showPerformance = true,
  onTimePercent = null,
  onTimeTotalTasks = 0,
}: {
  person: PortraitPerson;
  view: PendingPortraitView;
  /** Id владельца портрета — проекты, перформанс, зарплата. */
  userId: number;
  /** Админ и лид этого человека — ячейка «Зарплата» (как у Portrait). */
  canViewSalary?: boolean;
  /** Позиция 9-Box — сервер передаёт только admin/lead. */
  nineBoxTitle?: string | null;
  initialProjects: { id: number; name: string; category: string }[];
  /** Сам владелец или admin. */
  canEditProjects?: boolean;
  /** Роль владельца — designer/stardiz (билд учитывает performanceVisible). */
  showPerformance?: boolean;
  onTimePercent?: number | null;
  onTimeTotalTasks?: number;
}) {
  const showPerformanceForBuild = performanceVisible(showPerformance, person.buildCode);
  // 9-Box — только у грейдируемых: почасовщика и билд без грейдов не
  // размечают
  const nineBox = view.gradable ? nineBoxTitle : null;

  const navSections = useMemo(
    () =>
      portraitBaseSections({
        showProjects: canEditProjects || initialProjects.length > 0,
        showPerformance: showPerformanceForBuild,
      }),
    [canEditProjects, initialProjects.length, showPerformanceForBuild],
  );

  const status = <span className={HERO_STATUS_CHIP}>{view.status.label}</span>;

  return (
    <PortraitMain>
      <PortraitHero
        person={person}
        status={
          view.status.floor ? (
            <Tooltip text={FLOOR_HINT} align="center">
              {status}
            </Tooltip>
          ) : (
            status
          )
        }
        nineBoxTitle={nineBox}
      />

      <section id="stats" className="scroll-mt-24">
        {/* Главное действие — лайм (btn-accent): на этом экране оно одно */}
        {view.action && (
          <PortraitActionsRow>
            <Link href={view.action.href} className="btn-accent">
              {view.action.label}
            </Link>
          </PortraitActionsRow>
        )}

        <div
          className="flex flex-wrap gap-3 mb-6 animate-fade-up"
          style={{ animationDelay: '80ms' }}
        >
          {/* XP ещё нет: «—», когда появится или почему не будет */}
          <BentoCard label="Общий XP" className={CELL}>
            <BentoNumber className="text-ash">—</BentoNumber>
            <div className="text-xs text-stone mt-2">{view.xp.text}</div>
            {view.xp.note && <div className="text-[11px] text-ash mt-1">{view.xp.note}</div>}
            {view.xp.track && <BentoBar percent={0} fillClassName="bg-emerald" />}
          </BentoCard>

          <OnTimeCell
            show={showPerformanceForBuild}
            percent={onTimePercent}
            totalTasks={onTimeTotalTasks}
            buildCode={person.buildCode}
            className={CELL}
          />

          {/* Деньги — как у портрета с оценкой. «Скорость роста» без оценок
              пуста — её нет, как и гейтов. */}
          {canViewSalary ? (
            <SalaryCell
              userId={userId}
              nineBoxTitle={nineBox}
              withNineBox={view.gradable}
              className={CELL}
            />
          ) : (
            nineBox && <NineBoxCell title={nineBox} className={CELL} />
          )}
        </div>
      </section>

      <PortraitWorkSections
        userId={userId}
        initialProjects={initialProjects}
        canEditProjects={canEditProjects}
        showPerformance={showPerformanceForBuild}
      />

      <SectionNav sections={navSections} />
    </PortraitMain>
  );
}
