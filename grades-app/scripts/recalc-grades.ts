/**
 * Пересчёт сохранённого грейда опубликованных оценок (Phase 24).
 *
 * Грейд в «Команде», поп-апе 360, «Экономике», истории и списке оценок —
 * это Assessment.effectiveGrade, записанный при публикации. Портрет считает
 * грейд заново при каждом открытии. После правки накопительных гейтов
 * портрет сразу покажет новый грейд, а списки — старый, пока оценку не
 * пересчитают. Этот скрипт пересчитывает.
 *
 * По умолчанию — СУХОЙ ПРОГОН: печатает, что поменяется, и ничего не пишет.
 * Входы — те же, что у портрета и отчёта (scripts/report-cumulative-gates.ts).
 * Трогает только последнюю опубликованную оценку человека (её грейд и
 * показывают списки) и только если новое правило меняет её грейд.
 *
 * Запуск — вручную, на деплое не выполняется. Нужна DATABASE_URL (прод —
 * только изнутри Railway).
 *
 *   npx tsx scripts/recalc-grades.ts
 *       Сухой прогон: кто и как поменяется.
 *   npx tsx scripts/recalc-grades.ts --users=12,15
 *       Только эти люди (id пользователей).
 *   npx tsx scripts/recalc-grades.ts --include-drift
 *       Плюс те, у кого грейд или XP в БД уже разошлись с портретом по другим
 *       причинам (правили матрицу/гейты/фиксацию после публикации).
 *   npx tsx scripts/recalc-grades.ts --apply [--actor=<email>]
 *       Записать. Для каждой оценки: totalXp, calculatedGrade,
 *       effectiveGrade и snapshot (новый расчёт; прежние значения и прежний
 *       snapshot — в snapshot.recalculated.previous, откатить можно по ним).
 *       Запись условная: если оценку успели переопубликовать или удалить,
 *       пока шёл скрипт, она пропускается. В аудит — «Грейд пересчитан» от
 *       имени активного админа (или лида/админа с --actor).
 *
 * Статус, дата публикации и баллы не меняются.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../src/lib/db';
import { calcGrade, type GradeCalcResult } from '../src/lib/grade';
import { AUDIT_ACTIONS, writeAudit } from '../src/lib/audit';
import {
  analyze,
  calcGradeLegacy,
  formatBlocking,
  gradeLabel,
  loadLatestPublished,
  type LoadedAssessment,
} from './report-cumulative-gates';

export const RECALC_REASON = 'phase24-cumulative-gates';

// ── Аргументы ────────────────────────────────────────────────────────────

export type RecalcArgs = {
  apply: boolean;
  includeDrift: boolean;
  userIds: number[] | null;
  actor: string | null;
};

export function parseArgs(argv: string[]): RecalcArgs {
  const value = (flag: string) => {
    const a = argv.find((x) => x.startsWith(flag));
    return a === undefined ? undefined : a.slice(flag.length).trim();
  };
  const known = (a: string) =>
    a === '--apply' || a === '--include-drift' || a.startsWith('--users=') || a.startsWith('--actor=');
  const unknown = argv.filter((a) => !known(a));
  if (unknown.length) {
    throw new Error(
      `Неизвестные аргументы: ${unknown.join(' ')}. Есть: --apply --include-drift --users=<id,…> --actor=<email>`,
    );
  }
  const apply = argv.includes('--apply');
  const users = value('--users=');
  const actor = value('--actor=');
  let userIds: number[] | null = null;
  if (users !== undefined) {
    const parts = users.split(',').map((s) => s.trim()).filter(Boolean);
    const bad = parts.filter((s) => !/^[1-9]\d*$/.test(s));
    if (!parts.length || bad.length) throw new Error('--users — id пользователей числами через запятую');
    userIds = Array.from(new Set(parts.map(Number)));
  }
  if (actor !== undefined && !apply) throw new Error('--actor нужен только вместе с --apply');
  if (actor === '') throw new Error('--actor — без email');
  return { apply, includeDrift: argv.includes('--include-drift'), userIds, actor: actor ?? null };
}

// ── План ─────────────────────────────────────────────────────────────────

export type RecalcItem = {
  userId: number;
  fullName: string;
  assessmentId: number;
  /** Что сейчас в БД — запись условная, по этим значениям. */
  before: { totalXp: number | null; calculatedGrade: string | null; effectiveGrade: string | null };
  /** Новый расчёт по текущим входам (как портрет). */
  result: GradeCalcResult;
  /** Почему в плане: правка гейтов меняет грейд или только расхождение. */
  reason: 'phase24' | 'drift';
  blocking: string;
};

/**
 * Кого пересчитать. phase24 — новое правило даёт не тот грейд, что старое;
 * drift — правило ни при чём, но БД разошлась с портретом (только с
 * --include-drift). Если в БД уже записан новый расчёт — пропускаем:
 * повторный запуск ничего не делает.
 */
export function planRecalc(loaded: LoadedAssessment[], includeDrift: boolean): RecalcItem[] {
  const plan: RecalcItem[] = [];
  for (const a of loaded) {
    if (!a.input) continue;
    const result = calcGrade(a.input);
    const legacy = calcGradeLegacy(a.input);
    const differsFromStored =
      a.stored.calculatedGrade !== result.calculatedGrade ||
      a.stored.effectiveGrade !== result.effectiveGrade ||
      a.stored.totalXp !== result.totalXp;
    if (!differsFromStored) continue;
    const ruleChanges =
      legacy.calculatedGrade !== result.calculatedGrade || legacy.effectiveGrade !== result.effectiveGrade;
    if (!ruleChanges && !includeDrift) continue;
    plan.push({
      userId: a.userId,
      fullName: a.fullName,
      assessmentId: a.assessmentId,
      before: a.stored,
      result,
      reason: ruleChanges ? 'phase24' : 'drift',
      blocking: formatBlocking(analyze(a).blockingGates),
    });
  }
  return plan;
}

export function formatPlan(plan: RecalcItem[], apply: boolean): string {
  const head = apply ? 'Пересчёт грейдов' : 'Пересчёт грейдов — СУХОЙ ПРОГОН, в БД ничего не пишется';
  if (!plan.length) return `${head}\n\nПересчитывать нечего.\n`;
  const lines = [head, '', `Оценок к пересчёту: ${plan.length}`, ''];
  for (const p of plan) {
    const xp =
      p.before.totalXp !== p.result.totalXp ? ` · XP ${p.before.totalXp ?? '—'} → ${p.result.totalXp}` : '';
    const calc =
      p.result.calculatedGrade !== p.result.effectiveGrade
        ? ` (расчёт ${gradeLabel(p.result.calculatedGrade)}, держит фиксация)`
        : '';
    lines.push(
      `- ${p.fullName} (id ${p.userId}, оценка #${p.assessmentId}, ${p.reason === 'phase24' ? 'гейты' : 'расхождение'}): ` +
        `${gradeLabel(p.before.effectiveGrade)} → ${gradeLabel(p.result.effectiveGrade)}${calc}${xp}` +
        (p.blocking !== '—' ? ` · не пускает: ${p.blocking}` : ''),
    );
  }
  if (!apply) lines.push('', 'Записать: --apply');
  return lines.join('\n') + '\n';
}

// ── Запись ───────────────────────────────────────────────────────────────

/**
 * Записать одну оценку. Условие — статус и грейд/XP те же, что при чтении:
 * если оценку переопубликовали, удалили или уже пересчитали, count = 0.
 */
export async function applyItem(
  db: PrismaClient,
  item: RecalcItem,
  previousSnapshot: unknown,
  snapshotInputs: { skills: unknown; scores: unknown; grades: unknown },
  now: Date,
): Promise<boolean> {
  const snapshot = {
    ...snapshotInputs,
    result: item.result,
    recalculated: {
      at: now.toISOString(),
      reason: item.reason === 'phase24' ? RECALC_REASON : 'sync-with-portrait',
      previous: { ...item.before, snapshot: previousSnapshot ?? null },
    },
  };
  const res = await db.assessment.updateMany({
    where: {
      id: item.assessmentId,
      status: 'published',
      calculatedGrade: item.before.calculatedGrade,
      effectiveGrade: item.before.effectiveGrade,
      totalXp: item.before.totalXp,
    },
    data: {
      totalXp: item.result.totalXp,
      calculatedGrade: item.result.calculatedGrade,
      effectiveGrade: item.result.effectiveGrade,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  });
  return res.count === 1;
}

async function resolveActor(email: string | null): Promise<{ id: number; fullName: string }> {
  const actor = await prisma.user.findFirst({
    where: email
      ? { active: true, role: { in: ['admin', 'lead'] }, email: { equals: email, mode: 'insensitive' } }
      : { active: true, role: 'admin' },
    orderBy: { id: 'asc' },
    select: { id: true, fullName: true },
  });
  if (!actor) {
    throw new Error(email ? 'Активный админ или лид с этим email не найден (--actor)' : 'В Грейдах нет активного админа');
  }
  return actor;
}

// ── Точка входа ─────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const loaded = await loadLatestPublished(prisma, args.userIds ? { userIds: args.userIds } : {});
  const plan = planRecalc(loaded, args.includeDrift);
  process.stdout.write(formatPlan(plan, args.apply));
  if (!args.apply || !plan.length) return;

  const actor = await resolveActor(args.actor);
  const byAssessment = new Map(loaded.map((a) => [a.assessmentId, a]));
  const previous = await prisma.assessment.findMany({
    where: { id: { in: plan.map((p) => p.assessmentId) } },
    select: { id: true, snapshot: true },
  });
  const previousById = new Map(previous.map((p) => [p.id, p.snapshot]));
  const now = new Date();
  let done = 0;
  const skipped: number[] = [];
  for (const item of plan) {
    const input = byAssessment.get(item.assessmentId)!.input!;
    const ok = await applyItem(
      prisma,
      item,
      previousById.get(item.assessmentId),
      { skills: input.skills, scores: input.scores, grades: input.grades },
      now,
    );
    if (!ok) {
      skipped.push(item.assessmentId);
      continue;
    }
    done++;
    await writeAudit({
      actorId: actor.id,
      action: AUDIT_ACTIONS.ASSESSMENT_RECALCULATED,
      targetType: 'assessment',
      targetId: item.assessmentId,
      extra: { designerId: item.userId },
      before: item.before,
      after: {
        totalXp: item.result.totalXp,
        calculatedGrade: item.result.calculatedGrade,
        effectiveGrade: item.result.effectiveGrade,
      },
      reason: item.reason === 'phase24' ? RECALC_REASON : 'sync-with-portrait',
    });
  }
  console.log(`\nЗаписано: ${done} из ${plan.length}. Кто: ${actor.fullName} (id ${actor.id})`);
  if (skipped.length) {
    console.log(
      `Пропущено (оценку изменили, пока шёл скрипт): ${skipped.map((id) => `#${id}`).join(', ')} — запустите ещё раз`,
    );
  }
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  main()
    .catch((e) => {
      console.error(`\nОшибка: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
