export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import { canAccessUsers } from '@/lib/permissions';
import {
  fetchOnTimeStatsByEmail,
  fetchTeamMonthlyOnTime,
  type OnTimeStatsByEmail,
} from '@/lib/clickhousePerfBatch';
import { PAGE_BUDGET_MS, withTimeout } from '@/lib/perfCache';
import { computeScore, nineBoxLevelFromString } from '@/lib/perfScore';
import { gradingPlanStatus } from '@/lib/gradingPlan';
import { isGradable, isGradingExempt } from '@/lib/employment';
import { ensureNonGradingBuilds } from '@/lib/oneTimeMigrations';
import { canViewCompensation } from '@/lib/compPermissions';
import { canViewDismissalDate, canViewDismissalStatus } from '@/lib/dismissal';
import { buildCompensation, plannedRaiseState } from '@/lib/compensation';
import { fetchHrCompensationBatch, fetchHrLogsByEmail } from '@/lib/hrSalary';
import { todayMoscowIso } from '@/lib/dates';
import { avatarSrc } from '@/lib/avatar';
import { SEASONS, type Season } from '@/lib/assessmentSeason';
import type { BuildCode } from '@/lib/types';
import UsersClient from './UsersClient';

/**
 * Последний снапшот NIPC, записанный этим процессом: «дата|значения».
 * Пишем, только когда сменился день или цифры — а не на каждый рендер.
 */
let lastNipcSnapshotKey: string | null = null;

// Выборка людей — только поля, которые уходят в строки списка и расчёты.
// passwordHash и прочее из users не тянем.
const USER_ROW_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  buildId: true,
  build: { select: { id: true, code: true, name: true } },
  department: true,
  leadId: true,
  // Почты лида и стардиза — для приглашения на грейдирование («В календарь»
  // в поп-апе 360). Стардиз видит в списке только своих и себя: почту лида
  // своего подопечного иначе взять негде. Страница — только admin/lead/stardiz.
  lead: { select: { id: true, fullName: true, email: true } },
  stardizId: true,
  stardiz: { select: { id: true, fullName: true, email: true } },
  hiredAt: true,
  active: true,
  gradeFloor: true,
  gradeFloorReason: true,
  avatarUrl: true,
  employmentType: true,
  dismissedAt: true,
  dismissalType: true,
  dismissalReason: true,
  plannedRaiseSetAt: true,
  plannedRaiseAt: true,
  plannedRaiseSalary: true,
  plannedRaiseNote: true,
  plannedRaiseBaselineAt: true,
  nextGradingAt: true,
  nextGradingSetAt: true,
  nextGradingSetBy: { select: { id: true, fullName: true } },
} as const;

type HrLogs = Map<string, { hiredAt: string | null; log: { date: string; from: number; to: number }[] }>;
type HrBatch = Awaited<ReturnType<typeof fetchHrCompensationBatch>>;

/**
 * Внешние источники страницы (ClickHouse: «в срок», спарклайн, HR) —
 * параллельно, каждый не дольше PAGE_BUDGET_MS. Раньше шли по очереди, и
 * страница однажды ждала 22,6 с — запрос упёрся в 20-секундный таймаут
 * клиента. Не успевший запрос дорабатывает в фоне и кладёт результат в
 * кэш: следующий заход уже с цифрами. Упавший или не успевший источник
 * деградирует ровно как раньше: «в срок» пустой (composite опустится в
 * xpNorm), спарклайна нет, колонка «Зарплата» пустая, статус пересмотра —
 * как есть.
 */
async function loadExternal(
  usersRaw: Array<{
    id: number;
    email: string;
    role: string;
    active: boolean;
    leadId: number | null;
    plannedRaiseSetAt: Date | null;
  }>,
  me: { id: number; role: string },
): Promise<{
  onTimeByEmail: OnTimeStatsByEmail;
  onTimeSpark: number[];
  hrBatch: HrBatch | null;
  hrLogs: HrLogs;
}> {
  // Phase 16: батч-агрегат «% попадания в срок за 6 мес». Тянем сразу
  // для всех дизайнеров — один CH-запрос на «в срок» и спарклайн, потом
  // кэш 15 мин. Инхаус (creator) тоже отправляем — внутри запроса они
  // отфильтруются фильтрами «had estimate / completed / worked-hard» (т.к.
  // в трекерах их задач нет), а если что-то найдётся — это всё равно мусор:
  // для них perfScore не применяется (см. perfScore.ts).
  const designerEmails = usersRaw
    .filter((u) => (u.role === 'designer' || u.role === 'stardiz') && u.active && u.email)
    .map((u) => u.email);

  // Phase 23.4 — плановый пересмотр. Бейдж видят только те, кому можно
  // видеть деньги; выполненный (в HR уже есть повышение после постановки
  // статуса) не показываем. В HR ходим только за теми, у кого статус стоит.
  // Неактивных (с реестром из HR их под сотню, Phase 23.6a) в HR не
  // запрашиваем вовсе: ставки и пересмотра в их строке нет, последнюю
  // ставку поп-ап берёт сам из /compensation.
  const viewer = { id: me.id, role: me.role };
  const withPlan = usersRaw.filter(
    (u) => u.active && u.plannedRaiseSetAt && u.email && canViewCompensation(viewer, u),
  );
  // Админу — ещё и колонка «Зарплата»: один батч по всей странице, из него же
  // берём журналы для плановых пересмотров. Лиду — только журналы тех, у кого
  // стоит статус.
  const loadHr = async (): Promise<{ hrBatch: HrBatch | null; hrLogs: HrLogs }> => {
    if (me.role === 'admin') {
      const hrBatch = await fetchHrCompensationBatch(
        usersRaw.filter((u) => u.active && u.email).map((u) => u.email),
      );
      const hrLogs: HrLogs = new Map();
      for (const [em, c] of hrBatch) hrLogs.set(em, { hiredAt: c.hr?.hiredAt ?? null, log: c.log });
      return { hrBatch, hrLogs };
    }
    if (withPlan.length) {
      return { hrBatch: null, hrLogs: await fetchHrLogsByEmail(withPlan.map((u) => u.email)) };
    }
    return { hrBatch: null, hrLogs: new Map() };
  };

  const hasDesigners = designerEmails.length > 0;
  const [onTime, spark, hr] = await Promise.allSettled([
    hasDesigners
      ? withTimeout(fetchOnTimeStatsByEmail(designerEmails), PAGE_BUDGET_MS, 'fetchOnTimeStatsByEmail')
      : Promise.resolve<OnTimeStatsByEmail>(new Map()),
    // Спарклайн «в срок» по месяцам — для bento-карточки. Тот же SQL, что
    // и у «в срок»: оба вызова ждут один запрос (склейка в perfCache).
    hasDesigners
      ? withTimeout(fetchTeamMonthlyOnTime(designerEmails), PAGE_BUDGET_MS, 'fetchTeamMonthlyOnTime')
      : Promise.resolve<number[]>([]),
    withTimeout(loadHr(), PAGE_BUDGET_MS, 'HR data'),
  ]);

  if (onTime.status === 'rejected') {
    // Fall through: всем onTime = null, composite опустится в xpNorm.
    console.error('[/admin/users] fetchOnTimeStatsByEmail failed:', onTime.reason);
  }
  if (spark.status === 'rejected') {
    console.error('[/admin/users] fetchTeamMonthlyOnTime failed:', spark.reason);
  }
  if (hr.status === 'rejected') {
    // HR недоступен — колонка пустая, статус пересмотра показываем как есть
    console.error('[/admin/users] HR data failed:', hr.reason);
  }
  return {
    onTimeByEmail: onTime.status === 'fulfilled' ? onTime.value : new Map(),
    onTimeSpark: spark.status === 'fulfilled' ? spark.value : [],
    hrBatch: hr.status === 'fulfilled' ? hr.value.hrBatch : null,
    hrLogs: hr.status === 'fulfilled' ? hr.value.hrLogs : new Map(),
  };
}

/** Старт сезона оценок в году — полночь UTC, как даты снапшотов NIPC. */
function seasonStartUtc(season: Season, year: number): Date {
  const { month, day } = SEASONS[season].start;
  return new Date(Date.UTC(year, month - 1, day));
}

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

  // Все чтения БД друг от друга не зависят (кроме пары «матрица → веса /
  // грейды») — одним Promise.all вместо девяти последовательных шагов.
  // Внешние источники стартуют, как только известен список людей, и идут
  // параллельно с остальными чтениями. Promise.resolve — чтобы ленивый
  // PrismaPromise выполнился один раз, сколько бы .then на нём ни висело.
  const matrixP = Promise.resolve(
    prisma.matrixVersion.findFirst({ where: { isCurrent: true }, select: { id: true } }),
  );
  const usersP = Promise.resolve(
    prisma.user.findMany({
      where: userWhere,
      select: USER_ROW_SELECT,
      // active desc — активные сверху, деактивированные в конце.
      orderBy: [{ active: 'desc' }, { role: 'asc' }, { fullName: 'asc' }],
    }),
  );
  const externalP = usersP.then((list) => loadExternal(list, { id: me.id, role: me.role }));

  // «Сегодня» — по Москве: сервер в UTC, и с 00:00 до 03:00 МСК
  // toISOString() дал бы вчерашнюю дату.
  const todayIso = todayMoscowIso();
  // Phase 25: динамика NIPC «за цикл» — база цикла. Цикл начинается со
  // старта сезона оценок из SEASONS (1 апреля и 1 октября). Раньше старт
  // был 16.04/16.10 — после дедлайнов прежних сезонов; с 30.09.2026 сезоны
  // 1.04–1.05 и 1.10–1.11, оценки идут внутри сезона, и база «за цикл» —
  // состояние команды до них: перестановки 9-Box по итогам сезона попадают
  // в дельту. Даты снапшотов — полночь UTC московской даты.
  const todayDate = new Date(`${todayIso}T00:00:00Z`);
  const year = todayDate.getUTCFullYear();
  const spring = seasonStartUtc('spring', year);
  const autumn = seasonStartUtc('autumn', year);
  const cycleStart =
    todayDate >= autumn ? autumn : todayDate >= spring ? spring : seasonStartUtc('autumn', year - 1);
  // У стардиза NIPC частичный — дельту ему не считаем (см. ниже).
  const nipcBaselineP =
    me.role === 'stardiz'
      ? Promise.resolve(null)
      : Promise.resolve(
          prisma.nipcSnapshot.findFirst({
            where: { date: { gte: cycleStart } },
            orderBy: { date: 'asc' },
            select: { date: true, percent: true },
          }),
        ).catch((err: unknown) => {
          console.error('[/admin/users] nipc snapshot failed:', err);
          return null;
        });

  const [
    skillWeightsForMax,
    usersRaw,
    builds,
    leadsRaw,
    stardizesRaw,
    latestGrades,
    gradeLevels,
    draftRows,
    growthRows,
    selfAgg,
    matrixCells,
    nipcBaseline,
    { onTimeByEmail, onTimeSpark, hrBatch, hrLogs },
  ] = await Promise.all([
    // Phase 16: maxXp по билду — нужно для xpNorm в composite score.
    // Грузим SkillWeight + Skill, считаем sum(weight × maxMasteryLevel) по
    // активным навыкам, группируя по buildId. Одинаково для всех дизайнеров
    // одного билда — поэтому считаем тут один раз, в page.
    matrixP.then((matrix) =>
      matrix
        ? prisma.skillWeight.findMany({
            where: { matrixVersionId: matrix.id },
            select: {
              buildId: true,
              weight: true,
              skill: { select: { active: true, maxMasteryLevel: true } },
            },
          })
        : [],
    ),
    usersP,
    // Все билды, с «Коммуникациями» (без грейдов) — для выпадашки «Билд».
    // Layout заводит эту строку параллельно со страницей, поэтому ждём здесь:
    // в первом заходе после деплоя её не было бы в списке.
    ensureNonGradingBuilds().then(() => prisma.build.findMany({ orderBy: { sortOrder: 'asc' } })),
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
    matrixP.then((matrix) =>
      matrix
        ? prisma.gradeLevel.findMany({
            where: { matrixVersionId: matrix.id },
            select: { code: true, name: true, sortOrder: true, xpThresholds: true },
            orderBy: { sortOrder: 'asc' },
          })
        : [],
    ),
    // Черновики: по каждому дизайнеру свежайший updatedAt — для статус-чипов
    // в лидерборде и сигнала «черновики без движения».
    prisma.assessment.findMany({
      where: { status: 'draft' },
      select: { designerId: true, updatedAt: true },
    }),
    // Скорость роста: прирост totalXp между двумя последними published-оценками
    // каждого дизайнера. Медиана по команде — bento-ячейка + сравнение на портрете.
    prisma.$queryRaw<Array<{ designerId: number; totalXp: number | null; rn: bigint }>>`
      SELECT "designerId", "totalXp",
             ROW_NUMBER() OVER (PARTITION BY "designerId" ORDER BY "publishedAt" DESC) AS rn
      FROM assessments
      WHERE status = 'published' AND "totalXp" IS NOT NULL
    `,
    // Phase 14: последняя правка самооценки по каждому дизайнеру — для
    // флага «обновил после последней оценки» (сигнал лиду).
    prisma.selfAssessment.groupBy({
      by: ['designerId'],
      _max: { updatedAt: true },
    }),
    // Phase 16.2: позиция в 9-Box матрице потенциала. Используется как
    // третья компонента composite score (вес 20%).
    prisma.teamMatrixCell.findMany({
      select: { userId: true, potentialLevel: true, performanceLevel: true },
    }),
    nipcBaselineP,
    externalP,
  ]);

  const maxXpByBuildId = new Map<number, number>();
  for (const sw of skillWeightsForMax) {
    if (!sw.skill.active) continue;
    const cur = maxXpByBuildId.get(sw.buildId) ?? 0;
    maxXpByBuildId.set(sw.buildId, cur + sw.weight * sw.skill.maxMasteryLevel);
  }

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
  const draftUpdatedAt = new Map<number, Date>();
  for (const d of draftRows) {
    const prev = draftUpdatedAt.get(d.designerId);
    if (!prev || d.updatedAt > prev) draftUpdatedAt.set(d.designerId, d.updatedAt);
  }

  const lastTwo = new Map<number, { cur?: number; prev?: number }>();
  for (const r of growthRows) {
    const n = Number(r.rn);
    if (n > 2 || r.totalXp === null) continue;
    const slot = lastTwo.get(r.designerId) ?? {};
    if (n === 1) slot.cur = r.totalXp;
    else slot.prev = r.totalXp;
    lastTwo.set(r.designerId, slot);
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

  const selfMaxByDesigner = new Map(
    selfAgg.map((g) => [g.designerId, g._max.updatedAt]),
  );

  const cellByUserId = new Map(matrixCells.map((c) => [c.userId, c]));

  const viewer = me?.id ? { id: me.id, role: me.role } : null;
  // Стардиз видит в списке и себя, но его собственные позиция в 9-Box и
  // composite ему не показываются (свою позицию стардиз не видит и на
  // портрете): ни в строке, ни в счётчиках карты — там только подопечные.
  const isOwnHiddenTalent = (id: number) => me.role === 'stardiz' && id === me.id;
  // Увольнение: дату видят админ и лид, тип и причину — только админ.
  // Остальным поля не кладём вовсе — ни в данные страницы, ни в JSON.
  const seeDismissalDate = canViewDismissalDate(me);
  const seeDismissalStatus = canViewDismissalStatus(me);

  const nowMs = Date.now();
  const users = usersRaw.map((u) => {
    const last = gradeByDesignerId.get(u.id);
    const maxXp = u.buildId ? maxXpByBuildId.get(u.buildId) ?? 0 : 0;
    const perfStat = u.email ? onTimeByEmail.get(u.email.toLowerCase()) : undefined;
    const onTimePercent = perfStat?.onTimePercent ?? null;
    const onTimeTotalTasks = perfStat?.totalTasks ?? 0;

    // Неактивные — ушедшие (Phase 23.6a: реестр из HR, их под сотню).
    // Строка у них лёгкая: рейтинга, 9-Box, роста, сигналов и пересмотра
    // нет — эти поля пустые, как у человека без данных. Даты, грейд и XP
    // последней оценки остаются: их показывают серая строка и поп-ап, а
    // дату грейдирования модалка «Изменить» отправляет обратно как есть.
    const live = u.active;

    // Данные для пересчёта bento-агрегатов под скоуп «Мои» на клиенте.
    const hideTalent = isOwnHiddenTalent(u.id);
    const cellForScope = hideTalent || !live ? undefined : cellByUserId.get(u.id);
    const twoGrades = live ? lastTwo.get(u.id) : undefined;
    const growthDelta =
      twoGrades && twoGrades.cur !== undefined && twoGrades.prev !== undefined
        ? twoGrades.cur - twoGrades.prev
        : null;
    const draftAt = draftUpdatedAt.get(u.id);
    const draftAgeDays = draftAt && live
      ? Math.floor((nowMs - draftAt.getTime()) / 864e5)
      : null;

    // Composite score считаем только для дизайнеров (стардизы не
    // ранжируются в лидерборде). Если у дизайнера нет ни одной
    // опубликованной оценки (XP=null) — оставляем score=null,
    // чтобы UI показал «—» серым вместо 0.
    let compositeScore: number | null = null;
    // Стардизы ранжируются вместе с дизайнерами (Pavel 29.09.2026);
    // почасовщики — нет: их XP заморожен (Phase 23.4); билд без грейдов
    // («Коммуникации») — тоже нет (lib/employment).
    // Неактивные — тоже нет: места в рейтинге у ушедших не бывает.
    if (
      (u.role === 'designer' || u.role === 'stardiz') &&
      live &&
      last?.totalXp != null &&
      !isGradingExempt(u) &&
      !hideTalent
    ) {
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
      // Ссылка /api/avatar вместо data URL: ~17 КБ base64 на строку уходили
      // дважды (HTML + RSC) и без кэша.
      avatarUrl: avatarSrc(u),
      // Phase 23.2 — план грейдирования. Состояние («проведено», «просрочено»)
      // считаем в клиенте через lib/gradingPlan, чтобы оно не устаревало
      // между рендерами страницы.
      employmentType: u.employmentType,
      ...(seeDismissalDate && { dismissedAt: u.dismissedAt?.toISOString() ?? null }),
      ...(seeDismissalStatus && {
        dismissalType: u.dismissalType,
        dismissalReason: u.dismissalReason,
      }),
      // Текущая зарплата для колонки — только админу (Phase 23.4)
      salary: (() => {
        const c = hrBatch?.get(u.email.toLowerCase());
        if (!c) return undefined;
        const v = buildCompensation({
          hr: c.hr,
          log: c.log,
          bonuses: [],
          role: u.role,
          grade: last?.grade ?? null,
          employmentType: u.employmentType,
          activeInGrades: u.active,
          today: todayIso,
        });
        return v.state === 'ok' ? v.current : null;
      })(),
      plannedRaise: (() => {
        if (!live || !u.plannedRaiseSetAt || !canViewCompensation(viewer, u)) return null;
        const hr = hrLogs.get(u.email.toLowerCase());
        const state = plannedRaiseState(
          {
            setAt: u.plannedRaiseSetAt.toISOString(),
            baselineAt: u.plannedRaiseBaselineAt?.toISOString() ?? null,
          },
          hr?.log ?? [],
          hr?.hiredAt ?? null,
        );
        if (state === 'done') return null;
        return {
          at: u.plannedRaiseAt?.toISOString() ?? null,
          salary: u.plannedRaiseSalary,
          note: u.plannedRaiseNote,
        };
      })(),
      nextGradingAt: u.nextGradingAt?.toISOString() ?? null,
      nextGradingSetAt: u.nextGradingSetAt?.toISOString() ?? null,
      nextGradingSetBy: u.nextGradingSetBy
        ? { id: u.nextGradingSetBy.id, fullName: u.nextGradingSetBy.fullName }
        : null,
      effectiveGrade: last?.grade ?? null,
      lastAssessedAt: last?.publishedAt ?? null,
      totalXp: last?.totalXp ?? null,
      xpByTaxonomy: last?.xpByTaxonomy ?? null,
      maxXp,
      onTimePercent,
      onTimeTotalTasks,
      compositeScore,
      hasDraft: draftUpdatedAt.has(u.id),
      // Phase 14: самооценка обновлялась после последней published-оценки
      selfFresh: (() => {
        const m = live ? selfMaxByDesigner.get(u.id) : undefined;
        if (!m) return false;
        const pub = last?.publishedAt;
        return !pub || m.toISOString() > pub;
      })(),
      // Для скоуп-пересчёта bento «Мои»:
      nineBoxCell: cellForScope
        ? { potential: cellForScope.potentialLevel, performance: cellForScope.performanceLevel }
        : null,
      growthDelta,
      xpNeeded: live ? last?.xpNeeded ?? null : null,
      draftAgeDays,
    };
  });

  // === Агрегаты команды для bento + сигналов (концепт v4) ============
  // «В срок» считаем по всем активным дизайнерам, включая почасовщиков и
  // билд без грейдов; грейдирование и таланты — только по грейдируемым
  // (Phase 23.4, lib/employment).
  const activeDesigners = users.filter((u) => u.role === 'designer' && u.active);
  const talentDesigners = activeDesigners.filter((u) => !isGradingExempt(u));

  // 9-Box: счётчики по ячейкам + NIPC. Pavel: в Dream Team Index считаем
  // и дизайнеров, И СТАРДИЗОВ (как в самой матрице 9-Box, где размещаются
  // обе роли). Формула: (звёзды + выс.потенциал + выс.производительность −
  // обе зоны внимания − ошибка подбора) / все размещаемые (дизайнеры+стардизы).
  // У стардиза — без него самого: карта и NIPC только по подопечным.
  const nineBoxEligible = users.filter((u) => isGradable(u) && !isOwnHiddenTalent(u.id));
  const nineBoxIds = new Set(nineBoxEligible.map((u) => u.id));
  const nineBox: Record<string, number> = {};
  for (const c of matrixCells) {
    if (!nineBoxIds.has(c.userId)) continue;
    const key = `${c.potentialLevel}_${c.performanceLevel}`;
    nineBox[key] = (nineBox[key] ?? 0) + 1;
  }
  const nb = (k: string) => nineBox[k] ?? 0;
  const nipcNumerator =
    nb('high_high') + nb('high_mid') + nb('mid_high')
    - nb('mid_low') - nb('low_mid') - nb('low_low');
  const nipcPercent = nineBoxEligible.length
    ? Math.round((nipcNumerator / nineBoxEligible.length) * 100)
    : null;

  // Phase 25: динамика NIPC «за цикл». Пишем дневной снапшот (upsert по
  // дате) и сравниваем с самым ранним снапшотом текущего оценочного цикла
  // (база прочитана выше вместе с остальными данными, старт цикла — там же).
  // История копится с момента деплоя фазы; ошибки не блокируют страницу.
  // ВАЖНО: у стардиза выборка users серверно обрезана до его подопечных —
  // его NIPC частичный, снапшот команды им затирать нельзя.
  let nipcDelta: number | null = null;
  if (nipcPercent !== null && me.role !== 'stardiz') {
    const snapshot = {
      percent: nipcPercent,
      stars: nb('high_high'),
      hpot: nb('high_mid'),
      hperf: nb('mid_high'),
      risk: nb('mid_low') + nb('low_mid') + nb('low_low'),
      total: nineBoxEligible.length,
    };
    // Запись снапшота — фоном и только когда сменился день или цифры:
    // рендер её не ждёт, и на каждый заход в БД не пишем. Упала — сбросим
    // отметку, следующий рендер попробует снова.
    const snapshotKey = `${todayIso}|${JSON.stringify(snapshot)}`;
    if (lastNipcSnapshotKey !== snapshotKey) {
      lastNipcSnapshotKey = snapshotKey;
      prisma.nipcSnapshot
        .upsert({
          where: { date: todayDate },
          update: snapshot,
          create: { date: todayDate, ...snapshot },
        })
        .catch((err: unknown) => {
          if (lastNipcSnapshotKey === snapshotKey) lastNipcSnapshotKey = null;
          console.error('[/admin/users] nipc snapshot failed:', err);
        });
    }

    // Сегодняшний снапшот для дельты не нужен (база должна быть старше),
    // поэтому базу читаем, не дожидаясь записи.
    // Дельта осмысленна только когда база старше сегодняшнего снапшота
    if (nipcBaseline && nipcBaseline.date.getTime() < todayDate.getTime()) {
      nipcDelta = nipcPercent - nipcBaseline.percent;
    }
  }

  // Медиана «в срок» по дизайнерам с достаточной выборкой
  const onTimeValues = activeDesigners
    .filter((u) => u.onTimePercent !== null && (u.onTimeTotalTasks ?? 0) >= 5)
    .map((u) => u.onTimePercent as number);

  // Сезон: оценено / всего активных + черновики
  const gradedCount = talentDesigners.filter((u) => u.totalXp != null).length;
  const draftCount = talentDesigners.filter((u) => draftUpdatedAt.has(u.id)).length;

  // «Готовы к повышению»: xpNeeded ≤ 20 в последней published-оценке
  const readyRows = talentDesigners
    .map((u) => ({ u, last: gradeByDesignerId.get(u.id) }))
    .filter((r) => r.last?.xpNeeded != null && r.last.xpNeeded <= 20)
    .sort((a, b) => (a.last!.xpNeeded! - b.last!.xpNeeded!));

  // Рост — по активным грейдируемым, как и на клиенте для скоупа «Мои».
  const talentGrowth = talentDesigners
    .map((u) => u.growthDelta)
    .filter((x): x is number => x != null);

  const teamStats = {
    nipcPercent,
    nipcDelta,
    nipcTotal: nineBoxEligible.length,
    nipcStars: nb('high_high'),
    nipcHpot: nb('high_mid'),
    nipcHperf: nb('mid_high'),
    nipcRisk: nb('mid_low') + nb('low_mid') + nb('low_low'),
    nineBoxPlaced: Object.values(nineBox).reduce((s, n) => s + n, 0),
    onTimeMedian: median(onTimeValues),
    onTimeSample: onTimeValues.length,
    onTimeSpark,
    growthMedian: median(talentGrowth),
    growthSample: talentGrowth.length,
    readyCount: readyRows.length,
    gradedCount,
    draftCount,
    totalDesigners: talentDesigners.length,
  };

  // «Требует внимания»: черновики без движения, просевший «в срок»,
  // кандидаты на повышение. Считаем на сервере, отдаём готовый список.
  const now = Date.now();
  const attention: Array<{
    tone: 'danger' | 'warn' | 'info';
    title: string;
    detail: string;
  }> = [];
  const staleDrafts = talentDesigners
    .map((u) => ({ u, at: draftUpdatedAt.get(u.id) }))
    .filter((r) => r.at && now - r.at.getTime() > 7 * 864e5)
    .sort((a, b) => a.at!.getTime() - b.at!.getTime());
  if (staleDrafts.length > 0) {
    const days = Math.floor((now - staleDrafts[0].at!.getTime()) / 864e5);
    attention.push({
      tone: 'danger',
      title: `${staleDrafts.length} ${staleDrafts.length === 1 ? 'черновик' : staleDrafts.length < 5 ? 'черновика' : 'черновиков'} без публикации`,
      detail: `Старейший — ${staleDrafts[0].u.fullName.split(' ')[0]}, ${days} дн.`,
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
  // Phase 14: свежие самооценки — «загляни перед оценкой»
  const freshSelf = talentDesigners.filter((u) => u.selfFresh);
  if (freshSelf.length > 0) {
    const names = freshSelf.map((u) => u.fullName.split(' ')[0]);
    attention.push({
      tone: 'info',
      title: `${freshSelf.length} ${
        freshSelf.length === 1
          ? 'дизайнер обновил'
          : freshSelf.length < 5
            ? 'дизайнера обновили'
            : 'дизайнеров обновили'
      } самооценку`,
      detail: `${names.slice(0, 2).join(', ')}${
        names.length > 2 ? ` и ещё ${names.length - 2}` : ''
      } — после последней оценки`,
    });
  }
  // Phase 23.2: контроль грейдирования — просрочки и незапланированные.
  // Считаем по дизайнерам и стардизам: стардизы тоже грейдируются.
  const gradedRoles = users.filter(isGradable);
  const gradingStates = gradedRoles.map((u) => ({
    u,
    st: gradingPlanStatus(
      {
        nextGradingAt: u.nextGradingAt,
        nextGradingSetAt: u.nextGradingSetAt,
        lastPublishedAt: u.lastAssessedAt,
      },
      new Date(now),
    ),
  }));
  const overdue = gradingStates
    .filter((r) => r.st.state === 'overdue')
    .sort((a, b) => (a.st.daysLeft ?? 0) - (b.st.daysLeft ?? 0));
  if (overdue.length > 0) {
    const days = -(overdue[0].st.daysLeft ?? 0);
    attention.push({
      tone: 'danger',
      title: `Грейдирование просрочено — ${overdue.length} ${
        overdue.length === 1 ? 'человек' : overdue.length < 5 ? 'человека' : 'человек'
      }`,
      detail: `Дольше всех — ${overdue[0].u.fullName.split(' ')[0]}, ${days} дн.`,
    });
  }
  const unplanned = gradingStates.filter((r) => r.st.state === 'none');
  if (unplanned.length > 0) {
    const names = unplanned.map((r) => r.u.fullName.split(' ')[0]);
    attention.push({
      tone: 'warn',
      title: `Без даты грейдирования — ${unplanned.length}`,
      detail: `${names.slice(0, 3).join(', ')}${
        names.length > 3 ? ` и ещё ${names.length - 3}` : ''
      }`,
    });
  }

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
