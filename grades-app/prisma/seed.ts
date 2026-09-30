/**
 * Seed-скрипт пользователей.
 *
 * Локально создаёт тестовых пользователей: 1 admin, 2 lead, 5 designer.
 * Один из дизайнеров имеет grade_floor = 'middle' для проверки legacy-кейса.
 *
 * В проде (NODE_ENV=production или есть RAILWAY_ENVIRONMENT) скрипт тоже
 * запускается — из scripts/start.ts на каждом старте. Там демо-пользователей
 * (demo: true) не создаём: остаётся только бутстрап админа, чтобы в пустую
 * БД было кем войти. Существующих пользователей seed не трогает нигде.
 *
 * В лог — только счётчики, без e-mail и имён (логи Railway читают не только
 * админы).
 *
 * Запуск: npm run db:seed
 *
 * ВАЖНО: запускать ПОСЛЕ npm run import:excel (нужны Build-ы из импорта).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SeedUser {
  email: string;
  fullName: string;
  role: 'admin' | 'lead' | 'designer';
  buildCode?: 'creator' | 'visioner' | 'navigator' | null;
  department?: string | null;
  leadEmail?: string | null;
  hiredAt?: Date;
  gradeFloor?: string | null;
  gradeFloorReason?: string | null;
  /** Демо-данные для локальной разработки — в проде не создаются */
  demo?: boolean;
}

const IS_PROD =
  process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT);

// Сценарий: Pavel — admin и одновременно лид Inhouse-команды.
// У него двое подопечных дизайнеров (Создатель и Визионер).
// Второй лид Анна — лидит Improve-команду.
const USERS: SeedUser[] = [
  // --- ADMIN ---
  {
    email: 'pg@idaproject.com',
    fullName: 'Pavel G.',
    role: 'admin',
    department: 'Дизайн',
    hiredAt: new Date('2021-01-10'),
  },
  // --- LEADS ---
  {
    demo: true,
    email: 'lead.improve@idaproject.com',
    fullName: 'Анна Лидерова',
    role: 'lead',
    department: 'Improve',
    hiredAt: new Date('2022-03-15'),
  },
  {
    demo: true,
    email: 'lead.inhouse@idaproject.com',
    fullName: 'Сергей Лидеров',
    role: 'lead',
    department: 'Inhouse',
    hiredAt: new Date('2022-06-01'),
  },
  // --- DESIGNERS ---
  {
    demo: true,
    email: 'ip@idaproject.com',
    fullName: 'Иван Петров',
    role: 'designer',
    buildCode: 'creator',
    department: 'Inhouse',
    leadEmail: 'lead.inhouse@idaproject.com',
    hiredAt: new Date('2024-03-14'),
  },
  {
    demo: true,
    email: 'ma@idaproject.com',
    fullName: 'Мария Алексеева',
    role: 'designer',
    buildCode: 'visioner',
    department: 'Create',
    leadEmail: 'lead.inhouse@idaproject.com',
    hiredAt: new Date('2025-07-22'),
  },
  {
    demo: true,
    email: 'as@idaproject.com',
    fullName: 'Анна Соколова',
    role: 'designer',
    buildCode: 'navigator',
    department: 'Improve',
    leadEmail: 'lead.improve@idaproject.com',
    hiredAt: new Date('2023-04-02'),
  },
  {
    demo: true,
    email: 'dk@idaproject.com',
    fullName: 'Дмитрий Климов',
    role: 'designer',
    buildCode: 'creator',
    department: 'Inhouse',
    leadEmail: 'lead.inhouse@idaproject.com',
    hiredAt: new Date('2026-04-02'),
  },
  // Legacy-кейс: переход со старой системы, грейд зафиксирован
  {
    demo: true,
    email: 'ot@idaproject.com',
    fullName: 'Олег Терехов',
    role: 'designer',
    buildCode: 'visioner',
    department: 'Create',
    leadEmail: 'lead.improve@idaproject.com',
    hiredAt: new Date('2022-11-01'),
    gradeFloor: 'middle',
    gradeFloorReason: 'Переход со старой системы грейдов 04.2026 — обещали уровень не откатывать.',
  },
];

async function main() {
  const users = IS_PROD ? USERS.filter((u) => !u.demo) : USERS;
  console.log(
    IS_PROD
      ? `🌱 Seed (прод): демо-пользователи пропущены, к проверке ${users.length}\n`
      : '🌱 Seeding dev users...\n',
  );

  // Получаем builds из БД (созданы скриптом импорта)
  const builds = await prisma.build.findMany();
  const buildByCode = new Map(builds.map((b) => [b.code, b.id]));

  if (buildByCode.size === 0) {
    console.error('❌ В БД нет builds. Запусти сначала: npm run import:excel');
    process.exit(1);
  }

  // Чёрный список email'ов — те, кого админ удалил через UI навсегда.
  // Не воссоздаём из seed, иначе на каждом deploy они «воскресают».
  const excluded = new Set(
    (await prisma.excludedEmail.findMany({ select: { email: true } })).map(
      (e) => e.email,
    ),
  );

  // Pass 1: создаём только тех, кого ещё нет в БД и кого админ не удалял.
  // Существующих не трогаем — иначе при каждом деплое перетирались бы
  // правки админа (имя, роль, билд, отдел, аватар, gradeFloor, active и т.д.).
  let created = 0;
  let skipped = 0;
  let blocked = 0;
  const createdByRole = new Map<string, number>();
  for (const u of users) {
    const email = u.email.toLowerCase();
    if (excluded.has(email)) {
      blocked++;
      continue;
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.user.create({
      data: {
        email: u.email.toLowerCase(),
        fullName: u.fullName,
        role: u.role,
        buildId: u.buildCode ? buildByCode.get(u.buildCode) ?? null : null,
        department: u.department,
        hiredAt: u.hiredAt,
        gradeFloor: u.gradeFloor,
        gradeFloorReason: u.gradeFloorReason,
        active: true,
      },
    });
    created++;
    createdByRole.set(u.role, (createdByRole.get(u.role) ?? 0) + 1);
  }
  if (created > 0) {
    const byRole = Array.from(createdByRole, ([role, n]) => `${role}: ${n}`).join(', ');
    console.log(`  ✓ создано ${created} (${byRole})`);
  }
  if (skipped > 0) {
    console.log(`  ↷ ${skipped} существующих пользователей пропущено (правки админа сохранены)`);
  }
  if (blocked > 0) {
    console.log(`  ⊘ ${blocked} в чёрном списке (удалены админом) — не воссозданы`);
  }

  // Pass 2: leadId только если ещё не задан. Если админ переназначил лида
  // через UI — наше seed-значение не должно его перезаписать.
  if (created > 0) {
    let linked = 0;
    let leadMissing = 0;
    for (const u of users) {
      if (!u.leadEmail) continue;
      const target = await prisma.user.findUnique({
        where: { email: u.email.toLowerCase() },
        select: { id: true, leadId: true },
      });
      if (!target || target.leadId !== null) continue;
      const lead = await prisma.user.findUnique({
        where: { email: u.leadEmail.toLowerCase() },
      });
      if (!lead) {
        leadMissing++;
        continue;
      }
      await prisma.user.update({
        where: { id: target.id },
        data: { leadId: lead.id },
      });
      linked++;
    }
    console.log(`\n  Привязка лидов (только для новосозданных): ${linked}`);
    if (leadMissing > 0) {
      console.warn(`    ⚠ лид не найден для ${leadMissing} пользователей`);
    }
  }

  console.log('\n✓ Seed выполнен');
  // Список логинов не печатаем: для локального входа e-mail'ы есть в USERS.
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
