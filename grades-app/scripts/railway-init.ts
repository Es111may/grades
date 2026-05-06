/**
 * Одноразовая инициализация БД для Railway.
 * Запускает импорт матрицы из Excel + seed тестовых пользователей.
 *
 * Идемпотентен — безопасно запускать повторно.
 * Запуск: npx tsx scripts/railway-init.ts
 */

import { execSync } from 'child_process';
import path from 'path';

const root = path.resolve(__dirname, '..');

function run(cmd: string) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

async function main() {
  console.log('🚀 Railway DB init\n');

  run('npx prisma db push --skip-generate');

  run('npx tsx scripts/import-excel.ts');

  run('npx tsx prisma/seed.ts');

  console.log('\n✅ БД готова к работе');
}

main().catch((e) => {
  console.error('❌ Init failed:', e);
  process.exit(1);
});
