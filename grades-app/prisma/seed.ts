/**
 * Seed-скрипт для локальной разработки.
 *
 * Создаёт тестовых пользователей: 1 admin, 2 lead, 5 designer.
 * Один из дизайнеров имеет grade_floor = 'middle' для проверки legacy-кейса.
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
}

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
    email: 'lead.improve@idaproject.com',
    fullName: 'Анна Лидерова',
    role: 'lead',
    department: 'Improve',
    hiredAt: new Date('2022-03-15'),
  },
  {
    email: 'lead.inhouse@idaproject.com',
    fullName: 'Сергей Лидеров',
    role: 'lead',
    department: 'Inhouse',
    hiredAt: new Date('2022-06-01'),
  },
  // --- DESIGNERS ---
  {
    email: 'ip@idaproject.com',
    fullName: 'Иван Петров',
    role: 'designer',
    buildCode: 'creator',
    department: 'Inhouse',
    leadEmail: 'lead.inhouse@idaproject.com',
    hiredAt: new Date('2024-03-14'),
  },
  {
    email: 'ma@idaproject.com',
    fullName: 'Мария Алексеева',
    role: 'designer',
    buildCode: 'visioner',
    department: 'Create',
    leadEmail: 'lead.inhouse@idaproject.com',
    hiredAt: new Date('2025-07-22'),
  },
  {
    email: 'as@idaproject.com',
    fullName: 'Анна Соколова',
    role: 'designer',
    buildCode: 'navigator',
    department: 'Improve',
    leadEmail: 'lead.improve@idaproject.com',
    hiredAt: new Date('2023-04-02'),
  },
  {
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
  console.log('🌱 Seeding dev users...\n');

  // Получаем builds из БД (созданы скриптом импорта)
  const builds = await prisma.build.findMany();
  const buildByCode = new Map(builds.map((b) => [b.code, b.id]));

  if (buildByCode.size === 0) {
    console.error('❌ В БД нет builds. Запусти сначала: npm run import:excel');
    process.exit(1);
  }

  // Pass 1: создаём всех без leadId (нужно сначала создать лидов)
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email.toLowerCase() },
      create: {
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
      update: {
        fullName: u.fullName,
        role: u.role,
        buildId: u.buildCode ? buildByCode.get(u.buildCode) ?? null : null,
        department: u.department,
        gradeFloor: u.gradeFloor,
        gradeFloorReason: u.gradeFloorReason,
        active: true,
      },
    });
    console.log(`  ✓ ${u.role.padEnd(8)} ${u.fullName} (${u.email})`);
  }

  // Pass 2: проставляем leadId
  console.log('\n  Привязка лидов:');
  for (const u of USERS) {
    if (!u.leadEmail) continue;
    const lead = await prisma.user.findUnique({
      where: { email: u.leadEmail.toLowerCase() },
    });
    if (!lead) {
      console.warn(`    ⚠ Лид не найден: ${u.leadEmail}`);
      continue;
    }
    await prisma.user.update({
      where: { email: u.email.toLowerCase() },
      data: { leadId: lead.id },
    });
    console.log(`    ${u.fullName} → ${lead.fullName}`);
  }

  console.log('\n✓ Seed выполнен');
  console.log('\nЛогин в /auth/signin:');
  for (const u of USERS) {
    console.log(`  • ${u.email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
