/**
 * Одноразовые чистки команды (idempotent после первого запуска):
 *
 *  1. Переименование латинских отделов на кириллицу (одноразовая).
 *  2. Для пользователей с привязанным билдом, но без отдела, проставить
 *     отдел по маппингу:
 *        creator   → Инхаус
 *        visioner  → Криэйт
 *        navigator → Импрув
 *
 * Запускается каждый деплой; после первого прогона ничего не делает.
 *
 * ВАЖНО — что больше НЕ делаем:
 *   Раньше скрипт удалял всех пользователей с active=false на каждом
 *   деплое, считая, что «деактивирован» = «можно навсегда грохнуть».
 *   Это сломало UX: Pavel деактивировал дизайнера через UI («выключить
 *   доступ»), а следующим деплоем тот пропадал из списка и его email
 *   попадал в ExcludedEmail. Теперь soft-delete = «active=false»
 *   остаётся в списке (с opacity-50), а hard-delete делается только
 *   через специальную кнопку с reassign — `?hard=true` в API.
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
