export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import { canAccessUsers } from '@/lib/permissions';
import { fetchOnTimeStatsByEmail } from '@/lib/clickhousePerfBatch';
import { computeScore } from '@/lib/perfScore';
import type { BuildCode } from '@/lib/types';
import UsersClient from './UsersClient';

export default async function AdminUsersPage() {
  const me = await getCurrentUser();
  if (!me || !canAccessUsers(me.role)) redirect('/auth/signin');

  // Серверный фильтр: stardiz видит только своих подопечных (по stardizId
  // или leadId, если он же формальный лид). Admin/lead видят всех; фильтр
  // «Все/Мои» накладывается на клиенте.
  const userWhere =
    me.role === 'stardiz'
      ? {
          OR: [
            { stardizId: me.id },
            { leadId: me.id },
            { id: me.id }, // самого себя тоже видим в списке
          ],
        }
      : {};

  const matrix = await prisma.matrixVersion.findFirst({ where: { isCurrent: true } });

  // Phase 16: maxXp по билду — нужно для xpNorm в composite score.
  // Грузим SkillWeight + Skill, считаем sum(weight × maxMasteryLevel) по
  // активным навыкам, группируя по buildId. Одинаково для всех дизайнеров
  // одного билда — поэтому считаем тут один раз, в page.
  const skillWeightsForMax = matrix
    ? await prisma.skillWeight.findMany({
        where: { matrixVersionId: matrix.id },
        include: { skill: { select: { active: true, maxMasteryLevel: true } } },
      })
    : [];
  const maxXpByBuildId = new Map<number, number>();
  for (const sw of skillWeightsForMax) {
    if (!sw.skill.active) continue;
    const cur = maxXpByBuildId.get(sw.buildId) ?? 0;
    maxXpByBuildId.set(sw.buildId, cur + sw.weight * sw.skill.maxMasteryLevel);
  }

  const [usersRaw, builds, leadsRaw, stardizesRaw, latestGrades, gradeLevels] =
    await Promise.all([
      prisma.user.findMany({
        where: userWhere,
        include: {
          build: true,
          lead: { select: { id: true, fullName: true } },
          stardiz: { select: { id: true, fullName: true } },
        },
        // active desc — активные сверху, деактивированные в конце.
        orderBy: [{ active: 'desc' }, { role: 'asc' }, { fullName: 'asc' }],
      }),
      prisma.build.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.user.findMany({
        where: { role: { in: ['lead', 'admin'] }, active: true },
        select: { id: true, fullName: true },
        orderBy: { fullName: 'asc' },
      }),
      prisma.user.findMany({
        where: { role: { in: ['stardiz', 'lead', 'admin'] }, active: true },
        select: { id: true, fullName: true },
        orderBy: { fullName: 'asc' },
      }),
      // Последний published-ассессмент: грейд, дата, totalXp и xpByTaxonomy
      // (последнее достаём из jsonb snapshot.result.xpByTaxonomy).
      prisma.$queryRaw<
        Array<{
          designerId: number;
          effectiveGrade: string | null;
          publishedAt: Date | null;
          totalXp: number | null;
          xpByTaxonomy: Record<string, number> | null;
        }>
      >`
        SELECT DISTINCT ON ("designerId")
          "designerId",
          "effectiveGrade",
          "publishedAt",
          "totalXp",
          snapshot->'result'->'xpByTaxonomy' AS "xpByTaxonomy"
        FROM assessments
        WHERE status = 'published' AND "effectiveGrade" IS NOT NULL
        ORDER BY "designerId", "publishedAt" DESC
      `,
      matrix
        ? prisma.gradeLevel.findMany({
            where: { matrixVersionId: matrix.id },
            orderBy: { sortOrder: 'asc' },
          })
        : Promise.resolve([]),
    ]);

  const gradeByDesignerId = new Map<
    number,
    {
      grade: string;
      publishedAt: string | null;
      totalXp: number | null;
      xpByTaxonomy: Record<string, number> | null;
    }
  >();
  for (const a of latestGrades) {
    if (a.effectiveGrade) {
      gradeByDesignerId.set(a.designerId, {
        grade: a.effectiveGrade,
        publishedAt: a.publishedAt?.toISOString() ?? null,
        totalXp: a.totalXp,
        xpByTaxonomy: a.xpByTaxonomy,
      });
    }
  }

  // Сериализуем grade-levels для клиента: code → { build: threshold }.
  const gradeThresholds = gradeLevels.map((g) => ({
    code: g.code,
    name: g.name,
    sortOrder: g.sortOrder,
    xpThresholds: g.xpThresholds as Record<string, number>,
  }));

  // Phase 16: батч-агрегат «% попадания в срок за 6 мес». Тянем сразу
  // для всех дизайнеров — один CH-запрос, потом кэш 15 мин.
  // Инхаус (creator) тоже отправляем — внутри запроса они отфильтруются
  // фильтрами «had estimate / completed / worked-hard» (т.к. в трекерах
  // их задач нет), а если что-то найдётся — это всё равно мусор: для них
  // perfScore не применяется (см. perfScore.ts).
  const designerEmails = usersRaw
    .filter((u) => (u.role === 'designer' || u.role === 'stardiz') && u.active && u.email)
    .map((u) => u.email);
  let onTimeByEmail = new Map<string, { onTimePercent: number | null; totalTasks: number }>();
  if (designerEmails.length > 0) {
    try {
      onTimeByEmail = await fetchOnTimeStatsByEmail(designerEmails);
    } catch (err) {
      console.error('[/admin/users] fetchOnTimeStatsByEmail failed:', err);
      // Fall through: всем onTime = null, composite опустится в xpNorm.
    }
  }

  const users = usersRaw.map((u) => {
    const last = gradeByDesignerId.get(u.id);
    const maxXp = u.buildId ? maxXpByBuildId.get(u.buildId) ?? 0 : 0;
    const perfStat = u.email ? onTimeByEmail.get(u.email.toLowerCase()) : undefined;
    const onTimePercent = perfStat?.onTimePercent ?? null;
    const onTimeTotalTasks = perfStat?.totalTasks ?? 0;

    // Composite score считаем только для дизайнеров (стардизы не
    // ранжируются в лидерборде). Передаём buildCode в формулу — она сама
    // отключит perf-компонент для creator/без данных/малой выборки.
    let compositeScore: number | null = null;
    if (u.role === 'designer') {
      const r = computeScore({
        xp: last?.totalXp ?? null,
        maxXp,
        buildCode: (u.build?.code as BuildCode) ?? null,
        onTimePercent,
        totalTasks: onTimeTotalTasks,
      });
      compositeScore = r.score;
    }

    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      buildId: u.buildId,
      build: u.build ? { id: u.build.id, code: u.build.code, name: u.build.name } : null,
      department: u.department,
      leadId: u.leadId,
      lead: u.lead,
      stardizId: u.stardizId,
      stardiz: u.stardiz,
      hiredAt: u.hiredAt?.toISOString() ?? null,
      active: u.active,
      gradeFloor: u.gradeFloor,
      gradeFloorReason: u.gradeFloorReason,
      avatarUrl: u.avatarUrl,
      effectiveGrade: last?.grade ?? null,
      lastAssessedAt: last?.publishedAt ?? null,
      totalXp: last?.totalXp ?? null,
      xpByTaxonomy: last?.xpByTaxonomy ?? null,
      maxXp,
      onTimePercent,
      onTimeTotalTasks,
      compositeScore,
    };
  });

  return (
    <UsersClient
      initialUsers={users}
      builds={builds}
      leads={leadsRaw}
      stardizes={stardizesRaw}
      gradeThresholds={gradeThresholds}
      meId={me.id ?? null}
      meRole={me.role ?? ''}
    />
  );
}
