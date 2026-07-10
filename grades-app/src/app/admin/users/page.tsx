export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import { canAccessUsers } from '@/lib/permissions';
import { fetchOnTimeStatsByEmail } from '@/lib/clickhousePerfBatch';
import { computeScore, nineBoxLevelFromString } from '@/lib/perfScore';
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
          xpNeeded: number | null;
          nextGradeCode: string | null;
        }>
      >`
        SELECT DISTINCT ON ("designerId")
          "designerId",
          "effectiveGrade",
          "publishedAt",
          "totalXp",
          snapshot->'result'->'xpByTaxonomy' AS "xpByTaxonomy",
          NULLIF(snapshot->'result'->'nextGrade'->>'xpNeeded', '')::int AS "xpNeeded",
          snapshot->'result'->'nextGrade'->>'code' AS "nextGradeCode"
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
      xpNeeded: number | null;
      nextGradeCode: string | null;
    }
  >();
  for (const a of latestGrades) {
    if (a.effectiveGrade) {
      gradeByDesignerId.set(a.designerId, {
        grade: a.effectiveGrade,
        publishedAt: a.publishedAt?.toISOString() ?? null,
        totalXp: a.totalXp,
        xpByTaxonomy: a.xpByTaxonomy,
        xpNeeded: a.xpNeeded,
        nextGradeCode: a.nextGradeCode,
      });
    }
  }

  // === Данные для редизайна «Команды» (концепт v4) ============
  // Черновики: по каждому дизайнеру свежайший updatedAt — для статус-чипов
  // в лидерборде и сигнала «черновики без движения».
  const draftRows = await prisma.assessment.findMany({
    where: { status: 'draft' },
    select: { designerId: true, updatedAt: true },
  });
  const draftUpdatedAt = new Map<number, Date>();
  for (const d of draftRows) {
    const prev = draftUpdatedAt.get(d.designerId);
    if (!prev || d.updatedAt > prev) draftUpdatedAt.set(d.designerId, d.updatedAt);
  }

  // Скорость роста: прирост totalXp между двумя последними published-оценками
  // каждого дизайнера. Медиана по команде — bento-ячейка + сравнение на портрете.
  const growthRows = await prisma.$queryRaw<
    Array<{ designerId: number; totalXp: number | null; rn: bigint }>
  >`
    SELECT "designerId", "totalXp",
           ROW_NUMBER() OVER (PARTITION BY "designerId" ORDER BY "publishedAt" DESC) AS rn
    FROM assessments
    WHERE status = 'published' AND "totalXp" IS NOT NULL
  `;
  const lastTwo = new Map<number, { cur?: number; prev?: number }>();
  for (const r of growthRows) {
    const n = Number(r.rn);
    if (n > 2 || r.totalXp === null) continue;
    const slot = lastTwo.get(r.designerId) ?? {};
    if (n === 1) slot.cur = r.totalXp;
    else slot.prev = r.totalXp;
    lastTwo.set(r.designerId, slot);
  }
  const growthDeltas: number[] = [];
  for (const s of lastTwo.values()) {
    if (s.cur !== undefined && s.prev !== undefined) growthDeltas.push(s.cur - s.prev);
  }
  const median = (xs: number[]): number | null => {
    if (!xs.length) return null;
    const a = [...xs].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
  };

  // Сериализуем grade-levels для клиента: code → { build: threshold }.
  const gradeThresholds = gradeLevels.map((g) => ({
    code: g.code,
    name: g.name,
    sortOrder: g.sortOrder,
    xpThresholds: g.xpThresholds as Record<string, number>,
  }));

  // Phase 16.2: позиция в 9-Box матрице потенциала. Используется как
  // третья компонента composite score (вес 20%).
  const matrixCells = await prisma.teamMatrixCell.findMany({
    select: { userId: true, potentialLevel: true, performanceLevel: true },
  });
  const cellByUserId = new Map(matrixCells.map((c) => [c.userId, c]));

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
    // ранжируются в лидерборде). Если у дизайнера нет ни одной
    // опубликованной оценки (XP=null) — оставляем score=null,
    // чтобы UI показал «—» серым вместо 0.
    let compositeScore: number | null = null;
    if (u.role === 'designer' && last?.totalXp != null) {
      const cell = cellByUserId.get(u.id);
      const nineBoxPerf = nineBoxLevelFromString(cell?.performanceLevel);
      const nineBoxPot = nineBoxLevelFromString(cell?.potentialLevel);
      const r = computeScore({
        xp: last.totalXp,
        maxXp,
        buildCode: (u.build?.code as BuildCode) ?? null,
        onTimePercent,
        totalTasks: onTimeTotalTasks,
        nineBox:
          nineBoxPerf && nineBoxPot
            ? { performance: nineBoxPerf, potential: nineBoxPot }
            : null,
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
      hasDraft: draftUpdatedAt.has(u.id),
    };
  });

  // === Агрегаты команды для bento + сигналов (концепт v4) ============
  const activeDesigners = users.filter((u) => u.role === 'designer' && u.active);
  const activeIds = new Set(activeDesigners.map((u) => u.id));

  // 9-Box: счётчики по ячейкам (только активные дизайнеры) + NIPC по формуле
  // Pavel: (звёзды + выс.потенциал + выс.производительность − обе зоны
  // внимания − ошибка подбора) / все активные дизайнеры.
  const nineBox: Record<string, number> = {};
  for (const c of matrixCells) {
    if (!activeIds.has(c.userId)) continue;
    const key = `${c.potentialLevel}_${c.performanceLevel}`;
    nineBox[key] = (nineBox[key] ?? 0) + 1;
  }
  const nb = (k: string) => nineBox[k] ?? 0;
  const nipcNumerator =
    nb('high_high') + nb('high_mid') + nb('mid_high')
    - nb('mid_low') - nb('low_mid') - nb('low_low');
  const nipcPercent = activeDesigners.length
    ? Math.round((nipcNumerator / activeDesigners.length) * 100)
    : null;

  // Медиана «в срок» по дизайнерам с достаточной выборкой
  const onTimeValues = activeDesigners
    .filter((u) => u.onTimePercent !== null && (u.onTimeTotalTasks ?? 0) >= 5)
    .map((u) => u.onTimePercent as number);

  // Сезон: оценено / всего активных + черновики
  const gradedCount = activeDesigners.filter((u) => u.totalXp != null).length;
  const draftCount = activeDesigners.filter((u) => draftUpdatedAt.has(u.id)).length;

  // «Готовы к повышению»: xpNeeded ≤ 20 в последней published-оценке
  const readyRows = activeDesigners
    .map((u) => ({ u, last: gradeByDesignerId.get(u.id) }))
    .filter((r) => r.last?.xpNeeded != null && r.last.xpNeeded <= 20)
    .sort((a, b) => (a.last!.xpNeeded! - b.last!.xpNeeded!));

  const teamStats = {
    nipcPercent,
    nineBoxPlaced: Object.values(nineBox).reduce((s, n) => s + n, 0),
    onTimeMedian: median(onTimeValues),
    onTimeSample: onTimeValues.length,
    growthMedian: median(growthDeltas),
    growthSample: growthDeltas.length,
    readyCount: readyRows.length,
    gradedCount,
    draftCount,
    totalDesigners: activeDesigners.length,
  };

  // «Требует внимания»: черновики без движения, просевший «в срок»,
  // кандидаты на повышение. Считаем на сервере, отдаём готовый список.
  const now = Date.now();
  const attention: Array<{
    tone: 'danger' | 'warn' | 'info';
    title: string;
    detail: string;
  }> = [];
  const staleDrafts = activeDesigners
    .map((u) => ({ u, at: draftUpdatedAt.get(u.id) }))
    .filter((r) => r.at && now - r.at.getTime() > 7 * 864e5)
    .sort((a, b) => a.at!.getTime() - b.at!.getTime());
  if (staleDrafts.length > 0) {
    const days = Math.floor((now - staleDrafts[0].at!.getTime()) / 864e5);
    attention.push({
      tone: 'danger',
      title: `${staleDrafts.length} ${staleDrafts.length === 1 ? 'черновик' : staleDrafts.length < 5 ? 'черновика' : 'черновиков'} без публикации`,
      detail: `старейший — ${staleDrafts[0].u.fullName.split(' ')[0]}, ${days} дн.`,
    });
  }
  activeDesigners
    .filter((u) => u.onTimePercent !== null && (u.onTimeTotalTasks ?? 0) >= 5 && u.onTimePercent! < 70)
    .sort((a, b) => (a.onTimePercent! - b.onTimePercent!))
    .slice(0, 2)
    .forEach((u) => {
      attention.push({
        tone: 'warn',
        title: `${u.fullName}: «в срок» ${Math.round(u.onTimePercent!)}%`,
        detail: `${u.onTimeTotalTasks} задач · 6 мес`,
      });
    });
  readyRows.slice(0, 2).forEach(({ u, last }) => {
    attention.push({
      tone: 'info',
      title: `${u.fullName} — близко к повышению`,
      detail: `+${last!.xpNeeded} XP до порога`,
    });
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
      teamStats={teamStats}
      nineBox={nineBox}
      attention={attention.slice(0, 5)}
    />
  );
}
