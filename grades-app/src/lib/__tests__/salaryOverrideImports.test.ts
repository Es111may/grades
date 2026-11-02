import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// lib/salaryOverride — только сервер: ни клиентский компонент, ни то, что
// он тянет за собой (по относительным и @/-импортам), до него не доходят.
// Иначе модуль попал бы в клиентский бандл. То же для lib/db: через него в
// бандл попадает браузерная заглушка @prisma/client с названиями всех
// моделей и полей схемы.

const SRC = resolve(__dirname, '../..');
const TARGET = join(SRC, 'lib/salaryOverride.ts');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : walk(p);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts') ? [p] : [];
  });
}

const FILES = walk(SRC);
const read = (p: string) => readFileSync(p, 'utf8');
const isClient = (p: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(read(p));

// «import type» / «export type» стираются при сборке — в бандл не попадают
const IMPORT_RE = /(?:import|export)\s(?!type\s)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      // нет такого — следующий вариант
    }
  }
  return null;
}

function importsOf(p: string): string[] {
  const out: string[] = [];
  for (const m of read(p).matchAll(IMPORT_RE)) {
    const r = resolveSpec(p, m[1] ?? m[2] ?? m[3]);
    if (r) out.push(r);
  }
  return out;
}

describe('lib/salaryOverride не попадает в клиентский код', () => {
  const clientEntries = FILES.filter(
    (p) => isClient(p) || p.startsWith(join(SRC, 'components') + '/'),
  );

  it('клиентские файлы есть (проверка не пустая)', () => {
    expect(clientEntries.length).toBeGreaterThan(50);
  });

  it('ни один клиентский файл и src/components не упоминают модуль', () => {
    const bad = clientEntries.filter((p) => /salaryOverride/.test(read(p)));
    expect(bad.map((p) => relative(SRC, p))).toEqual([]);
  });

  /** Всё, что тянут за собой entries; via — кто первым привёл файл. */
  function reachable(entries: string[]) {
    const seen = new Set<string>();
    const stack = [...entries];
    const via = new Map<string, string>();
    while (stack.length) {
      const p = stack.pop()!;
      if (seen.has(p)) continue;
      seen.add(p);
      for (const dep of importsOf(p)) {
        if (!via.has(dep)) via.set(dep, p);
        stack.push(dep);
      }
    }
    return { seen, via };
  }

  it('и не тянут его транзитивно', () => {
    const { seen, via } = reachable(clientEntries);
    expect(seen.has(TARGET) ? relative(SRC, via.get(TARGET)!) : null).toBeNull();
  });

  it('клиентские модули не тянут lib/db: иначе в бандле браузерная заглушка Prisma со всей схемой', () => {
    // Граница — 'use client': серверные компоненты из src/components (AppHeader
    // и т.п.) с БД работать вправе
    const { seen, via } = reachable(FILES.filter(isClient));
    const db = join(SRC, 'lib/db.ts');
    expect(seen.has(db) ? relative(SRC, via.get(db)!) : null).toBeNull();
  });

  it('импортируют модуль только серверные страницы и роуты', () => {
    const importers = FILES.filter((p) => p !== TARGET && importsOf(p).includes(TARGET));
    expect(importers.length).toBeGreaterThan(0);
    for (const p of importers) {
      expect(isClient(p), relative(SRC, p)).toBe(false);
      expect(/\/(page|route)\.tsx?$/.test(p), relative(SRC, p)).toBe(true);
    }
  });
});
