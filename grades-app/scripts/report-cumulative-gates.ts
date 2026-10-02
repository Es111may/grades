/**
 * Phase 24 — накопительные гейты: кого затронет правка. ТОЛЬКО ЧТЕНИЕ.
 *
 * Для каждого активного дизайнера и стардиза с опубликованной оценкой
 * (последней — как в «Команде» и «Экономике») грейд считается дважды:
 * по старому правилу (гейты только выдаваемого грейда) и по новому
 * (гейты грейда и всех грейдов ниже, lib/grade → cumulativeGates).
 *
 * Входы — те же, что у портрета (lib/portrait): баллы опубликованной оценки
 * + текущие навыки, веса, пороги XP и гейты её версии матрицы для билда
 * человека + текущий gradeFloor. То есть «новое правило» — это ровно то,
 * что портрет покажет сразу после деплоя. «В БД» — Assessment.effectiveGrade,
 * записанный при публикации: его видят «Команда», поп-ап 360, «Экономика»,
 * история и список оценок (см. scripts/recalc-grades.ts).
 *
 * Запуск — вручную, на деплое не выполняется. Нужна DATABASE_URL (Postgres
 * Грейдов); прод-база доступна только изнутри Railway
 * (postgres.railway.internal снаружи не резолвится).
 *
 *   npx tsx scripts/report-cumulative-gates.ts
 *       Markdown: итоги и таблицы «понизится» / «защищены фиксацией» /
 *       «без изменений».
 *   npx tsx scripts/report-cumulative-gates.ts --json
 *       То же JSON-объектом { generatedAt, summary, rows }.
 *
 * В выводе — имена и грейды людей: в свой терминал, не в общие логи.
 * Никаких записей в БД скрипт не делает.
 */

import type { PrismaClient } from '@prisma/client';
import { prisma } from '../src/lib/db';
import {
  calcGrade,
  calcXp,
  failedGatesForGrade,
  type FailedGate,
  type GradeCalcInput,
  type GradeCalcResult,
  type GradeThreshold,
  type SkillSnapshot,
} from '../src/lib/grade';
import { BUILD_NAMES, GRADE_NAMES, GRADE_ORDER } from '../src/lib/types';
import type { BuildCode, GradeCode } from '../src/lib/types';

// ── Старое правило ──────────────────────────────────────────────────────

/**
 * Расчёт грейда ДО Phase 24 — копия прежнего calcGrade: гейты проверялись
 * только у выдаваемого грейда, гейты нижних не смотрелись. Нужен только
 * отчёту и пересчёту (что поменяет правка); в приложении не использовать.
 */
export function calcGradeLegacy(
  input: GradeCalcInput,
): Pick<GradeCalcResult, 'totalXp' | 'calculatedGrade' | 'effectiveGrade'> {
  const { skills, scores, grades, gradeFloor } = input;
  const sortedDesc = [...grades].sort((a, b) => GRADE_ORDER[b.code] - GRADE_ORDER[a.code]);
  const { total } = calcXp(skills, scores);
  const scoreMap = new Map<number, number>();
  for (const s of scores) scoreMap.set(s.skillId, s.masteryLevel);
  const active = new Set(skills.filter((s) => s.active).map((s) => s.skillId));

  let calculatedGrade: GradeCode = 'junior';
  for (const g of sortedDesc) {
    if (g.code === 'junior') continue;
    if (total < g.threshold) continue;
    const passed = g.gates
      .filter((gate) => active.has(gate.skillId))
      .every((gate) => (scoreMap.get(gate.skillId) ?? 0) >= gate.requiredMastery);
    if (!passed) continue;
    calculatedGrade = g.code;
    break;
  }
  const effectiveGrade =
    gradeFloor && GRADE_ORDER[gradeFloor] > GRADE_ORDER[calculatedGrade] ? gradeFloor : calculatedGrade;
  return { totalXp: total, calculatedGrade, effectiveGrade };
}

// ── Данные ──────────────────────────────────────────────────────────────

const isGradeCode = (s: string | null | undefined): s is GradeCode =>
  !!s && Object.prototype.hasOwnProperty.call(GRADE_ORDER, s);

/** Последняя опубликованная оценка человека + всё для расчёта грейда. */
export type LoadedAssessment = {
  userId: number;
  fullName: string;
  role: string;
  employmentType: string | null;
  buildCode: string | null;
  buildName: string | null;
  gradeFloor: GradeCode | null;
  assessmentId: number;
  cycle: string;
  publishedAt: string | null;
  stored: { totalXp: number | null; calculatedGrade: string | null; effectiveGrade: string | null };
  /** null — у человека нет билда, грейд не посчитать. */
  input: GradeCalcInput | null;
  /** id навыка → название, для гейтов в отчёте. */
  skillNames: Map<number, string>;
};

type MatrixContext = { skills: SkillSnapshot[]; grades: GradeThreshold[]; skillNames: Map<number, string> };

/**
 * Навыки, веса и гейты версии матрицы для билда — как в lib/portrait и при
 * публикации: только активные навыки, вес билда, порог XP билда.
 */
async function loadMatrixContext(
  db: PrismaClient,
  matrixVersionId: number,
  buildId: number,
  buildCode: string,
): Promise<MatrixContext> {
  const [skills, gradeLevels] = await Promise.all([
    db.skill.findMany({
      where: { matrixVersionId, active: true },
      select: {
        id: true,
        name: true,
        active: true,
        weights: { where: { buildId }, select: { weight: true } },
        group: { select: { taxonomy: { select: { code: true } } } },
      },
    }),
    db.gradeLevel.findMany({
      where: { matrixVersionId },
      select: {
        code: true,
        xpThresholds: true,
        gates: { where: { buildId }, select: { skillId: true, requiredMastery: true } },
      },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);
  const unknown = gradeLevels.filter((g) => !isGradeCode(g.code)).map((g) => g.code);
  if (unknown.length) {
    console.error(`⚠ Матрица ${matrixVersionId}: грейды с неизвестным кодом пропущены: ${unknown.join(', ')}`);
  }
  return {
    skills: skills.map((s) => ({
      skillId: s.id,
      taxonomyCode: s.group.taxonomy.code,
      weight: s.weights[0]?.weight ?? 0,
      active: s.active,
    })),
    grades: gradeLevels
      .filter((g) => isGradeCode(g.code))
      .map((g) => ({
        code: g.code as GradeCode,
        threshold: (g.xpThresholds as Record<string, number> | null)?.[buildCode] ?? 0,
        gates: g.gates.map((gate) => ({ skillId: gate.skillId, requiredMastery: gate.requiredMastery })),
      })),
    skillNames: new Map(skills.map((s) => [s.id, s.name])),
  };
}

/**
 * Активные дизайнеры и стардизы и их последняя опубликованная оценка — та,
 * чей effectiveGrade показывают «Команда» и «Экономика» (DISTINCT ON по
 * publishedAt DESC, effectiveGrade не пуст). userIds — сузить выборку.
 */
export async function loadLatestPublished(
  db: PrismaClient,
  opts: { userIds?: number[] } = {},
): Promise<LoadedAssessment[]> {
  const users = await db.user.findMany({
    where: {
      active: true,
      role: { in: ['designer', 'stardiz'] },
      ...(opts.userIds ? { id: { in: opts.userIds } } : {}),
    },
    select: {
      id: true,
      fullName: true,
      role: true,
      employmentType: true,
      buildId: true,
      gradeFloor: true,
      build: { select: { code: true, name: true } },
    },
    orderBy: { fullName: 'asc' },
  });
  if (!users.length) return [];

  const published = await db.assessment.findMany({
    where: {
      status: 'published',
      effectiveGrade: { not: null },
      designerId: { in: users.map((u) => u.id) },
    },
    orderBy: [{ designerId: 'asc' }, { publishedAt: 'desc' }],
    select: {
      id: true,
      designerId: true,
      matrixVersionId: true,
      cycle: true,
      publishedAt: true,
      totalXp: true,
      calculatedGrade: true,
      effectiveGrade: true,
    },
  });
  const latest = new Map<number, (typeof published)[number]>();
  for (const a of published) if (!latest.has(a.designerId)) latest.set(a.designerId, a);
  if (!latest.size) return [];

  const scoreRows = await db.assessmentScore.findMany({
    where: { assessmentId: { in: Array.from(latest.values()).map((a) => a.id) } },
    select: { assessmentId: true, skillId: true, masteryLevel: true },
  });
  const scoresByAssessment = new Map<number, { skillId: number; masteryLevel: number }[]>();
  for (const s of scoreRows) {
    const list = scoresByAssessment.get(s.assessmentId) ?? [];
    list.push({ skillId: s.skillId, masteryLevel: s.masteryLevel });
    scoresByAssessment.set(s.assessmentId, list);
  }

  const contexts = new Map<string, Promise<MatrixContext>>();
  const contextFor = (matrixVersionId: number, buildId: number, buildCode: string) => {
    const key = `${matrixVersionId}:${buildId}`;
    let ctx = contexts.get(key);
    if (!ctx) {
      ctx = loadMatrixContext(db, matrixVersionId, buildId, buildCode);
      contexts.set(key, ctx);
    }
    return ctx;
  };

  const out: LoadedAssessment[] = [];
  for (const u of users) {
    const a = latest.get(u.id);
    if (!a) continue;
    if (u.gradeFloor && !isGradeCode(u.gradeFloor)) {
      console.error(`⚠ ${u.fullName} (id ${u.id}): неизвестный gradeFloor «${u.gradeFloor}» — не учитываю`);
    }
    const gradeFloor = isGradeCode(u.gradeFloor) ? u.gradeFloor : null;
    const ctx = u.buildId && u.build ? await contextFor(a.matrixVersionId, u.buildId, u.build.code) : null;
    out.push({
      userId: u.id,
      fullName: u.fullName,
      role: u.role,
      employmentType: u.employmentType,
      buildCode: u.build?.code ?? null,
      buildName: u.build?.name ?? null,
      gradeFloor,
      assessmentId: a.id,
      cycle: a.cycle,
      publishedAt: a.publishedAt?.toISOString() ?? null,
      stored: { totalXp: a.totalXp, calculatedGrade: a.calculatedGrade, effectiveGrade: a.effectiveGrade },
      input: ctx
        ? {
            build: u.build!.code as BuildCode,
            skills: ctx.skills,
            scores: scoresByAssessment.get(a.id) ?? [],
            grades: ctx.grades,
            gradeFloor,
          }
        : null,
      skillNames: ctx?.skillNames ?? new Map(),
    });
  }
  return out;
}

// ── Анализ ──────────────────────────────────────────────────────────────

/**
 * affected — эффективный грейд понизится; floor — расчётный понизится, но
 * фиксация держит прежний эффективный; same — правка не меняет ничего;
 * no_build — без билда грейд не посчитать.
 */
export type Verdict = 'affected' | 'floor' | 'same' | 'no_build';

export type BlockingGate = FailedGate & { skillName: string };

export type ReportRow = {
  userId: number;
  fullName: string;
  role: string;
  buildCode: string | null;
  buildName: string | null;
  assessmentId: number;
  cycle: string;
  publishedAt: string | null;
  /** XP по текущим входам (как на портрете). */
  xp: number | null;
  stored: LoadedAssessment['stored'];
  old: { calculatedGrade: GradeCode; effectiveGrade: GradeCode } | null;
  next: { calculatedGrade: GradeCode; effectiveGrade: GradeCode } | null;
  gradeFloor: GradeCode | null;
  /**
   * Что не пускает в прежний расчётный грейд по новому правилу: непройденные
   * гейты его и нижних грейдов (свои прежний грейд проходил — значит, все
   * унаследованные).
   */
  blockingGates: BlockingGate[];
  verdict: Verdict;
  /** Грейд/XP в БД уже не совпадают со старым правилом на текущих входах. */
  drift: boolean;
};

export function analyze(a: LoadedAssessment): ReportRow {
  const base = {
    userId: a.userId,
    fullName: a.fullName,
    role: a.role,
    buildCode: a.buildCode,
    buildName: a.buildName,
    assessmentId: a.assessmentId,
    cycle: a.cycle,
    publishedAt: a.publishedAt,
    stored: a.stored,
    gradeFloor: a.gradeFloor,
  };
  if (!a.input) {
    return { ...base, xp: null, old: null, next: null, blockingGates: [], verdict: 'no_build', drift: false };
  }
  const old = calcGradeLegacy(a.input);
  const next = calcGrade(a.input);
  const lowered = GRADE_ORDER[next.calculatedGrade] < GRADE_ORDER[old.calculatedGrade];
  const blockingGates = lowered
    ? failedGatesForGrade(a.input, old.calculatedGrade).map((g) => ({
        ...g,
        skillName: a.skillNames.get(g.skillId) ?? `#${g.skillId}`,
      }))
    : [];
  const verdict: Verdict = !lowered ? 'same' : next.effectiveGrade === old.effectiveGrade ? 'floor' : 'affected';
  const drift =
    a.stored.effectiveGrade !== old.effectiveGrade ||
    a.stored.calculatedGrade !== old.calculatedGrade ||
    (a.stored.totalXp !== null && a.stored.totalXp !== old.totalXp);
  return {
    ...base,
    xp: next.totalXp,
    old: { calculatedGrade: old.calculatedGrade, effectiveGrade: old.effectiveGrade },
    next: { calculatedGrade: next.calculatedGrade, effectiveGrade: next.effectiveGrade },
    blockingGates,
    verdict,
    drift,
  };
}

export type Summary = { total: number; affected: number; floor: number; same: number; noBuild: number; drift: number };

export function summarize(rows: ReportRow[]): Summary {
  const count = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  return {
    total: rows.length,
    affected: count('affected'),
    floor: count('floor'),
    same: count('same'),
    noBuild: count('no_build'),
    drift: rows.filter((r) => r.drift).length,
  };
}

// ── Markdown ────────────────────────────────────────────────────────────

const MOSCOW_DATETIME = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const moscow = (iso: string) => `${MOSCOW_DATETIME.format(new Date(iso)).replace(',', '')} МСК`;

/** Ячейка таблицы: без переводов строк и с экранированной «|». */
const cell = (s: string) => s.replace(/\s+/g, ' ').replace(/\|/g, '\\|');

/** «Мидл» для кода; неизвестный код — как есть; пусто — «—». */
export function gradeLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return isGradeCode(code) ? GRADE_NAMES[code] : code;
}

function buildLabel(r: ReportRow): string {
  if (!r.buildCode) return '—';
  return BUILD_NAMES[r.buildCode as BuildCode] ?? r.buildName ?? r.buildCode;
}

/** «Мидл» или «Мидл (расчёт Джун)», если фиксация подняла эффективный. */
function gradePair(g: { calculatedGrade: string | null; effectiveGrade: string | null } | null): string {
  if (!g) return '—';
  const eff = gradeLabel(g.effectiveGrade);
  return g.calculatedGrade && g.calculatedGrade !== g.effectiveGrade
    ? `${eff} (расчёт ${gradeLabel(g.calculatedGrade)})`
    : eff;
}

export function formatBlocking(gates: BlockingGate[]): string {
  if (!gates.length) return '—';
  return gates
    .map((g) => `${g.skillName} (${gradeLabel(g.gradeCode)}): ${g.currentMastery} → ${g.requiredMastery}`)
    .join('; ');
}

function xpLabel(r: ReportRow): string {
  if (r.xp === null) return '—';
  const xp = String(Math.round(r.xp * 100) / 100);
  return r.stored.totalXp !== null && r.stored.totalXp !== r.xp ? `${xp} (в БД ${r.stored.totalXp})` : xp;
}

function table(rows: ReportRow[]): string[] {
  const out = [
    '| id | Имя | Билд | XP | В БД | Старое правило | Новое правило | Фиксация | Что не пускает |',
    '|---:|---|---|---:|---|---|---|---|---|',
  ];
  for (const r of rows) {
    out.push(
      `| ${r.userId} | ${cell(r.fullName)}${r.role === 'stardiz' ? ' (стардиз)' : ''} | ${cell(buildLabel(r))} | ` +
        `${xpLabel(r)} | ${cell(gradePair(r.stored))}${r.drift ? ' ⚠' : ''} | ${cell(gradePair(r.old))} | ` +
        `${cell(gradePair(r.next))} | ${gradeLabel(r.gradeFloor)} | ${cell(formatBlocking(r.blockingGates))} |`,
    );
  }
  return out;
}

export function formatMarkdown(rows: ReportRow[], generatedAt: string): string {
  const s = summarize(rows);
  const out: string[] = [
    '# Phase 24 — накопительные гейты: кого затронет',
    '',
    `Сформирован ${moscow(generatedAt)}. Людей с опубликованной оценкой: ${s.total} ` +
      '(активные дизайнеры и стардизы, последняя опубликованная оценка).',
    '',
    `- Грейд понизится: **${s.affected}**`,
    `- Расчётный понизится, но держит фиксация (gradeFloor): **${s.floor}**`,
    `- Без изменений: **${s.same}**`,
  ];
  if (s.noBuild) out.push(`- Без билда, грейд не посчитать: **${s.noBuild}**`);
  out.push(
    '',
    'Старое и новое правило считаются на текущих входах, как портрет: баллы оценки + ' +
      'текущие навыки, веса, пороги и гейты её версии матрицы + текущая фиксация. ' +
      '«Новое правило» — то, что портрет покажет сразу после деплоя. «В БД» — грейд, ' +
      'записанный при публикации: его видят «Команда», поп-ап 360, «Экономика» и история, ' +
      'пока оценку не пересчитают (scripts/recalc-grades.ts).',
  );
  if (s.drift) {
    out.push(
      '',
      `⚠ У ${s.drift} чел. грейд или XP в БД уже сейчас не совпадают со старым правилом на ` +
        'текущих входах — матрицу, гейты или фиксацию правили после публикации. Это не из-за ' +
        'Phase 24, но портрет и списки у них расходятся уже сегодня.',
    );
  }

  const sections: Array<[Verdict, string]> = [
    ['affected', 'Грейд понизится'],
    ['floor', 'Защищены фиксацией'],
    ['same', 'Без изменений'],
    ['no_build', 'Без билда'],
  ];
  for (const [verdict, title] of sections) {
    const list = rows.filter((r) => r.verdict === verdict);
    if (!list.length) continue;
    out.push('', `## ${title} (${list.length})`, '', ...table(list));
  }
  return out.join('\n') + '\n';
}

// ── Аргументы и точка входа ─────────────────────────────────────────────

export function parseArgs(argv: string[]): { json: boolean } {
  const unknown = argv.filter((a) => a !== '--json');
  if (unknown.length) throw new Error(`Неизвестные аргументы: ${unknown.join(' ')}. Есть: --json`);
  return { json: argv.includes('--json') };
}

/** JSON-вид строки: Map и прочее — в простые значения. */
export function toJson(rows: ReportRow[], generatedAt: string) {
  return { generatedAt, summary: summarize(rows), rows };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const loaded = await loadLatestPublished(prisma);
  const rows = loaded.map(analyze);
  const generatedAt = new Date().toISOString();
  process.stdout.write(
    args.json ? `${JSON.stringify(toJson(rows, generatedAt), null, 2)}\n` : formatMarkdown(rows, generatedAt),
  );
}

// Только при запуске скриптом (tsx — CommonJS): тест импортирует чистые
// функции, и там require/module может не быть
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  main()
    .catch((e) => {
      console.error(`\nОшибка: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
