/**
 * Метрики команды для портрета (редизайн, концепт v6):
 *  - подпись позиции 9-Box (видна только admin/lead);
 *  - медиана прироста XP за цикл по команде (сравнение роста, admin/lead/stardiz).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { NON_GRADING_BUILD_CODES } from '@/lib/employment';

/** Названия ячеек — синхронизированы с сеткой MatrixView. */
export const NINE_BOX_TITLE: Record<string, string> = {
  high_high: 'Звёзды',
  high_mid: 'Высокий потенциал',
  high_low: 'Проблемные гении',
  mid_high: 'Высокая производительность',
  mid_mid: 'Основа команды',
  mid_low: 'Зона особого внимания',
  low_high: 'Рабочие лошадки',
  low_mid: 'Зона особого внимания',
  low_low: 'Ошибка подбора',
};

/** Позиция дизайнера в 9-Box (null если не размещён). */
export async function getNineBoxTitle(userId: number): Promise<string | null> {
  const cell = await prisma.teamMatrixCell.findFirst({
    where: { userId },
    select: { potentialLevel: true, performanceLevel: true },
  });
  if (!cell) return null;
  return NINE_BOX_TITLE[`${cell.potentialLevel}_${cell.performanceLevel}`] ?? null;
}

/**
 * Медиана прироста totalXp между двумя последними published-оценками
 * по активным штатным дизайнерам. Тот же расчёт и та же выборка, что в
 * bento «Скорость роста» на /admin/users (talentDesigners): раньше сюда
 * попадали и ушедшие, а с реестром из HR (Phase 23.6a) их под сотню.
 * Билд без грейдов («Коммуникации») — вне выборки, как почасовщики.
 */
export async function getTeamGrowthMedian(): Promise<number | null> {
  const rows = await prisma.$queryRaw<
    Array<{ designerId: number; totalXp: number | null; rn: bigint }>
  >`
    SELECT a."designerId", a."totalXp",
           ROW_NUMBER() OVER (PARTITION BY a."designerId" ORDER BY a."publishedAt" DESC) AS rn
    FROM assessments a
    JOIN users u ON u.id = a."designerId"
    LEFT JOIN builds b ON b.id = u."buildId"
    WHERE a.status = 'published' AND a."totalXp" IS NOT NULL
      AND u.active AND u.role = 'designer' AND u."employmentType" <> 'hourly'
      AND (b.code IS NULL OR b.code NOT IN (${Prisma.join(Array.from(NON_GRADING_BUILD_CODES))}))
  `;
  const lastTwo = new Map<number, { cur?: number; prev?: number }>();
  for (const r of rows) {
    const n = Number(r.rn);
    if (n > 2 || r.totalXp === null) continue;
    const slot = lastTwo.get(r.designerId) ?? {};
    if (n === 1) slot.cur = r.totalXp;
    else slot.prev = r.totalXp;
    lastTwo.set(r.designerId, slot);
  }
  const deltas: number[] = [];
  for (const s of lastTwo.values()) {
    if (s.cur !== undefined && s.prev !== undefined) deltas.push(s.cur - s.prev);
  }
  if (!deltas.length) return null;
  const a = deltas.sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}
