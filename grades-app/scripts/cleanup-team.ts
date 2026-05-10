/**
 * Одноразовые чистки команды (idempotent после первого запуска):
 *
 *  1. Удалить всех пользователей с active=false. Если FK-связи не дают
 *     удалить (есть assessments/notes/audit) — оставляем и пишем warning.
 *  2. Для пользователей с привязанным билдом, но без отдела, проставить
 *     отдел по маппингу:
 *        Создатель → Inhouse
 *        Визионер  → Create
 *        Навигатор → Improve
 *
 * Запускается каждый деплой; после первого прогона ничего не делает.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEPT_BY_BUILD: Record<string, string> = {
  creator: 'Инхаус',
  visioner: 'Криэйт',
  navigator: 'Импрув',
};

// Одноразовая миграция: переименовать латинские названия отделов на кириллицу.
const DEPT_RENAME: Record<string, string> = {
  Inhouse: 'Инхаус',
  Create: 'Криэйт',
  Improve: 'Импрув',
};

async function main() {
  console.log('🧹 Cleanup team...');

  // 1. Удалить неактивных.
  const inactive = await prisma.user.findMany({
    where: { active: false },
    select: { id: true, email: true, fullName: true },
  });
  if (inactive.length === 0) {
    console.log('  ↷ Неактивных пользователей нет');
  } else {
    let deleted = 0;
    let blocked = 0;
    for (const u of inactive) {
      try {
        await prisma.user.delete({ where: { id: u.id } });
        deleted++;
        console.log(`  ✕ удалён ${u.fullName} <${u.email}>`);
      } catch (e) {
        blocked++;
        console.warn(
          `  ⚠ не могу удалить ${u.fullName} <${u.email}> — есть зависимые записи (${(e as Error).message.split('\n')[0]})`,
        );
      }
    }
    console.log(`  Итого: удалено ${deleted}, заблокировано ${blocked}`);
  }

  // 2a. Переименовать латинские отделы на кириллицу (одноразово).
  let renamed = 0;
  for (const [from, to] of Object.entries(DEPT_RENAME)) {
    const r = await prisma.user.updateMany({
      where: { department: from },
      data: { department: to },
    });
    if (r.count > 0) {
      console.log(`  ⇄ переименовано ${from} → ${to}: ${r.count}`);
      renamed += r.count;
    }
  }
  if (renamed === 0) console.log('  ↷ Все отделы уже на кириллице');

  // 2b. Отдел по билду — только тем, у кого department=null и есть build.
  const builds = await prisma.build.findMany();
  const codeById = new Map(builds.map((b) => [b.id, b.code]));

  const candidates = await prisma.user.findMany({
    where: { department: null, buildId: { not: null } },
    select: { id: true, fullName: true, buildId: true },
  });
  let assigned = 0;
  for (const u of candidates) {
    const code = u.buildId ? codeById.get(u.buildId) : null;
    if (!code) continue;
    const dept = DEPT_BY_BUILD[code];
    if (!dept) continue;
    await prisma.user.update({ where: { id: u.id }, data: { department: dept } });
    assigned++;
    console.log(`  → ${u.fullName}: отдел ${dept}`);
  }
  if (assigned === 0) {
    console.log('  ↷ Всем уже проставлен отдел или нет билда');
  } else {
    console.log(`  Итого назначено отделов: ${assigned}`);
  }

  console.log('✓ Cleanup done');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
