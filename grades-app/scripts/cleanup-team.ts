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

  // 1. Удалить неактивных навсегда. Для каждого делаем cascade — точно как
  // в API DELETE ?hard=true. Лидов/стардизов переадресовываем на админа,
  // дизайнерам каскадно вычищаем оценки и заметки-автора.
  // Email удалённых заносим в ExcludedEmail, чтобы import-team их не вернул.
  const inactive = await prisma.user.findMany({
    where: { active: false },
    select: { id: true, email: true, fullName: true, role: true },
  });

  if (inactive.length === 0) {
    console.log('  ↷ Неактивных пользователей нет');
  } else {
    // Найдём admin'а, на которого переадресовываем лидов/стардизов.
    const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
    if (!admin) {
      console.warn('  ⚠ Нет админа — лидов/стардизов переадресовать не на кого. Пропускаю их.');
    }

    let deleted = 0;
    let blocked = 0;
    for (const u of inactive) {
      // Admin'а не трогаем — единственный, на кого переадресуем.
      if (u.role === 'admin') {
        blocked++;
        console.warn(`  ⚠ ${u.fullName} <${u.email}> — admin, пропускаю`);
        continue;
      }
      try {
        await prisma.$transaction(async (tx) => {
          if (u.role === 'lead' || u.role === 'stardiz') {
            if (!admin) throw new Error('NO_ADMIN');
            await tx.assessment.deleteMany({ where: { designerId: u.id } });
            await tx.user.updateMany({
              where: { leadId: u.id },
              data: { leadId: admin.id },
            });
            await tx.user.updateMany({
              where: { stardizId: u.id },
              data: { stardizId: admin.id },
            });
            await tx.assessment.updateMany({
              where: { leadId: u.id },
              data: { leadId: admin.id },
            });
            await tx.designerNote.updateMany({
              where: { authorId: u.id },
              data: { authorId: admin.id },
            });
            await tx.auditLog.updateMany({
              where: { actorId: u.id },
              data: { actorId: admin.id },
            });
            await tx.teamMatrixCell.updateMany({
              where: { updatedById: u.id },
              data: { updatedById: admin.id },
            });
            await tx.matrixVersion.updateMany({
              where: { createdBy: u.id },
              data: { createdBy: admin.id },
            });
          } else {
            // designer
            await tx.assessment.deleteMany({ where: { designerId: u.id } });
            await tx.designerNote.deleteMany({ where: { authorId: u.id } });
          }
          await tx.user.delete({ where: { id: u.id } });
          await tx.excludedEmail.upsert({
            where: { email: u.email },
            update: {},
            create: { email: u.email, reason: 'cleanup_inactive' },
          });
        });
        deleted++;
        console.log(`  ✕ удалён ${u.fullName} <${u.email}> (${u.role})`);
      } catch (e) {
        blocked++;
        console.warn(
          `  ⚠ не могу удалить ${u.fullName} <${u.email}> — ${(e as Error).message.split('\n')[0]}`,
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
