/**
 * Отображение ставки (lib/salaryOverride) — завести, снять и посмотреть
 * записи. Интерфейса у записей нет: только этот скрипт.
 *
 * Запуск — вручную, на деплое не выполняется (в scripts/start.ts его нет).
 * Нужна переменная DATABASE_URL (Postgres Грейдов). В «Действия» (аудит)
 * скрипт ничего не пишет.
 *
 *   npx tsx scripts/salary-override.ts --set --email=<человек> --amount=<₽/мес> --owner=<email>
 *       Завести или поменять запись человека: всем, кроме владельца (--owner),
 *       ставка показывается суммой --amount — ₽/мес на руки, целым числом,
 *       как ставки HR (150000, можно «150 000»). Повторный запуск с теми же
 *       значениями ничего не меняет. Владелец видит данные HR как есть, только
 *       когда вошёл сам (не через «Войти как»).
 *   npx tsx scripts/salary-override.ts --remove --email=<человек>
 *       Снять запись: ставка снова из HR для всех. Записи нет — так и скажет.
 *   npx tsx scripts/salary-override.ts --list
 *       Все записи: человек, сумма, владелец, когда менялась.
 *
 * Email — как в Грейдах (регистр не важен); человек и владелец должны быть
 * в Грейдах, владелец — активным. Вывод — в свой терминал, не в общие логи.
 */

import { prisma } from '../src/lib/db';

// ── Аргументы ────────────────────────────────────────────────────────────

export type OverrideArgs =
  | { mode: 'set'; email: string; amount: number; owner: string }
  | { mode: 'remove'; email: string }
  | { mode: 'list' };

const MODES = ['--set', '--remove', '--list'] as const;
const VALUE_FLAGS = ['--email=', '--amount=', '--owner='] as const;

/** Сумма — ₽/мес: меньше тысячи — почти наверняка тысячи вместо рублей. */
export const MIN_AMOUNT = 1_000;
/** Тот же потолок, что у суммы планового пересмотра (api/users/[id]/planned-raise). */
export const MAX_AMOUNT = 10_000_000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmail(raw: string | undefined, flag: string): string {
  if (raw === undefined || raw === '') throw new Error(`${flag} — без email`);
  const email = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error(`${flag}: «${raw}» не похоже на email`);
  return email;
}

export function parseAmount(raw: string | undefined): number {
  if (raw === undefined || raw === '') throw new Error('--amount — без суммы');
  const s = raw.replace(/[\s_ ]/g, '');
  if (!/^\d+$/.test(s)) {
    throw new Error(`--amount — целое число рублей в месяц на руки (например 150000), а не «${raw}»`);
  }
  const n = Number(s);
  if (n < MIN_AMOUNT || n > MAX_AMOUNT) {
    throw new Error(
      `--amount — от ${MIN_AMOUNT.toLocaleString('ru-RU')} до ${MAX_AMOUNT.toLocaleString('ru-RU')} ₽/мес; ` +
        'сумма в рублях, не в тысячах',
    );
  }
  return n;
}

export function parseArgs(argv: string[]): OverrideArgs {
  const value = (flag: string) => {
    const a = argv.find((x) => x.startsWith(flag));
    return a === undefined ? undefined : a.slice(flag.length).trim();
  };
  const unknown = argv.filter(
    (a) => !(MODES as readonly string[]).includes(a) && !VALUE_FLAGS.some((f) => a.startsWith(f)),
  );
  if (unknown.length) {
    throw new Error(
      `Неизвестные аргументы: ${unknown.join(' ')}. Есть: --set --email=<email> --amount=<₽/мес> ` +
        '--owner=<email> · --remove --email=<email> · --list',
    );
  }
  const modes = MODES.filter((m) => argv.includes(m));
  if (modes.length !== 1) throw new Error('Нужен ровно один режим: --set, --remove или --list');

  const email = value('--email=');
  const amount = value('--amount=');
  const owner = value('--owner=');

  if (modes[0] === '--list') {
    if (email !== undefined || amount !== undefined || owner !== undefined) {
      throw new Error('--list — без --email, --amount и --owner');
    }
    return { mode: 'list' };
  }
  if (modes[0] === '--remove') {
    if (amount !== undefined || owner !== undefined) {
      throw new Error('--remove — только с --email');
    }
    return { mode: 'remove', email: parseEmail(email, '--email') };
  }
  if (owner === undefined) throw new Error('--set — нужен --owner=<email> (кто видит данные HR как есть)');
  return {
    mode: 'set',
    email: parseEmail(email, '--email'),
    amount: parseAmount(amount),
    owner: parseEmail(owner, '--owner'),
  };
}

// ── Вывод ────────────────────────────────────────────────────────────────

const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽/мес`;

const MOSCOW_DATETIME = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export type ListRow = {
  email: string;
  fullName: string;
  amount: number;
  ownerEmail: string | null;
  updatedAt: Date;
};

export function formatList(rows: ListRow[]): string {
  if (!rows.length) return 'Записей нет.';
  const lines = rows.map(
    (r) =>
      `• ${r.fullName} <${r.email}> — ${rub(r.amount)} · владелец: ${r.ownerEmail ?? '— (удалён: данные HR не видит никто)'} · ` +
      `изменена ${MOSCOW_DATETIME.format(r.updatedAt).replace(',', '')} МСК`,
  );
  return [`Записей: ${rows.length}`, ...lines].join('\n');
}

// ── Действия ─────────────────────────────────────────────────────────────

async function findUser(email: string, what: string) {
  const u = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, email: true, fullName: true, active: true },
  });
  if (!u) throw new Error(`${what} с email ${email} в Грейдах нет`);
  return u;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.mode === 'list') {
    const rows = await prisma.salaryDisplayOverride.findMany({
      select: {
        amount: true,
        updatedAt: true,
        user: { select: { email: true, fullName: true } },
        owner: { select: { email: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    console.log(
      formatList(
        rows.map((r) => ({
          email: r.user.email,
          fullName: r.user.fullName,
          amount: r.amount,
          ownerEmail: r.owner?.email ?? null,
          updatedAt: r.updatedAt,
        })),
      ),
    );
    return;
  }

  const person = await findUser(args.email, 'Человека');

  if (args.mode === 'remove') {
    const { count } = await prisma.salaryDisplayOverride.deleteMany({ where: { userId: person.id } });
    console.log(
      count
        ? `Снято: ${person.fullName} <${person.email}> — ставка снова из HR для всех.`
        : `Записи у ${person.fullName} <${person.email}> нет — ничего не менял.`,
    );
    return;
  }

  const owner = await findUser(args.owner, 'Владельца');
  if (!owner.active) throw new Error(`Владелец ${owner.email} неактивен — запись не завёл`);

  const before = await prisma.salaryDisplayOverride.findUnique({
    where: { userId: person.id },
    select: { amount: true, ownerId: true },
  });
  if (before && before.amount === args.amount && before.ownerId === owner.id) {
    console.log(`Без изменений: ${person.fullName} <${person.email}> — ${rub(args.amount)}, владелец ${owner.email}.`);
    return;
  }
  await prisma.salaryDisplayOverride.upsert({
    where: { userId: person.id },
    create: { userId: person.id, amount: args.amount, ownerId: owner.id },
    update: { amount: args.amount, ownerId: owner.id },
  });
  console.log(
    `${before ? 'Обновлено' : 'Заведено'}: ${person.fullName} <${person.email}> — ${rub(args.amount)}, ` +
      `владелец ${owner.email}.` +
      (person.active ? '' : ' Человек неактивен — запись действует и на его последнюю ставку.'),
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
