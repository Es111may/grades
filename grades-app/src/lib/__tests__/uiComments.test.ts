import { describe, expect, it } from 'vitest';
import {
  APP_VERSION,
  UI_COMMENT_LIMITS,
  canDeleteUiComment,
  canEditUiCommentText,
  canUseUiComments,
  firstIssueMessage,
  normalizeUiCommentPath,
  toCommentDto,
  toReplyDto,
  uiCommentAnchorSchema,
  uiCommentCreateSchema,
  uiCommentPatchSchema,
  uiCommentPathSchema,
  uiCommentReplySchema,
  uiCommentTextSchema,
  uiCommentsAccessError,
  type UiCommentThreadRow,
} from '../uiComments';

// Все люди, тексты и картинки выдуманы.
const admin = { id: 1, role: 'admin' };
const lead = { id: 10, role: 'lead' };
const otherLead = { id: 11, role: 'lead' };
const stardiz = { id: 20, role: 'stardiz' };
const designer = { id: 30, role: 'designer' };

describe('права', () => {
  it('комментарии — только админ и лиды', () => {
    expect(canUseUiComments(admin)).toBe(true);
    expect(canUseUiComments(lead)).toBe(true);
    expect(canUseUiComments(stardiz)).toBe(false);
    expect(canUseUiComments(designer)).toBe(false);
    expect(canUseUiComments(null)).toBe(false);
    expect(canUseUiComments(undefined)).toBe(false);
  });

  it('отказ для роутов: без входа 401, чужая роль 403', () => {
    expect(uiCommentsAccessError(null)?.status).toBe(401);
    expect(uiCommentsAccessError(designer)?.status).toBe(403);
    expect(uiCommentsAccessError(stardiz)?.status).toBe(403);
    expect(uiCommentsAccessError(lead)).toBeNull();
    expect(uiCommentsAccessError(admin)).toBeNull();
  });

  it('удалить — автор или админ', () => {
    const byLead = { authorId: lead.id };
    expect(canDeleteUiComment(lead, byLead)).toBe(true);
    expect(canDeleteUiComment(otherLead, byLead)).toBe(false);
    expect(canDeleteUiComment(admin, byLead)).toBe(true);
    expect(canDeleteUiComment(null, byLead)).toBe(false);
  });

  it('автор, которого понизили до дизайнера, своё уже не удалит и не поправит', () => {
    const own = { authorId: designer.id };
    expect(canDeleteUiComment(designer, own)).toBe(false);
    expect(canEditUiCommentText(designer, own)).toBe(false);
  });

  it('текст — только автор, даже админ чужой не правит', () => {
    const byLead = { authorId: lead.id };
    expect(canEditUiCommentText(lead, byLead)).toBe(true);
    expect(canEditUiCommentText(admin, byLead)).toBe(false);
    expect(canEditUiCommentText(otherLead, byLead)).toBe(false);
    expect(canEditUiCommentText(admin, { authorId: admin.id })).toBe(true);
  });

  it('принимает и DTO с клиента (author.id)', () => {
    const dto = { author: { id: lead.id } };
    expect(canEditUiCommentText(lead, dto)).toBe(true);
    expect(canDeleteUiComment(otherLead, dto)).toBe(false);
    expect(canDeleteUiComment(admin, dto)).toBe(true);
  });
});

describe('путь страницы', () => {
  it('отрезает hash и пробелы, search оставляет', () => {
    expect(normalizeUiCommentPath('/admin/users#top')).toBe('/admin/users');
    expect(uiCommentPathSchema.parse('  /admin/users?view=kanban#x ')).toBe('/admin/users?view=kanban');
    expect(uiCommentPathSchema.parse('/')).toBe('/');
  });

  it('не путь внутри сервиса — ошибка', () => {
    for (const bad of ['admin/users', '', '#/admin', '//evil.example', 'https://evil.example/a']) {
      expect(uiCommentPathSchema.safeParse(bad).success, bad).toBe(false);
    }
    expect(uiCommentPathSchema.safeParse(undefined).success).toBe(false);
    expect(uiCommentPathSchema.safeParse(42).success).toBe(false);
  });

  it('предел длины — после того, как отрезали hash', () => {
    const long = '/' + 'a'.repeat(UI_COMMENT_LIMITS.pathMax - 1);
    expect(uiCommentPathSchema.safeParse(long).success).toBe(true);
    expect(uiCommentPathSchema.safeParse(long + '#' + 'h'.repeat(100)).success).toBe(true);
    expect(uiCommentPathSchema.safeParse(long + 'b').success).toBe(false);
  });
});

describe('текст', () => {
  it('обрезает пробелы по краям', () => {
    expect(uiCommentTextSchema.parse('  Сдвинуть кнопку  \n')).toBe('Сдвинуть кнопку');
  });
  it('пустой и из одних пробелов — ошибка с понятным текстом', () => {
    const r = uiCommentTextSchema.safeParse('   \n ');
    expect(r.success).toBe(false);
    if (!r.success) expect(firstIssueMessage(r.error)).toBe('Комментарий пустой');
  });
  it('2000 символов можно, 2001 — нет', () => {
    expect(uiCommentTextSchema.safeParse('я'.repeat(2000)).success).toBe(true);
    const r = uiCommentTextSchema.safeParse('я'.repeat(2001));
    expect(r.success).toBe(false);
    if (!r.success) expect(firstIssueMessage(r.error)).toMatch(/длиннее 2000/);
  });
});

describe('якорь', () => {
  const point = { kind: 'point', abs: { x: 120.4, y: 340 }, viewportW: 1440 };
  const rect = {
    kind: 'rect',
    selector: 'main > section:nth-of-type(2) .card',
    rel: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 },
    abs: { x: 100, y: 200, w: 240, h: 80 },
    viewportW: 1440,
    snippet: 'Средний прирост',
  };

  it('точка: лишние ключи, размеры и пустые строки не сохраняются', () => {
    const parsed = uiCommentAnchorSchema.parse({
      ...point,
      abs: { x: 120.4, y: 340, w: 10, h: 10 },
      rel: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 },
      selector: '  ',
      snippet: '',
      color: 'red',
    });
    expect(parsed).toEqual({ kind: 'point', abs: { x: 120.4, y: 340 }, rel: { x: 0.5, y: 0.5 }, viewportW: 1440 });
    expect(Object.keys(parsed)).not.toContain('selector');
    expect(Object.keys(parsed)).not.toContain('snippet');
  });

  it('рамка проходит целиком', () => {
    expect(uiCommentAnchorSchema.parse(rect)).toEqual(rect);
  });

  it('у рамки без размеров — ошибка', () => {
    expect(uiCommentAnchorSchema.safeParse({ ...rect, abs: { x: 1, y: 2 } }).success).toBe(false);
    expect(uiCommentAnchorSchema.safeParse({ ...rect, rel: { x: 0.1, y: 0.1 } }).success).toBe(false);
  });

  it('битые якоря — ошибка', () => {
    const bad: unknown[] = [
      null,
      'point',
      { ...point, kind: 'circle' },
      { ...point, abs: undefined },
      { ...point, abs: { x: '1', y: 2 } },
      { ...point, abs: { x: Infinity, y: 2 } },
      { ...point, abs: { x: 1e7, y: 2 } },
      { ...rect, abs: { x: 1, y: 2, w: -5, h: 10 } },
      { ...point, rel: { x: 1.5, y: 0 } },
      { ...point, rel: { x: -0.1, y: 0 } },
      { ...point, viewportW: 1440.5 },
      { ...point, viewportW: 20_000 },
      { ...point, viewportW: undefined },
      { ...point, selector: 'a'.repeat(UI_COMMENT_LIMITS.selectorMax + 1) },
      { ...point, snippet: 'б'.repeat(UI_COMMENT_LIMITS.snippetMax + 1) },
    ];
    for (const a of bad) expect(uiCommentAnchorSchema.safeParse(a).success, JSON.stringify(a)).toBe(false);
  });

  it('селектор и фрагмент на пределе — можно', () => {
    const ok = {
      ...point,
      selector: 'a'.repeat(UI_COMMENT_LIMITS.selectorMax),
      snippet: 'б'.repeat(UI_COMMENT_LIMITS.snippetMax),
    };
    expect(uiCommentAnchorSchema.safeParse(ok).success).toBe(true);
  });

  it('без якоря новый тред не создать', () => {
    const r = uiCommentCreateSchema.safeParse({ path: '/admin/users', text: 'Текст' });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstIssueMessage(r.error)).toBe('Не указано место комментария');
  });
});

describe('тела запросов', () => {
  it('новый тред: путь нормализован, текст обрезан', () => {
    const r = uiCommentCreateSchema.parse({
      path: '/admin/economics#fot',
      anchor: { kind: 'point', abs: { x: 1, y: 2 }, viewportW: 1280 },
      text: ' Подпись съехала ',
    });
    expect(r.path).toBe('/admin/economics');
    expect(r.text).toBe('Подпись съехала');
  });

  it('ответ: parentId — целое > 0', () => {
    expect(uiCommentReplySchema.safeParse({ parentId: 5, text: 'Ок' }).success).toBe(true);
    for (const parentId of [0, -1, 1.5, '5']) {
      expect(uiCommentReplySchema.safeParse({ parentId, text: 'Ок' }).success, String(parentId)).toBe(false);
    }
  });

  it('правка: нужен text или status, статус — open/resolved', () => {
    expect(uiCommentPatchSchema.safeParse({}).success).toBe(false);
    expect(uiCommentPatchSchema.safeParse({ status: 'closed' }).success).toBe(false);
    expect(uiCommentPatchSchema.safeParse({ text: '  ' }).success).toBe(false);
    expect(uiCommentPatchSchema.parse({ status: 'resolved' })).toEqual({ status: 'resolved' });
    expect(uiCommentPatchSchema.parse({ text: ' Новый ', status: 'open' })).toEqual({ text: 'Новый', status: 'open' });
  });
});

describe('DTO', () => {
  // Лишние поля в строке — как если бы кто-то расширил select: в ответ они
  // попасть не должны. Аватар — data URL, наружу — только ссылка.
  const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ';
  const row = {
    id: 7,
    path: '/admin/users',
    anchor: { kind: 'point', abs: { x: 10, y: 20 }, viewportW: 1440, extra: 'x' },
    text: 'Чип наезжает на имя',
    status: 'resolved',
    appVersion: '0.74.1',
    createdAt: new Date('2026-10-01T11:00:00.000Z'),
    updatedAt: new Date('2026-10-01T11:05:00.000Z'),
    resolvedAt: new Date('2026-10-01T12:00:00.000Z'),
    authorId: 10,
    parentId: null,
    resolvedById: 1,
    author: { id: 10, fullName: 'Лид Выдуманный', avatarUrl: DATA_URL, email: 'lead@example.test', passwordHash: 'h' },
    resolvedBy: { id: 1, fullName: 'Админ Выдуманный', email: 'admin@example.test' },
    replies: [
      {
        id: 8,
        text: 'Поправил',
        createdAt: new Date('2026-10-01T11:30:00.000Z'),
        updatedAt: new Date('2026-10-01T11:30:00.000Z'),
        path: '/admin/users',
        authorId: 1,
        author: { id: 1, fullName: 'Админ Выдуманный', avatarUrl: null, role: 'admin' },
      },
    ],
  };

  it('ровно поля из контракта, без лишних', () => {
    const dto = toCommentDto(row as UiCommentThreadRow);
    expect(Object.keys(dto).sort()).toEqual(
      [
        'anchor',
        'appVersion',
        'author',
        'createdAt',
        'id',
        'path',
        'replies',
        'resolvedAt',
        'resolvedBy',
        'status',
        'text',
        'updatedAt',
      ].sort(),
    );
    expect(Object.keys(dto.author).sort()).toEqual(['avatarUrl', 'fullName', 'id']);
    expect(Object.keys(dto.resolvedBy!).sort()).toEqual(['fullName', 'id']);
    expect(Object.keys(dto.replies[0]).sort()).toEqual(['author', 'createdAt', 'id', 'text', 'updatedAt']);
    expect(Object.keys(dto.replies[0].author).sort()).toEqual(['avatarUrl', 'fullName', 'id']);
    expect(Object.keys(dto.anchor!)).not.toContain('extra');
    const json = JSON.stringify(dto);
    expect(json).not.toContain('data:image');
    expect(json).not.toContain('@example.test');
    expect(json).not.toContain('passwordHash');
  });

  it('значения: даты ISO, аватар ссылкой 48 px, кто закрыл', () => {
    const dto = toCommentDto(row as UiCommentThreadRow);
    expect(dto).toMatchObject({
      id: 7,
      path: '/admin/users',
      anchor: { kind: 'point', abs: { x: 10, y: 20 }, viewportW: 1440 },
      text: 'Чип наезжает на имя',
      status: 'resolved',
      createdAt: '2026-10-01T11:00:00.000Z',
      updatedAt: '2026-10-01T11:05:00.000Z',
      resolvedAt: '2026-10-01T12:00:00.000Z',
      resolvedBy: { id: 1, fullName: 'Админ Выдуманный' },
      appVersion: '0.74.1',
    });
    expect(dto.author.avatarUrl).toMatch(/^\/api\/avatar\/10\?v=[0-9a-f]{10}&s=48$/);
    expect(dto.replies).toEqual([
      {
        id: 8,
        text: 'Поправил',
        author: { id: 1, fullName: 'Админ Выдуманный', avatarUrl: null },
        createdAt: '2026-10-01T11:30:00.000Z',
        updatedAt: '2026-10-01T11:30:00.000Z',
      },
    ]);
  });

  it('открытый тред: resolvedBy/resolvedAt — null; битый якорь и чужой статус не ломают ответ', () => {
    const dto = toCommentDto({
      ...row,
      anchor: { kind: 'circle' },
      status: 'weird',
      resolvedAt: null,
      resolvedBy: null,
      appVersion: null,
      replies: [],
    } as UiCommentThreadRow);
    expect(dto.anchor).toBeNull();
    expect(dto.status).toBe('open');
    expect(dto.resolvedAt).toBeNull();
    expect(dto.resolvedBy).toBeNull();
    expect(dto.appVersion).toBeNull();
    expect(dto.replies).toEqual([]);
  });

  it('ответ отдельно — та же форма, что в replies', () => {
    expect(toReplyDto(row.replies[0])).toEqual(toCommentDto(row as UiCommentThreadRow).replies[0]);
  });

  it('версия приложения известна', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
