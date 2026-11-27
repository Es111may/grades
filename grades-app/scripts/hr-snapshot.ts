/**
 * Слепок HR-портала через ida.hub (0.83.0). Пока сервер Грейдов не видит
 * ClickHouse напрямую, ставки, «Экономика» и сверка состава берут данные
 * из последнего слепка в Postgres (lib/hrDataset). Запросы к хабу делает
 * человек (или Claude с его доступом) через dwh_ask, ответы — JSON-файлами
 * в одну папку. Скрипт готовит SQL и проверяет ответы. Подробный ранбук —
 * HANDOFF.md, «Обновить HR через ida.hub».
 *
 * Шаг 1. npx tsx scripts/hr-snapshot.ts --checksums --out=<dir>
 *     Читает почты пользователей Грейдов из БД (DATABASE_URL) и пишет
 *     <dir>/checksums.plan.json — по SQL контрольной суммы на таблицу
 *     набора: SELECT count() AS n, sum(CRC32(колонка)) … FROM (<data SQL>).
 *     Каждый SQL — в хаб, ответ как есть — в <dir>/checksums.<key>.json.
 * Шаг 2. npx tsx scripts/hr-snapshot.ts --plan --checksums=<dir> --out=<dir>
 *     Проверяет ответы шага 1 и по n пишет <dir>/pages.plan.json — страницы
 *     данных по 150 строк (LIMIT 150 OFFSET …), ровно сколько покрывает n.
 *     Каждую — в хаб, ответ как есть — в <dir>/<key>.<page>.json.
 * Шаг 3. npx tsx scripts/hr-snapshot.ts --import <dir>
 *     Проверка без записи и отчёт числами — без имён, почт и сумм.
 *     --apply           записать слепок (hr_snapshots; храним последние 5).
 *     --actor=<email>   кто загрузил (hr_snapshots.createdBy).
 *     --taken-at=YYYY-MM-DD
 *                       дата данных; по умолчанию — время последнего
 *                       ответа хаба в папке (mtime файлов).
 *
 * Импорт отвергает слепок целиком — с именем файла и причиной, — если
 * выполненный хабом SQL не тот, что в плане (допустимы пробелы по краям и
 * дописанный « LIMIT 200»), колонки не те или не в том порядке, страница
 * длиннее 150 строк, строк в сумме не n, строка повторилась на двух
 * страницах, count/sum(CRC32) по колонкам не сошлись с ответом хаба.
 *
 * Сервер подхватит новый слепок, когда выйдет кэш набора и выборок (по
 * 15 минут) — в пределах получаса, или сразу после рестарта.
 * Папку с ответами в git не класть: в ней почты и оклады.
 */

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../src/lib/db';
import { HR_REGISTRY_POSITION_IDS, HR_DESIGN_POSITION_IDS, normalizeEmail, normalizeHrDate } from '../src/lib/hrRegistry';
import { HR_DATASET_KEYS } from '../src/lib/hrDatasetQueries';
import {
  CHECKSUM_PLAN_FILE,
  HR_SNAPSHOTS_KEPT,
  HR_SNAPSHOT_SOURCE,
  PAGES_PLAN_FILE,
  HrSnapshotRejected,
  buildChecksumPlan,
  buildPagesPlan,
  importSnapshotAnswers,
  readChecksumAnswers,
  readChecksumPlan,
  snapshotData,
  type SnapshotImport,
} from '../src/lib/hrSnapshot';

// ── Аргументы ───────────────────────────────────────────────────────────

export type SnapshotArgs =
  | { mode: 'checksums'; out: string }
  | { mode: 'plan'; checksums: string; out: string }
  | { mode: 'import'; dir: string; apply: boolean; actor: string | null; takenAt: string | null };

const USAGE =
  'Шаги: --checksums --out=<dir> · --plan --checksums=<dir> --out=<dir> · ' +
  '--import <dir> [--apply] [--actor=<email>] [--taken-at=YYYY-MM-DD]';

export function parseSnapshotArgs(argv: string[]): SnapshotArgs {
  const value = (flag: string) => argv.find((a) => a.startsWith(flag))?.slice(flag.length).trim() || null;
  const importAt = argv.indexOf('--import');
  const importDir =
    value('--import=') ?? (importAt >= 0 && argv[importAt + 1] && !argv[importAt + 1].startsWith('--') ? argv[importAt + 1] : null);
  const modes = [argv.includes('--checksums'), argv.includes('--plan'), importAt >= 0 || !!value('--import=')];
  if (modes.filter(Boolean).length !== 1) throw new Error(`Нужен ровно один шаг. ${USAGE}`);

  const known = (a: string, i: number) =>
    ['--checksums', '--plan', '--import', '--apply'].includes(a) ||
    ['--out=', '--checksums=', '--import=', '--actor=', '--taken-at='].some((f) => a.startsWith(f)) ||
    (i === importAt + 1 && importAt >= 0 && a === importDir);
  const unknown = argv.filter((a, i) => !known(a, i));
  if (unknown.length) throw new Error(`Неизвестные аргументы: ${unknown.join(' ')}. ${USAGE}`);

  if (modes[0]) {
    const out = value('--out=');
    if (!out) throw new Error('--checksums: нужен --out=<dir>');
    return { mode: 'checksums', out };
  }
  if (modes[1]) {
    const checksums = value('--checksums=');
    const out = value('--out=');
    if (!checksums || !out) throw new Error('--plan: нужны --checksums=<dir> и --out=<dir>');
    return { mode: 'plan', checksums, out };
  }
  if (!importDir) throw new Error('--import: нужна папка с ответами хаба');
  const takenAt = value('--taken-at=');
  if (takenAt && !normalizeHrDate(takenAt)) throw new Error('--taken-at — дата в формате YYYY-MM-DD');
  return {
    mode: 'import',
    dir: importDir,
    apply: argv.includes('--apply'),
    actor: value('--actor=')?.toLowerCase() ?? null,
    takenAt: takenAt ? normalizeHrDate(takenAt) : null,
  };
}

// ── Файлы ───────────────────────────────────────────────────────────────

/** Все *.json папки: имя → разобранный JSON. Не JSON — отказ с именем файла. */
export function readAnswersDir(dir: string): Map<string, unknown> {
  const files = new Map<string, unknown>();
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    try {
      files.set(name, JSON.parse(readFileSync(join(dir, name), 'utf8')));
    } catch {
      throw new HrSnapshotRejected(name, 'не JSON — сохрани ответ хаба целиком, как есть');
    }
  }
  return files;
}

/** Дата данных по умолчанию: самый поздний ответ хаба в папке. */
export function takenAtFromFiles(dir: string, names: string[]): Date {
  const answers = names.filter((n) => n !== CHECKSUM_PLAN_FILE && n !== PAGES_PLAN_FILE);
  const latest = Math.max(...answers.map((n) => statSync(join(dir, n)).mtimeMs));
  return Number.isFinite(latest) ? new Date(latest) : new Date();
}

function writeJson(dir: string, name: string, value: unknown): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

// ── Отчёт импорта: только числа ─────────────────────────────────────────

const flagSet = (v: string) => v === '1' || v === 'true';

export function importReport(r: SnapshotImport, takenAt: Date, today: string): string[] {
  const lines: string[] = [];
  lines.push('  Таблицы (строк · страниц · контрольные суммы):');
  for (const key of HR_DATASET_KEYS) {
    lines.push(`    ${key.padEnd(16)} ${String(r.checksums[key].n).padStart(5)} · ${r.pages[key]} · сошлись`);
  }
  const emps = r.tables.employees;
  const design = HR_DESIGN_POSITION_IDS.map(String);
  const registry = HR_REGISTRY_POSITION_IDS.map(String);
  const pos = (e: (typeof emps)[number]) => e.positionId.trim();
  const working = emps.filter((e) => {
    const d = normalizeHrDate(e.dismissedAt);
    return !flagSet(e.isArchive) && !(d && d <= today);
  }).length;
  lines.push(
    `  Учётки: дизайн (9, 20) ${emps.filter((e) => design.includes(pos(e))).length}, ` +
      `дизайн-инженеры (29) ${emps.filter((e) => registry.includes(pos(e)) && !design.includes(pos(e))).length}, ` +
      `прочие позиции (по почтам Грейдов) ${emps.filter((e) => !registry.includes(pos(e))).length}`,
  );
  lines.push(`  Работают ${working}, ушли (архив или уволены) ${emps.length - working}`);
  const hrEmails = new Set(emps.map((e) => normalizeEmail(e.email)));
  lines.push(
    `  Почт Грейдов в плане: ${r.plan.emails.length}, из них есть в HR: ${r.plan.emails.filter((e) => hrEmails.has(e)).length}`,
  );
  lines.push(
    `  Журнал пересмотров: строк ${r.tables.salaryLog.length}, учёток с журналом ${new Set(r.tables.salaryLog.map((l) => l.employeeId)).size}`,
  );
  const months = r.tables.wageFundByMonth.map((w) => w.month.slice(0, 7)).filter(Boolean).sort();
  lines.push(
    `  ФОТ компании: месяцев ${months.length}${months.length ? ` (${months[0]} — ${months[months.length - 1]})` : ''}; ` +
      `статистика компании: месяцев ${r.tables.monthlyStats.length}; причин ухода ${r.tables.reasons.length}, подкатегорий ${r.tables.subs.length}`,
  );
  lines.push(`  Дата данных: ${takenAt.toISOString().slice(0, 10)}`);
  return lines;
}

// ── Запись ──────────────────────────────────────────────────────────────

/** Записать слепок и оставить последние HR_SNAPSHOTS_KEPT — одной транзакцией. */
export async function saveSnapshot(
  r: SnapshotImport,
  opts: { takenAt: Date; actor: string | null },
  db: PrismaClient = prisma,
) {
  return db.$transaction(async (tx) => {
    const row = await tx.hrSnapshot.create({
      data: {
        takenAt: opts.takenAt,
        source: HR_SNAPSHOT_SOURCE,
        data: snapshotData(r.tables),
        checksums: r.checksums,
        createdBy: opts.actor,
      },
      select: { id: true },
    });
    const all = await tx.hrSnapshot.findMany({
      orderBy: [{ takenAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    const old = all.slice(HR_SNAPSHOTS_KEPT).map((s) => s.id);
    if (old.length) await tx.hrSnapshot.deleteMany({ where: { id: { in: old } } });
    return { id: row.id, kept: all.length - old.length, deleted: old.length };
  });
}

// ── Точка входа ─────────────────────────────────────────────────────────

async function main() {
  const args = parseSnapshotArgs(process.argv.slice(2));

  if (args.mode === 'checksums') {
    const users = await prisma.user.findMany({ select: { email: true } });
    const plan = buildChecksumPlan(users.map((u) => u.email));
    const path = writeJson(resolve(args.out), CHECKSUM_PLAN_FILE, plan);
    console.log(`\nПлан контрольных сумм: ${path}`);
    console.log(`  Почт Грейдов в охвате: ${plan.emails.length}. Запросов: ${plan.queries.length}.`);
    console.log('  Каждый SQL из плана — в хаб (dwh_ask), ответ целиком — в файл:');
    for (const q of plan.queries) console.log(`    ${q.file}`);
    console.log(`  Дальше: --plan --checksums=${args.out} --out=${args.out}\n`);
    return;
  }

  if (args.mode === 'plan') {
    const p = resolve(args.checksums);
    const dir = statSync(p).isDirectory() ? p : dirname(p);
    const files = readAnswersDir(dir);
    const plan = readChecksumPlan(files.get(CHECKSUM_PLAN_FILE));
    const checksums = readChecksumAnswers(plan, files);
    if (checksums.employees.n === 0) {
      throw new HrSnapshotRejected('checksums.employees.json', 'HR не вернул ни одной учётки — скорее сломан запрос');
    }
    const pages = buildPagesPlan(plan, checksums);
    const path = writeJson(resolve(args.out), PAGES_PLAN_FILE, pages);
    console.log(`\nПлан страниц: ${path}`);
    for (const key of HR_DATASET_KEYS) {
      const n = pages.counts[key];
      console.log(`  ${key.padEnd(16)} строк ${String(n).padStart(5)} · страниц ${pages.pages.filter((x) => x.key === key).length}`);
    }
    console.log(`  Всего запросов: ${pages.pages.length}. Ответы — в ${args.out}/<key>.<page>.json`);
    console.log(`  Дальше: --import ${args.out}\n`);
    return;
  }

  const dir = resolve(args.dir);
  const files = readAnswersDir(dir);
  const result = importSnapshotAnswers(files);
  const takenAt = args.takenAt ? new Date(`${args.takenAt}T00:00:00.000Z`) : takenAtFromFiles(dir, Array.from(files.keys()));
  const today = new Date().toISOString().slice(0, 10);
  console.log(`\nСлепок HR · проверка ответов ida.hub · ${dir}`);
  for (const line of importReport(result, takenAt, today)) console.log(line);

  if (!args.apply) {
    console.log('\nПроверка пройдена — ничего не записано. Записать: тот же --import с --apply --actor=<email>\n');
    return;
  }
  const saved = await saveSnapshot(result, { takenAt, actor: args.actor });
  console.log(
    `\nЗаписано: слепок #${saved.id}; хранится ${saved.kept}, удалено старых ${saved.deleted}. ` +
      'Сервер возьмёт его, когда выйдет кэш набора HR, — в пределах получаса.\n',
  );
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  main()
    .catch((e) => {
      if (e instanceof HrSnapshotRejected) {
        console.error(`\nСлепок отвергнут — ничего не записано.\n  ${e.message}\n`);
      } else {
        console.error(`\nОшибка: ${e instanceof Error ? e.message : String(e)}`);
      }
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
