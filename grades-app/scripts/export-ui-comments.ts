/**
 * Комментарии к интерфейсу (lib/uiComments) — выгрузка для разбора правок в
 * следующей сессии и отметка «решено», когда правки внесены.
 *
 * Запуск — вручную, на деплое не выполняется (в scripts/start.ts его нет).
 * Нужна переменная DATABASE_URL (Postgres Грейдов).
 *
 *   npx tsx scripts/export-ui-comments.ts
 *       Открытые треды Markdown'ом по страницам: id, автор, дата (МСК),
 *       версия приложения, место (точка/рамка, селектор, фрагмент текста,
 *       координаты), текст и ответы.
 *   npx tsx scripts/export-ui-comments.ts --status=all|open|resolved
 *       Какие треды выгрузить. По умолчанию open.
 *   npx tsx scripts/export-ui-comments.ts --json
 *       То же JSON-массивом UiCommentDto — как отдаёт GET /api/ui-comments.
 *   npx tsx scripts/export-ui-comments.ts --resolve=12,15 [--actor=<email>]
 *       Отметить треды решёнными. Кто закрыл — активный админ или лид с этим
 *       email; по умолчанию первый активный админ. Ответы, несуществующие и
 *       уже решённые id пропускаются с пометкой в отчёте. Выгрузку не печатает.
 *
 * В выгрузке — имена авторов и тексты комментариев: в свой терминал или в
 * файл для сессии, не в общие логи.
 */

import type { PrismaClient } from '@prisma/client';
import { prisma } from '../src/lib/db';
import {
  UI_COMMENT_THREAD_SELECT,
  toCommentDto,
  type UiCommentAnchor,
  type UiCommentDto,
  type UiCommentStatus,
} from '../src/lib/uiComments';

// ── Аргументы ────────────────────────────────────────────────────────────

export type ExportStatus = UiCommentStatus | 'all';

export type ExportArgs =
  | { mode: 'export'; status: ExportStatus; json: boolean }
  | { mode: 'resolve'; ids: number[]; actor: string | null };

const VALUE_FLAGS = ['--status=', '--resolve=', '--actor='] as const;

export function parseArgs(argv: string[]): ExportArgs {
  const value = (flag: string) => {
    const a = argv.find((x) => x.startsWith(flag));
    return a === undefined ? undefined : a.slice(flag.length).trim();
  };
  const unknown = argv.filter((a) => a !== '--json' && !VALUE_FLAGS.some((f) => a.startsWith(f)));
  if (unknown.length) {
    throw new Error(
      `Неизвестные аргументы: ${unknown.join(' ')}. Есть: --status=all|open|resolved --json ` +
        '--resolve=<id,…> --actor=<email>',
    );
  }

  const resolve = value('--resolve=');
  const actor = value('--actor=');
  const status = value('--status=');
  const json = argv.includes('--json');

  if (resolve !== undefined) {
    if (status !== undefined || json) throw new Error('--resolve не сочетается с --status и --json');
    const parts = resolve.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) throw new Error('--resolve — без id');
    const bad = parts.filter((s) => !/^[1-9]\d*$/.test(s));
    if (bad.length) throw new Error(`--resolve — id числами через запятую; не id: ${bad.join(', ')}`);
    if (actor === '') throw new Error('--actor — без email');
    return { mode: 'resolve', ids: Array.from(new Set(parts.map(Number))), actor: actor ?? null };
  }

  if (actor !== undefined) throw new Error('--actor нужен только вместе с --resolve');
  if (status !== undefined && status !== 'all' && status !== 'open' && status !== 'resolved') {
    throw new Error('--status — all, open или resolved');
  }
  return { mode: 'export', status: (status as ExportStatus | undefined) ?? 'open', json };
}

// ── Markdown ─────────────────────────────────────────────────────────────

const MOSCOW_DATETIME = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** «01.10.2026 14:03 МСК» */
export function formatMoscowDateTime(iso: string): string {
  return `${MOSCOW_DATETIME.format(new Date(iso)).replace(',', '')} МСК`;
}

const round = (n: number) => Math.round(n);
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Код в обратных кавычках; если кавычка есть внутри — двойные с пробелами. */
const code = (s: string) => (s.includes('`') ? `\`\` ${s} \`\`` : `\`${s}\``);

/** Одна строка про место: что, где в элементе и где на странице. */
export function anchorSummary(anchor: UiCommentAnchor | null): string {
  if (!anchor) return 'место не сохранилось';
  const rect = anchor.kind === 'rect';
  const parts: string[] = [rect ? 'рамка' : 'точка'];
  // Где внутри страницы — «Поп-ап: Саша Тимкина»; чей поп-ап — ещё и в пути
  if (anchor.context?.label) parts.push(anchor.context.label);
  if (anchor.selector) parts.push(code(anchor.selector));
  if (anchor.snippet) parts.push(`«${anchor.snippet.replace(/\s+/g, ' ')}»`);
  if (anchor.rel) {
    const r = anchor.rel;
    const sizePart = rect && r.w !== undefined && r.h !== undefined ? `, ${pct(r.w)}×${pct(r.h)}` : '';
    parts.push(`в элементе ${pct(r.x)}, ${pct(r.y)}${sizePart}`);
  }
  const a = anchor.abs;
  const absSize = rect && a.w !== undefined && a.h !== undefined ? `, ${round(a.w)}×${round(a.h)}` : '';
  parts.push(`на странице ${round(a.x)}, ${round(a.y)}${absSize} px`);
  parts.push(`окно ${anchor.viewportW} px`);
  return parts.join(' · ');
}

/** Текст цитатой: каждая строка с «> », пустые строки внутри не рвут цитату. */
const quote = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => (l.trim() ? `> ${l}` : '>'))
    .join('\n');

const STATUS_HEADING: Record<ExportStatus, string> = {
  open: 'открытые',
  resolved: 'решённые',
  all: 'все',
};

/** Треды → Markdown по страницам (пути по алфавиту, треды — по времени). */
export function formatMarkdown(threads: UiCommentDto[], status: ExportStatus): string {
  const byPath = new Map<string, UiCommentDto[]>();
  for (const t of threads) {
    const list = byPath.get(t.path) ?? [];
    list.push(t);
    byPath.set(t.path, list);
  }
  const paths = Array.from(byPath.keys()).sort();

  const out: string[] = [
    `# Комментарии к интерфейсу — ${STATUS_HEADING[status]}: ${threads.length} (страниц: ${paths.length})`,
  ];
  if (!threads.length) {
    out.push('', 'Комментариев нет.');
    return out.join('\n') + '\n';
  }

  for (const path of paths) {
    out.push('', `## ${code(path)}`);
    const list = byPath.get(path)!.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
    for (const t of list) {
      const state =
        t.status === 'resolved'
          ? `решён${t.resolvedBy ? ` · ${t.resolvedBy.fullName}` : ''}${t.resolvedAt ? `, ${formatMoscowDateTime(t.resolvedAt)}` : ''}`
          : 'открыт';
      out.push(
        '',
        `### #${t.id} · ${state}`,
        '',
        `- Автор: ${t.author.fullName} · ${formatMoscowDateTime(t.createdAt)} · ${t.appVersion ? `v${t.appVersion}` : 'версия неизвестна'}`,
        `- Место: ${anchorSummary(t.anchor)}`,
        '',
        quote(t.text),
      );
      if (t.replies.length) {
        out.push('', `Ответы (${t.replies.length}):`, '');
        for (const r of t.replies) {
          // Многострочный ответ — продолжение пункта списка с отступом
          const [first, ...rest] = r.text.split(/\r?\n/);
          out.push(`- #${r.id} ${r.author.fullName}, ${formatMoscowDateTime(r.createdAt)}: ${first}`);
          for (const line of rest) out.push(line.trim() ? `  ${line}` : '');
        }
      }
    }
  }
  return out.join('\n') + '\n';
}

// ── Отметка «решено» ─────────────────────────────────────────────────────

export type ResolveRow = { id: number; parentId: number | null; status: string };

export type ResolvePlan = {
  resolve: number[];
  notFound: number[];
  replies: number[];
  alreadyResolved: number[];
};

/** Что из запрошенных id можно закрыть: только открытые корни тредов. */
export function planResolve(ids: number[], rows: ResolveRow[]): ResolvePlan {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const plan: ResolvePlan = { resolve: [], notFound: [], replies: [], alreadyResolved: [] };
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) plan.notFound.push(id);
    else if (row.parentId !== null) plan.replies.push(id);
    else if (row.status === 'resolved') plan.alreadyResolved.push(id);
    else plan.resolve.push(id);
  }
  return plan;
}

export function formatResolveReport(plan: ResolvePlan, resolvedCount: number): string {
  const list = (ids: number[]) => ids.map((id) => `#${id}`).join(', ');
  const total = resolvedCount < plan.resolve.length ? ` из ${plan.resolve.length}` : '';
  const lines = [`Отмечено решёнными: ${resolvedCount}${total}${plan.resolve.length ? ` (${list(plan.resolve)})` : ''}`];
  if (resolvedCount < plan.resolve.length) {
    lines.push(`Не отмечено ${plan.resolve.length - resolvedCount}: успели закрыть или удалить, пока шёл скрипт`);
  }
  if (plan.alreadyResolved.length) lines.push(`Уже решены: ${list(plan.alreadyResolved)}`);
  if (plan.replies.length) lines.push(`Это ответы, а не треды — статус есть только у треда: ${list(plan.replies)}`);
  if (plan.notFound.length) lines.push(`Не найдены: ${list(plan.notFound)}`);
  return lines.join('\n');
}

/**
 * Закрыть открытые треды из плана от имени actorId. updatedAt не трогаем —
 * он про правку текста (как в PATCH /api/ui-comments/[id]). Условие
 * status: 'open' в каждой записи — тред мог закрыться между выборкой и записью.
 */
export async function applyResolve(
  plan: ResolvePlan,
  rows: Array<ResolveRow & { updatedAt: Date }>,
  actorId: number,
  db: PrismaClient = prisma,
  now: Date = new Date(),
): Promise<number> {
  if (!plan.resolve.length) return 0;
  const updatedAt = new Map(rows.map((r) => [r.id, r.updatedAt]));
  const results = await db.$transaction(
    plan.resolve.map((id) =>
      db.uiComment.updateMany({
        where: { id, parentId: null, status: 'open' },
        data: { status: 'resolved', resolvedById: actorId, resolvedAt: now, updatedAt: updatedAt.get(id) },
      }),
    ),
  );
  return results.reduce((sum, r) => sum + r.count, 0);
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

  if (args.mode === 'resolve') {
    const actor = await resolveActor(args.actor);
    const rows = await prisma.uiComment.findMany({
      where: { id: { in: args.ids } },
      select: { id: true, parentId: true, status: true, updatedAt: true },
    });
    const plan = planResolve(args.ids, rows);
    const count = await applyResolve(plan, rows, actor.id);
    console.log(`${formatResolveReport(plan, count)}\nКто закрыл: ${actor.fullName} (id ${actor.id})`);
    return;
  }

  const rows = await prisma.uiComment.findMany({
    where: { parentId: null, ...(args.status !== 'all' ? { status: args.status } : {}) },
    select: UI_COMMENT_THREAD_SELECT,
    orderBy: [{ path: 'asc' }, { createdAt: 'asc' }],
  });
  const threads = rows.map(toCommentDto);
  process.stdout.write(args.json ? `${JSON.stringify(threads, null, 2)}\n` : formatMarkdown(threads, args.status));
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
