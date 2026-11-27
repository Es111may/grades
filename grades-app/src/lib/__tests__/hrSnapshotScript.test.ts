import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

// Скрипт тянет Prisma — в тесте её нет: запись идёт в поддельный клиент.
vi.mock('../db', () => ({ prisma: {} }));

import { parseSnapshotArgs, readAnswersDir, saveSnapshot, takenAtFromFiles } from '../../../scripts/hr-snapshot';
import { HrSnapshotRejected, emptyTables, type SnapshotImport } from '../hrSnapshot';

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'hr-snapshot-test-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('parseSnapshotArgs — три шага', () => {
  it('шаг 1, 2, 3', () => {
    expect(parseSnapshotArgs(['--checksums', '--out=work'])).toEqual({ mode: 'checksums', out: 'work' });
    expect(parseSnapshotArgs(['--plan', '--checksums=work', '--out=work'])).toEqual({
      mode: 'plan',
      checksums: 'work',
      out: 'work',
    });
    expect(parseSnapshotArgs(['--import', 'work'])).toEqual({
      mode: 'import',
      dir: 'work',
      apply: false,
      actor: null,
      takenAt: null,
    });
    expect(parseSnapshotArgs(['--import=work', '--apply', '--actor=Admin@Example.test', '--taken-at=2026-11-27'])).toEqual({
      mode: 'import',
      dir: 'work',
      apply: true,
      actor: 'admin@example.test',
      takenAt: '2026-11-27',
    });
  });

  it('ни одного шага, два шага, без нужных аргументов, лишние аргументы — ошибка', () => {
    expect(() => parseSnapshotArgs([])).toThrow('ровно один шаг');
    expect(() => parseSnapshotArgs(['--checksums', '--plan', '--out=x'])).toThrow('ровно один шаг');
    expect(() => parseSnapshotArgs(['--checksums'])).toThrow('--out');
    expect(() => parseSnapshotArgs(['--plan', '--out=x'])).toThrow('--checksums=');
    expect(() => parseSnapshotArgs(['--import'])).toThrow('папка');
    expect(() => parseSnapshotArgs(['--import', 'x', '--force'])).toThrow('Неизвестные');
    expect(() => parseSnapshotArgs(['--import', 'x', '--taken-at=вчера'])).toThrow('YYYY-MM-DD');
  });
});

describe('папка ответов', () => {
  it('читает только *.json; не JSON — отказ с именем файла', () => {
    const d = tmp();
    writeFileSync(join(d, 'checksums.plan.json'), '{"kind":"x"}');
    writeFileSync(join(d, 'notes.txt'), 'заметки');
    expect(Array.from(readAnswersDir(d).keys())).toEqual(['checksums.plan.json']);
    writeFileSync(join(d, 'employees.1.json'), 'Ответ хаба: {"sql":');
    const err = (() => {
      try {
        readAnswersDir(d);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(HrSnapshotRejected);
    expect((err as HrSnapshotRejected).file).toBe('employees.1.json');
  });

  it('дата данных по умолчанию — самый поздний ответ хаба, планы не в счёт', () => {
    const d = tmp();
    for (const n of ['checksums.plan.json', 'checksums.employees.json', 'employees.1.json']) writeFileSync(join(d, n), '{}');
    utimesSync(join(d, 'checksums.employees.json'), new Date('2026-11-27T06:00:00Z'), new Date('2026-11-27T06:00:00Z'));
    utimesSync(join(d, 'employees.1.json'), new Date('2026-11-27T07:30:00Z'), new Date('2026-11-27T07:30:00Z'));
    utimesSync(join(d, 'checksums.plan.json'), new Date('2026-11-28T09:00:00Z'), new Date('2026-11-28T09:00:00Z'));
    expect(takenAtFromFiles(d, ['checksums.plan.json', 'checksums.employees.json', 'employees.1.json']).toISOString()).toBe(
      '2026-11-27T07:30:00.000Z',
    );
  });
});

describe('saveSnapshot — запись и последние 5', () => {
  it('пишет слепок и удаляет всё старше пяти последних одной транзакцией', async () => {
    const calls: Record<string, unknown[]> = {};
    const rec = (name: string, result: unknown) => (arg: unknown) => {
      (calls[name] ??= []).push(arg);
      return Promise.resolve(result);
    };
    const tx = {
      hrSnapshot: {
        create: rec('create', { id: 7 }),
        findMany: rec('findMany', [7, 6, 5, 4, 3, 2, 1].map((id) => ({ id }))),
        deleteMany: rec('deleteMany', { count: 2 }),
      },
    };
    const db = { $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as PrismaClient;
    const result: SnapshotImport = {
      plan: { kind: 'hr-snapshot-checksums', format: 1, createdAt: '', emails: [], queries: [] },
      tables: emptyTables(),
      checksums: {} as SnapshotImport['checksums'],
      pages: {} as SnapshotImport['pages'],
    };
    const r = await saveSnapshot(result, { takenAt: new Date('2026-11-27T07:30:00Z'), actor: 'admin@example.test' }, db);
    expect(r).toEqual({ id: 7, kept: 5, deleted: 2 });
    expect(calls.create[0]).toMatchObject({
      data: { takenAt: new Date('2026-11-27T07:30:00Z'), source: 'ida-hub', createdBy: 'admin@example.test', data: { format: 1 } },
    });
    expect(calls.findMany[0]).toMatchObject({ orderBy: [{ takenAt: 'desc' }, { id: 'desc' }] });
    expect(calls.deleteMany[0]).toEqual({ where: { id: { in: [2, 1] } } });
  });
});
