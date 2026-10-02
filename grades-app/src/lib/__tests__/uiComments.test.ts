import { describe, expect, it } from 'vitest';
import {
  APP_VERSION,
  UI_COMMENT_LIMITS,
  UI_COMMENT_THREAD_SELECT,
  canDeleteUiComment,
  canEditUiCommentText,
  canUseUiComments,
  firstIssueMessage,
  isUiCommentOnPage,
  isUiCommentPopupPath,
  normalizeUiCommentPath,
  sameUiCommentPath,
  toCommentDto,
  toReplyDto,
  uiCommentAnchorSchema,
  uiCommentCreateSchema,
  uiCommentPageOf,
  uiCommentPageSchema,
  uiCommentPatchSchema,
  uiCommentPathSchema,
  uiCommentPlaceHref,
  uiCommentPopupPrefix,
  uiCommentReplySchema,
  uiCommentTextSchema,
  uiCommentThreadsWhere,
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
  it('отрезает hash и пробелы; параметры, которые не меняют место, — тоже', () => {
    expect(normalizeUiCommentPath('/admin/users#top')).toBe('/admin/users');
    expect(uiCommentPathSchema.parse('  /admin/users?view=kanban#x ')).toBe('/admin/users');
    expect(uiCommentPathSchema.parse('/')).toBe('/');
    // У страницы без списка параметров search уходит весь, «?» — тоже
    expect(normalizeUiCommentPath('/admin/economics?year=2026&tab=fot')).toBe('/admin/economics');
    expect(normalizeUiCommentPath('/admin/users?')).toBe('/admin/users');
  });

  it('чей поп-ап 360 — остаётся, остальное состояние интерфейса — нет', () => {
    expect(normalizeUiCommentPath('/admin/users?person=5')).toBe('/admin/users?person=5');
    expect(normalizeUiCommentPath('/admin/users?q=лиза&person=5&scope=mine#comment-3')).toBe('/admin/users?person=5');
    // Не id — как будто параметра нет
    for (const bad of ['0', '-1', '05', '5.0', 'abc', '', '1e3']) {
      expect(normalizeUiCommentPath(`/admin/users?person=${bad}`), bad).toBe('/admin/users');
    }
  });

  it('чья страница (портрет, оценка, 360-опрос) — остаётся; режимы вроде ?new=1 — нет', () => {
    expect(normalizeUiCommentPath('/lead/portrait?assessmentId=3&id=5')).toBe('/lead/portrait?id=5');
    expect(normalizeUiCommentPath('/lead/assess?id=7&new=1')).toBe('/lead/assess?id=7');
    expect(normalizeUiCommentPath('/admin/lead-reviews?userId=40')).toBe('/admin/lead-reviews?userId=40');
    expect(normalizeUiCommentPath('/admin/lead-reviews/new?userId=40')).toBe('/admin/lead-reviews/new?userId=40');
    // Параметр чужой страницы — не в счёт
    expect(normalizeUiCommentPath('/lead/portrait?person=5')).toBe('/lead/portrait');
  });

  it('страница пути — без поп-апов; путь поп-апа — по popup-параметру', () => {
    expect(uiCommentPageOf('/admin/users?person=5')).toBe('/admin/users');
    expect(uiCommentPageOf('/admin/users?view=x#y')).toBe('/admin/users');
    // id портрета — сама страница, не поп-ап
    expect(uiCommentPageOf('/lead/portrait?id=5&assessmentId=3')).toBe('/lead/portrait?id=5');
    expect(isUiCommentPopupPath('/admin/users?person=5')).toBe(true);
    expect(isUiCommentPopupPath('/admin/users')).toBe(false);
    expect(isUiCommentPopupPath('/admin/users?person=abc')).toBe(false);
    expect(isUiCommentPopupPath('/lead/portrait?id=5')).toBe(false);
    expect(uiCommentPopupPrefix('/admin/users')).toBe('/admin/users?');
    expect(uiCommentPopupPrefix('/lead/portrait?id=5')).toBe('/lead/portrait?id=5&');
  });

  it('одно и то же место — после нормализации', () => {
    expect(sameUiCommentPath('/admin/users?person=5&q=x', '/admin/users?person=5')).toBe(true);
    expect(sameUiCommentPath('/admin/users?person=5', '/admin/users?person=50')).toBe(false);
    expect(sameUiCommentPath('/admin/users?person=5', '/admin/users')).toBe(false);
  });

  it('адрес места на той же странице: меняется только чей поп-ап', () => {
    expect(uiCommentPlaceHref('/admin/users?person=5', '/admin/users?person=7')).toBe('/admin/users?person=7');
    expect(uiCommentPlaceHref('/admin/users', '/admin/users?person=7')).toBe('/admin/users?person=7');
    // Тред самой страницы — поп-ап закрыть; прочие параметры и не трогаем, hash уходит
    expect(uiCommentPlaceHref('http://grades.local/admin/users?x=1&person=5#comment-3', '/admin/users')).toBe(
      '/admin/users?x=1',
    );
  });

  it('GET ?page= — страница без поп-апов, та же проверка, что у пути', () => {
    expect(uiCommentPageSchema.parse('/admin/users?person=5')).toBe('/admin/users');
    expect(uiCommentPageSchema.parse('/admin/users')).toBe('/admin/users');
    expect(uiCommentPageSchema.safeParse('//evil.example').success).toBe(false);
    expect(uiCommentPageSchema.safeParse(undefined).success).toBe(false);
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

  it('место внутри страницы: подпись поп-апа хранится, пустая — нет', () => {
    const label = 'Поп-ап: Саша Тимкина';
    expect(uiCommentAnchorSchema.parse({ ...rect, context: { label: `  ${label} `, extra: 1 } })).toEqual({
      ...rect,
      context: { label },
    });
    expect(uiCommentAnchorSchema.parse({ ...point, context: {} })).not.toHaveProperty('context');
    expect(uiCommentAnchorSchema.parse({ ...point, context: { label: '   ' } })).not.toHaveProperty('context');
    expect(
      uiCommentAnchorSchema.safeParse({ ...point, context: { label: 'я'.repeat(UI_COMMENT_LIMITS.contextLabelMax) } })
        .success,
    ).toBe(true);
    for (const bad of [
      { ...point, context: { label: 'я'.repeat(UI_COMMENT_LIMITS.contextLabelMax + 1) } },
      { ...point, context: 'Поп-ап' },
      { ...point, context: { label: 42 } },
    ]) {
      expect(uiCommentAnchorSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
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

describe('выборка тредов', () => {
  it('page — страница и её поп-апы; path — ровно путь; scope=all — всё; статус — фильтр', () => {
    expect(uiCommentThreadsWhere({ page: '/admin/users' })).toEqual({
      parentId: null,
      OR: [{ path: '/admin/users' }, { path: { startsWith: '/admin/users?' } }],
    });
    expect(uiCommentThreadsWhere({ page: '/lead/portrait?id=5', status: 'open' })).toEqual({
      parentId: null,
      OR: [{ path: '/lead/portrait?id=5' }, { path: { startsWith: '/lead/portrait?id=5&' } }],
      status: 'open',
    });
    expect(uiCommentThreadsWhere({ path: '/admin/users?person=5' })).toEqual({
      parentId: null,
      path: '/admin/users?person=5',
    });
    expect(uiCommentThreadsWhere({ scope: 'all', status: 'resolved' })).toEqual({ parentId: null, status: 'resolved' });
  });

  it('добивка к LIKE: только своя страница, старые пути — после нормализации', () => {
    expect(isUiCommentOnPage('/admin/users', '/admin/users')).toBe(true);
    expect(isUiCommentOnPage('/admin/users?person=5', '/admin/users')).toBe(true);
    expect(isUiCommentOnPage('/admin/users?view=kanban', '/admin/users')).toBe(true);
    // «_» в LIKE — любой символ: 'page_x?%' совпал бы и с pageZx?…
    expect(isUiCommentOnPage('/admin/pageZx?a=1', '/admin/page_x')).toBe(false);
    expect(isUiCommentOnPage('/admin/usersX', '/admin/users')).toBe(false);
    expect(isUiCommentOnPage('/lead/portrait?id=50', '/lead/portrait?id=5')).toBe(false);
    expect(isUiCommentOnPage('/lead/portrait?id=5&assessmentId=3', '/lead/portrait?id=5')).toBe(true);
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
        'screenshot',
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

  it('снимок: ссылка с версией и размер; байты наружу не уходят', () => {
    // Как если бы кто-то добавил screenshot в select: в DTO его быть не должно
    const bytes = Buffer.from('RIFF\0\0\0\0WEBPVP8 secret-bytes');
    const dto = toCommentDto({ ...row, screenshot: bytes, screenshotW: 960, screenshotH: 640 } as UiCommentThreadRow);
    expect(dto.screenshot).toEqual({ url: '/api/ui-comments/7/screenshot?v=960x640', w: 960, h: 640 });
    const json = JSON.stringify(dto);
    expect(json).not.toContain('secret-bytes');
    expect(json).not.toContain(bytes.toString('base64'));
  });

  it('снимка нет — null (старый тред или размер не записан)', () => {
    expect(toCommentDto(row as UiCommentThreadRow).screenshot).toBeNull();
    expect(toCommentDto({ ...row, screenshotW: 960, screenshotH: null } as UiCommentThreadRow).screenshot).toBeNull();
  });

  it('селект треда читает размер снимка, но не байты', () => {
    expect(UI_COMMENT_THREAD_SELECT).toMatchObject({ screenshotW: true, screenshotH: true });
    expect(Object.keys(UI_COMMENT_THREAD_SELECT)).not.toContain('screenshot');
    expect(Object.keys(UI_COMMENT_THREAD_SELECT.replies.select)).not.toContain('screenshot');
  });

  it('ответ отдельно — та же форма, что в replies', () => {
    expect(toReplyDto(row.replies[0])).toEqual(toCommentDto(row as UiCommentThreadRow).replies[0]);
  });

  it('версия приложения известна', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
