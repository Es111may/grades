/**
 * Импорт реальной команды дизайна из data/team.csv.
 *
 * Idempotent: если пользователь с таким email уже существует — пропускаем.
 * Безопасно запускать на каждом деплое (вызывается из scripts/start.ts).
 *
 * Формат CSV (header в первой строке):
 *   Пользователь,Email,Роль,Билд,Лид,Стардиз,Дата найма
 *
 * Маппинги:
 *   Роль: «Лид» → lead, «Стардиз» → stardiz, «Дизайнер» → designer
 *   Билд: «Создатель» → creator, «Визионер» → visioner, «Навигатор» → navigator
 *   Дата: DD.MM.YY → ISO
 *
 * Лиды/стардизы указаны в CSV по ФИО. Так как ФИО админа Pavel G. в БД
 * отличается от того, как его называют в CSV («Паша Гавриченко»),
 * для лидов/стардизов держим явный маппинг fullName → email.
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const prisma = new PrismaClient();

const CSV_PATH = path.resolve(__dirname, '..', 'data', 'team.csv');
const AVATARS_DIR = path.resolve(__dirname, '..', 'data', 'user-avatar');

/**
 * Читает картинку по fullName из data/user-avatar/, обрезает по центру до
 * квадрата, ресайзит до 256×256 JPEG (quality 85) и возвращает data URL.
 * Возвращает null, если файла нет или не удалось прочитать.
 */
async function readAvatarDataUrl(fullName: string): Promise<string | null> {
  if (!fs.existsSync(AVATARS_DIR)) return null;
  const fileName = `${fullName}.png`;
  const filePath = path.join(AVATARS_DIR, fileName);
  if (!fs.existsSync(filePath)) return null;
  try {
    const buf = await sharp(filePath)
      .resize(256, 256, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch (e) {
    console.warn(`  ⚠ Не удалось обработать аватар ${fileName}: ${(e as Error).message}`);
    return null;
  }
}

const ROLE_MAP: Record<string, 'lead' | 'stardiz' | 'designer'> = {
  Лид: 'lead',
  Стардиз: 'stardiz',
  Дизайнер: 'designer',
};

const BUILD_MAP: Record<string, 'creator' | 'visioner' | 'navigator'> = {
  Создатель: 'creator',
  Визионер: 'visioner',
  Навигатор: 'navigator',
};

// Маппинг ФИО (как они написаны в столбцах «Лид»/«Стардиз» CSV) → email.
// Дополняем по мере появления новых лидов/стардизов.
const FULLNAME_TO_EMAIL: Record<string, string> = {
  'Артуш Манукян': 'a.manukyan@idaproject.com',
  'Саша Лучшев': 'a.luchshev@idaproject.com',
  'Никита Хахай': 'nh@idaproject.com',
  'Паша Гавриченко': 'pg@idaproject.com',
  'Полина Филькова': 'p.filkova@idaproject.com',
  'Эля Гильмуллина': 'j.gilmullina@idaproject.com',
};

type Row = {
  fullName: string;
  email: string;
  role: 'lead' | 'stardiz' | 'designer';
  buildCode: 'creator' | 'visioner' | 'navigator' | null;
  leadName: string | null;
  stardizName: string | null;
  hiredAt: Date | null;
};

function parseDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  return new Date(Date.UTC(year, Number(mo) - 1, Number(d)));
}

function splitCsvLine(line: string): string[] {
  // Простая CSV-парсилка для нашего формата без кавычек и многострочных полей.
  return line.split(',').map((s) => s.trim());
}

function readCsv(): Row[] {
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const [, ...dataLines] = lines; // выкидываем header
  const rows: Row[] = [];
  for (const line of dataLines) {
    const cols = splitCsvLine(line);
    if (cols.length < 7) continue;
    const [fullName, email, roleRu, buildRu, leadName, stardizName, hiredStr] = cols;
    const role = ROLE_MAP[roleRu];
    if (!role) {
      console.warn(`  ⚠ Неизвестная роль «${roleRu}» у ${fullName} — пропускаю`);
      continue;
    }
    rows.push({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      role,
      buildCode: buildRu ? BUILD_MAP[buildRu] ?? null : null,
      leadName: leadName.trim() || null,
      stardizName: stardizName.trim() || null,
      hiredAt: parseDate(hiredStr),
    });
  }
  return rows;
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.log('📭 data/team.csv не найден, импорт команды пропущен');
    return;
  }
  console.log('👥 Импорт команды из data/team.csv...');

  const rows = readCsv();
  console.log(`  • найдено ${rows.length} записей в CSV`);

  const builds = await prisma.build.findMany();
  const buildIdByCode = new Map(builds.map((b) => [b.code, b.id]));

  // Чёрный список email'ов — кого админ удалял навсегда, не воссоздаём.
  const excluded = new Set(
    (await prisma.excludedEmail.findMany({ select: { email: true } })).map(
      (e) => e.email,
    ),
  );

  // Pass 1: создание пользователей (только тех, кого ещё нет).
  // Для существующих опционально подгрузим только avatarUrl, если он
  // ещё null — не перетирая других правок админа.
  let created = 0;
  let skipped = 0;
  let blocked = 0;
  let avatarsAdded = 0;
  for (const r of rows) {
    if (excluded.has(r.email)) {
      blocked++;
      continue;
    }
    const existing = await prisma.user.findUnique({
      where: { email: r.email },
      select: { id: true, avatarUrl: true },
    });
    if (existing) {
      skipped++;
      if (existing.avatarUrl === null) {
        const avatarUrl = await readAvatarDataUrl(r.fullName);
        if (avatarUrl) {
          await prisma.user.update({ where: { id: existing.id }, data: { avatarUrl } });
          avatarsAdded++;
        }
      }
      continue;
    }
    const avatarUrl = await readAvatarDataUrl(r.fullName);
    await prisma.user.create({
      data: {
        email: r.email,
        fullName: r.fullName,
        role: r.role,
        buildId: r.buildCode ? buildIdByCode.get(r.buildCode) ?? null : null,
        hiredAt: r.hiredAt,
        active: true,
        avatarUrl,
      },
    });
    created++;
    console.log(
      `  ✓ создан ${r.role.padEnd(8)} ${r.fullName} <${r.email}>${avatarUrl ? ' [+аватар]' : ''}`,
    );
  }
  if (skipped > 0) {
    console.log(`  ↷ ${skipped} существующих пропущено (правки админа сохранены)`);
  }
  if (blocked > 0) {
    console.log(`  ⊘ ${blocked} в чёрном списке (удалены админом) — не воссозданы`);
  }
  if (avatarsAdded > 0) {
    console.log(`  + ${avatarsAdded} аватарок подгружено для существующих без фото`);
  }

  // Pass 2: проставляем leadId / stardizId — только для новосозданных
  // (у кого ещё пусто), чтобы не перетирать назначения админа.
  if (created > 0) {
    console.log('\n  Привязка лидов и стардизов:');
    for (const r of rows) {
      if (!r.leadName && !r.stardizName) continue;
      const target = await prisma.user.findUnique({
        where: { email: r.email },
        select: { id: true, leadId: true, stardizId: true },
      });
      if (!target) continue;

      const data: { leadId?: number; stardizId?: number } = {};

      if (r.leadName && target.leadId === null) {
        const leadEmail = FULLNAME_TO_EMAIL[r.leadName];
        if (leadEmail) {
          const lead = await prisma.user.findUnique({ where: { email: leadEmail } });
          if (lead) data.leadId = lead.id;
          else console.warn(`    ⚠ Лид ${r.leadName} (${leadEmail}) не найден в БД`);
        } else {
          console.warn(`    ⚠ Нет маппинга email для лида «${r.leadName}»`);
        }
      }

      if (r.stardizName && target.stardizId === null) {
        const stardizEmail = FULLNAME_TO_EMAIL[r.stardizName];
        if (stardizEmail) {
          const st = await prisma.user.findUnique({ where: { email: stardizEmail } });
          if (st) data.stardizId = st.id;
          else console.warn(`    ⚠ Стардиз ${r.stardizName} (${stardizEmail}) не найден в БД`);
        } else {
          console.warn(`    ⚠ Нет маппинга email для стардиза «${r.stardizName}»`);
        }
      }

      if (Object.keys(data).length > 0) {
        await prisma.user.update({ where: { id: target.id }, data });
        console.log(`    ${r.fullName}: ${JSON.stringify(data)}`);
      }
    }
  }

  console.log(`\n✓ Импорт команды завершён: создано ${created}, пропущено ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
