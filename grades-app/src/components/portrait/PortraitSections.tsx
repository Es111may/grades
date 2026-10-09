'use client';

import dynamic from 'next/dynamic';
import ProjectsField from '@/components/ProjectsField';
import type { SectionNavItem } from '@/components/SectionNav';
import { PerformanceSkeleton } from '@/components/skeletons/portrait';

/**
 * Разделы портрета, общие для портрета с оценкой и без неё: «Проекты» и
 * «Перформанс», и их пункты в плавающей навигации (SectionNav).
 */

// Дашборд перформанса — лениво, вне First Load (chart.js). На сервере он
// рисует лишь загрузку (данные тянет после mount), поэтому ssr: false ничего
// не теряет: на его месте заглушка той же высоты.
const PerformanceDashboard = dynamic(
  () => import('@/components/performance/PerformanceDashboard'),
  { ssr: false, loading: PerformanceSkeleton },
);

/**
 * Показывать ли «Перформанс» (дашборд и якорь). showPerformance считает
 * страница по роли владельца (designer/stardiz). Pavel: у ребят из билда
 * Инхаус (`creator`) нет данных в трекерах — дашборд всегда был бы пустым.
 */
export function performanceVisible(showPerformance: boolean, buildCode: string | null): boolean {
  return showPerformance && buildCode !== 'creator';
}

/**
 * Первые пункты навигации: Статистика → Проекты → Перформанс. Проекты —
 * сразу после статистики (Pavel: «в навигации после Статистика»), якорь —
 * только если есть что показать или можно редактировать. Перформанс —
 * второй «человеческий» блок, ещё до разбора по навыкам.
 */
export function portraitBaseSections({
  showProjects,
  showPerformance,
}: {
  showProjects: boolean;
  showPerformance: boolean;
}): SectionNavItem[] {
  return [
    { id: 'stats', label: 'Статистика' },
    ...(showProjects ? [{ id: 'projects', label: 'Проекты' }] : []),
    ...(showPerformance ? [{ id: 'performance', label: 'Перформанс' }] : []),
  ];
}

/** «Проекты» (справочник М:N) и «Перформанс» — данные из ClickHouse. */
export function PortraitWorkSections({
  userId,
  initialProjects,
  canEditProjects,
  showPerformance,
}: {
  userId: number;
  initialProjects: { id: number; name: string; category: string }[];
  canEditProjects: boolean;
  /** Уже с учётом билда — performanceVisible. */
  showPerformance: boolean;
}) {
  return (
    <>
      <section id="projects" className="scroll-mt-24">
        <ProjectsField userId={userId} initialProjects={initialProjects} canEdit={canEditProjects} />
      </section>

      {/* Перформанс (collab + manage tracker) подтягивается на клиенте:
          тянуть запрос на сервере нет смысла — он тяжёлый и держал бы рендер
          всего портрета. */}
      {showPerformance && (
        <section id="performance" className="scroll-mt-24">
          <PerformanceDashboard userId={userId} />
        </section>
      )}
    </>
  );
}
