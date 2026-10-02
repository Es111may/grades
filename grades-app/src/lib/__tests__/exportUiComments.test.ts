import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

// Скрипт тянет Prisma — в тесте базы нет: чистые функции проверяем на
// выдуманных тредах, запись — на поддельном клиенте.
vi.mock('../db', () => ({ prisma: {} }));

import {
  anchorSummary,
  applyResolve,
  formatMarkdown,
  formatMoscowDateTime,
  formatResolveReport,
  parseArgs,
  planResolve,
} from '../../../scripts/export-ui-comments';
import type { UiCommentDto } from '../uiCommentsShared';

// Все люди и тексты выдуманы.
const author = { id: 10, fullName: 'Лид Выдуманный', avatarUrl: null };
const admin = { id: 1, fullName: 'Админ Выдуманный', avatarUrl: null };

function thread(over: Partial<UiCommentDto>): UiCommentDto {
  return {
    id: 1,
    path: '/admin/users',
    anchor: { kind: 'point', abs: { x: 10, y: 20 }, viewportW: 1440 },
    text: 'Текст',
    status: 'open',
    author,
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    resolvedAt: null,
    resolvedBy: null,
    appVersion: '0.74.1',
    replies: [],
    ...over,
  };
}

describe('parseArgs', () => {
  it('по умолчанию — открытые, Markdown', () => {
    expect(parseArgs([])).toEqual({ mode: 'export', status: 'open', json: false });
  });
  it('--status и --json', () => {
    expect(parseArgs(['--status=all', '--json'])).toEqual({ mode: 'export', status: 'all', json: true });
    expect(parseArgs(['--status=resolved'])).toMatchObject({ status: 'resolved' });
  });
  it('--resolve: id через запятую, без повторов; --actor', () => {
    expect(parseArgs(['--resolve=12, 15,12'])).toEqual({ mode: 'resolve', ids: [12, 15], actor: null });
    expect(parseArgs(['--resolve=3', '--actor=lead@example.test'])).toEqual({
      mode: 'resolve',
      ids: [3],
      actor: 'lead@example.test',
    });
  });
  it('ошибки аргументов', () => {
    expect(() => parseArgs(['--status=closed'])).toThrow(/--status/);
    expect(() => parseArgs(['--apply'])).toThrow(/Неизвестные аргументы/);
    expect(() => parseArgs(['--resolve='])).toThrow(/без id/);
    expect(() => parseArgs(['--resolve=12,abc,0'])).toThrow(/abc, 0/);
    expect(() => parseArgs(['--resolve=12', '--json'])).toThrow(/не сочетается/);
    expect(() => parseArgs(['--actor=a@example.test'])).toThrow(/только вместе с --resolve/);
  });
});

describe('formatMoscowDateTime', () => {
  it('время по Москве', () => {
    expect(formatMoscowDateTime('2026-10-01T11:03:00.000Z')).toBe('01.10.2026 14:03 МСК');
  });
});

describe('anchorSummary', () => {
  it('точка: координаты на странице и ширина окна', () => {
    expect(anchorSummary({ kind: 'point', abs: { x: 10.4, y: 20.6 }, viewportW: 1440 })).toBe(
      'точка · на странице 10, 21 px · окно 1440 px',
    );
  });
  it('рамка: селектор, фрагмент, доли в элементе и размеры', () => {
    expect(
      anchorSummary({
        kind: 'rect',
        selector: 'main .card',
        snippet: 'Средний\n  прирост',
        rel: { x: 0.1, y: 0.25, w: 0.5, h: 0.333 },
        abs: { x: 100, y: 200, w: 240, h: 80 },
        viewportW: 1280,
      }),
    ).toBe(
      'рамка · `main .card` · «Средний прирост» · в элементе 10%, 25%, 50%×33% · на странице 100, 200, 240×80 px · окно 1280 px',
    );
  });
  it('место в поп-апе — подпись после вида отметки', () => {
    expect(
      anchorSummary({
        kind: 'point',
        selector: '[data-comment-anchor="popup-360"]',
        abs: { x: 1, y: 2 },
        viewportW: 1440,
        context: { label: 'Поп-ап: Саша Тимкина' },
      }),
    ).toBe('точка · Поп-ап: Саша Тимкина · `[data-comment-anchor="popup-360"]` · на странице 1, 2 px · окно 1440 px');
  });
  it('обратная кавычка в селекторе не ломает Markdown; нет якоря — так и пишем', () => {
    expect(anchorSummary({ kind: 'point', selector: 'a[title="`x`"]', abs: { x: 0, y: 0 }, viewportW: 0 })).toContain(
      '`` a[title="`x`"] ``',
    );
    expect(anchorSummary(null)).toBe('место не сохранилось');
  });
});

describe('formatMarkdown', () => {
  it('группирует по страницам (по алфавиту), внутри — по времени', () => {
    const md = formatMarkdown(
      [
        thread({ id: 3, path: '/admin/users', createdAt: '2026-10-01T10:00:00.000Z' }),
        thread({ id: 2, path: '/admin/economics', createdAt: '2026-10-01T12:00:00.000Z' }),
        thread({ id: 1, path: '/admin/users', createdAt: '2026-10-01T09:00:00.000Z' }),
      ],
      'open',
    );
    expect(md.startsWith('# Комментарии к интерфейсу — открытые: 3 (страниц: 2)\n')).toBe(true);
    const order = ['## `/admin/economics`', '### #2', '## `/admin/users`', '### #1', '### #3'].map((s) => md.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('тред: id, автор, дата, версия, место, текст цитатой и ответы', () => {
    const md = formatMarkdown(
      [
        thread({
          id: 7,
          text: 'Чип наезжает на имя\n\nи ещё строка',
          appVersion: null,
          replies: [
            {
              id: 8,
              text: 'Поправил\nв 0.74.2',
              author: admin,
              createdAt: '2026-10-01T10:30:00.000Z',
              updatedAt: '2026-10-01T10:30:00.000Z',
            },
          ],
        }),
      ],
      'open',
    );
    expect(md).toContain(
      [
        '### #7 · открыт',
        '',
        '- Автор: Лид Выдуманный · 01.10.2026 12:00 МСК · версия неизвестна',
        '- Место: точка · на странице 10, 20 px · окно 1440 px',
        '',
        '> Чип наезжает на имя',
        '>',
        '> и ещё строка',
        '',
        'Ответы (1):',
        '',
        '- #8 Админ Выдуманный, 01.10.2026 13:30 МСК: Поправил',
        '  в 0.74.2',
      ].join('\n'),
    );
  });

  it('решённый тред — кто и когда закрыл', () => {
    const md = formatMarkdown(
      [thread({ id: 4, status: 'resolved', resolvedBy: { id: 1, fullName: 'Админ Выдуманный' }, resolvedAt: '2026-10-02T07:00:00.000Z' })],
      'resolved',
    );
    expect(md).toContain('# Комментарии к интерфейсу — решённые: 1 (страниц: 1)');
    expect(md).toContain('### #4 · решён · Админ Выдуманный, 02.10.2026 10:00 МСК');
    expect(md).toContain('v0.74.1');
  });

  it('пусто — так и пишем', () => {
    expect(formatMarkdown([], 'all')).toBe('# Комментарии к интерфейсу — все: 0 (страниц: 0)\n\nКомментариев нет.\n');
  });
});

describe('отметка «решено»', () => {
  const rows = [
    { id: 1, parentId: null, status: 'open', updatedAt: new Date('2026-10-01T09:00:00.000Z') },
    { id: 2, parentId: 1, status: 'open', updatedAt: new Date('2026-10-01T09:10:00.000Z') },
    { id: 3, parentId: null, status: 'resolved', updatedAt: new Date('2026-10-01T09:20:00.000Z') },
    { id: 4, parentId: null, status: 'open', updatedAt: new Date('2026-10-01T09:30:00.000Z') },
  ];

  it('planResolve: только открытые корни, остальное — по полочкам', () => {
    expect(planResolve([4, 1, 2, 3, 99], rows)).toEqual({
      resolve: [4, 1],
      notFound: [99],
      replies: [2],
      alreadyResolved: [3],
    });
  });

  it('applyResolve: условие open в записи, кто и когда закрыл, updatedAt прежний', async () => {
    const updateMany = vi.fn((args: unknown) => args);
    const $transaction = vi.fn(async (ops: unknown[]) => ops.map((_, i) => ({ count: i === 0 ? 1 : 0 })));
    const db = { uiComment: { updateMany }, $transaction } as unknown as PrismaClient;
    const now = new Date('2026-10-02T08:00:00.000Z');
    const plan = planResolve([1, 4], rows);

    const count = await applyResolve(plan, rows, 5, db, now);

    expect(count).toBe(1);
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls.map((c) => c[0])).toEqual([
      {
        where: { id: 1, parentId: null, status: 'open' },
        data: { status: 'resolved', resolvedById: 5, resolvedAt: now, updatedAt: rows[0].updatedAt },
      },
      {
        where: { id: 4, parentId: null, status: 'open' },
        data: { status: 'resolved', resolvedById: 5, resolvedAt: now, updatedAt: rows[3].updatedAt },
      },
    ]);
  });

  it('applyResolve: закрывать нечего — в базу не ходит', async () => {
    const $transaction = vi.fn();
    const db = { uiComment: { updateMany: vi.fn() }, $transaction } as unknown as PrismaClient;
    expect(await applyResolve(planResolve([3], rows), rows, 5, db)).toBe(0);
    expect($transaction).not.toHaveBeenCalled();
  });

  it('отчёт', () => {
    const plan = planResolve([4, 1, 2, 3, 99], rows);
    expect(formatResolveReport(plan, 1)).toBe(
      [
        'Отмечено решёнными: 1 из 2 (#4, #1)',
        'Не отмечено 1: успели закрыть или удалить, пока шёл скрипт',
        'Уже решены: #3',
        'Это ответы, а не треды — статус есть только у треда: #2',
        'Не найдены: #99',
      ].join('\n'),
    );
    expect(formatResolveReport(planResolve([], rows), 0)).toBe('Отмечено решёнными: 0');
  });
});
