/**
 * Точка входа для Railway: инициализирует БД и запускает Next.js.
 * Все операции идемпотентны — безопасно при каждом рестарте.
 */

import { execSync, spawn } from 'child_process';
import path from 'path';

const root = path.resolve(__dirname, '..');

function run(cmd: string) {
  console.log(`▶ ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

run('npx prisma db push --skip-generate');
run('npx tsx scripts/import-excel.ts');
run('npx tsx prisma/seed.ts');
// scripts/import-team.ts — отключён.
// Первоначальный импорт команды из data/team.csv уже сделан. На каждом
// деплое скрипт пытался воссоздать тех, кого админ удалил через UI ещё
// до появления ExcludedEmail (модель добавлена в v0.11.9). Чтобы
// удалённые гарантированно больше не возвращались — отключаем
// автоимпорт. Новые пользователи добавляются админом через UI кнопкой
// «Добавить пользователя». Если когда-нибудь понадобится разовый
// прогон — запустить вручную: `npx tsx scripts/import-team.ts`.
run('npx tsx scripts/cleanup-team.ts');
run('npx tsx scripts/migrate-grades.ts');
// Phase 22: исторические 360-оценки лидов/стардизов (декабрь 2025 — март 2026)
// восстановленные из markdown-отчётов Buildin. Скрипт идемпотентный,
// упавший импорт не блокирует деплой (внутри ловит исключения).
run('npx tsx scripts/import-historical-lead-reviews.ts');

console.log('\n▶ Starting Next.js...\n');
// npm start теперь указывает на этот скрипт, поэтому запускаем next напрямую (start:next)
const next = spawn('npm', ['run', 'start:next'], { cwd: root, stdio: 'inherit' });
next.on('exit', (code) => process.exit(code ?? 0));
