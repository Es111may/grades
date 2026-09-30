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
// Next запускаем бинарником напрямую, без `npm run start:next`: на процесс
// меньше, сигналы и код выхода ходят без npm-прослойки.
// Аргументы те же, что в start:next (`next start`); порт Next берёт из PORT.
const next = spawn(path.join(root, 'node_modules/.bin/next'), ['start'], {
  cwd: root,
  stdio: 'inherit',
});

// Railway при остановке/передеплое шлёт SIGTERM этому процессу — отдаём его
// Next, чтобы тот корректно закрыл соединения. Обработчики ставим только
// здесь: во время execSync выше event loop занят, и перехват сигнала лишь
// отложил бы остановку до конца шага.
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    if (next.exitCode === null && next.signalCode === null) next.kill(sig);
  });
}

next.on('error', (e) => {
  console.error('✗ Не удалось запустить Next.js:', e.message);
  process.exit(1);
});
// Код выхода — как у Next (на SIGTERM он сам выходит с 0). Убит сигналом
// без своего выхода (OOM, SIGKILL — кода нет) — 1: для Railway это падение,
// и политика ON_FAILURE перезапустит контейнер.
next.on('exit', (code) => process.exit(code ?? 1));
