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

console.log('\n▶ Starting Next.js (standalone)...\n');
const next = spawn('node', ['.next/standalone/server.js'], { cwd: root, stdio: 'inherit' });
next.on('exit', (code) => process.exit(code ?? 0));
