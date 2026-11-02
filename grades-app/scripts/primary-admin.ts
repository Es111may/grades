/**
 * Главный админ (lib/primaryAdmin) — назначить, снять, посмотреть. Только он
 * правит аккаунты других админов: роль, email, активность, удаление и
 * остальные поля карточки (lib/permissions). Интерфейса и API нет: только
 * этот скрипт.
 *
 * Запуск — вручную, на деплое не выполняется (в scripts/start.ts его нет).
 * Нужна переменная DATABASE_URL (Postgres Грейдов). В «Действия» (аудит)
 * скрипт ничего не пишет.
 *
 *   npx tsx scripts/primary-admin.ts --set --email=<админ>
 *       Назначить. Человек — активный админ в Грейдах. Прежний главный (если
 *       был другой) заменяется: строка в primary_admin одна (первичный ключ
 *       slot = 1), второго главного не бывает. Повторный запуск с тем же
 *       email ничего не меняет.
 *   npx tsx scripts/primary-admin.ts --unset
 *       Снять. Без главного аккаунты других админов не правит никто — каждый
 *       админ правит только свой.
 *   npx tsx scripts/primary-admin.ts --show
 *       Кто главный сейчас.
 *
 * Права действуют, пока главный — активный админ и вошёл сам (не через
 * «Войти как»). Вывод — в свой терминал, не в общие логи.
 */

import { prisma } from '../src/lib/db';

// ── Аргументы ────────────────────────────────────────────────────────────

export type PrimaryAdminArgs = { mode: 'set'; email: string } | { mode: 'unset' } | { mode: 'show' };

const MODES = ['--set', '--unset', '--show'] as const;
const EMAIL_FLAG = '--email=';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseArgs(argv: string[]): PrimaryAdminArgs {
  const unknown = argv.filter(
    (a) => !(MODES as readonly string[]).includes(a) && !a.startsWith(EMAIL_FLAG),
  );
  if (unknown.length) {
    throw new Error(
      `Неизвестные аргументы: ${unknown.join(' ')}. Есть: --set --email=<email> · --unset · --show`,
    );
  }
  const modes = MODES.filter((m) => argv.includes(m));
  if (modes.length !== 1) throw new Error('Нужен ровно один режим: --set, --unset или --show');
  const raw = argv.find((a) => a.startsWith(EMAIL_FLAG))?.slice(EMAIL_FLAG.length).trim();

  if (modes[0] !== '--set') {
    if (raw !== undefined) throw new Error(`${modes[0]} — без --email`);
    return { mode: modes[0] === '--unset' ? 'unset' : 'show' };
  }
  if (!raw) throw new Error('--set — нужен --email=<email> админа');
  const email = raw.toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error(`--email: «${raw}» не похоже на email`);
  return { mode: 'set', email };
}

type Person = { fullName: string; email: string };
const who = (p: Person) => `${p.fullName} <${p.email}>`;

/** Строка для --show и итогов: кто главный и действует ли флаг. */
export function describePrimary(p: (Person & { role: string; active: boolean }) | null): string {
  if (!p) return 'Главный админ не назначен — аккаунты других админов не правит никто.';
  const inert =
    p.role !== 'admin'
      ? ' Сейчас не админ — права главного не действуют.'
      : !p.active
        ? ' Неактивен — права главного не действуют.'
        : '';
  return `Главный админ: ${who(p)}.${inert}`;
}

// ── Действия ─────────────────────────────────────────────────────────────

const PERSON = { id: true, fullName: true, email: true, role: true, active: true } as const;
/** Строка primary_admin всегда одна — с этим ключом. */
const SLOT = 1;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const current =
    (await prisma.primaryAdmin.findUnique({ where: { slot: SLOT }, select: { user: { select: PERSON } } }))
      ?.user ?? null;

  if (args.mode === 'show') {
    console.log(describePrimary(current));
    return;
  }

  if (args.mode === 'unset') {
    if (!current) {
      console.log('Главный админ и так не назначен — ничего не менял.');
      return;
    }
    await prisma.primaryAdmin.deleteMany({});
    console.log(`Снято: ${who(current)}. Аккаунты других админов теперь не правит никто.`);
    return;
  }

  const person = await prisma.user.findFirst({
    where: { email: { equals: args.email, mode: 'insensitive' } },
    select: PERSON,
  });
  if (!person) throw new Error(`Человека с email ${args.email} в Грейдах нет`);
  if (person.role !== 'admin') throw new Error(`${who(person)} — не админ (роль ${person.role})`);
  if (!person.active) throw new Error(`${who(person)} неактивен`);
  if (current?.id === person.id) {
    console.log(`Без изменений: главный админ — ${who(person)}.`);
    return;
  }
  // Строка одна: заменяем человека в ней, а не добавляем вторую
  await prisma.primaryAdmin.upsert({
    where: { slot: SLOT },
    create: { slot: SLOT, userId: person.id },
    update: { userId: person.id, createdAt: new Date() },
  });
  console.log(
    `Назначено: главный админ — ${who(person)}.` + (current ? ` Прежний (${who(current)}) снят.` : ''),
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
