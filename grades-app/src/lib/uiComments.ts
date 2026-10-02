// Комментарии к интерфейсу «как в Figma» — серверная часть: какие поля
// читать из БД и как строка превращается в ответ API. Только для сервера:
// lib/avatar тянет node:crypto. Клиентские компоненты берут типы, пределы,
// схемы и права из lib/uiCommentsShared (здесь они реэкспортированы, чтобы
// роутам и скрипту хватало одного импорта).
//
// В ответ уходят только перечисленные ниже поля: про автора — id, имя и
// ссылка на аватар (не data URL), про того, кто закрыл тред, — id и имя.

import type { Prisma } from '@prisma/client';
import pkg from '../../package.json';
import { avatarSrc } from './avatar';
import {
  isUiCommentStatus,
  uiCommentAnchorSchema,
  uiCommentPageOf,
  uiCommentPopupPrefix,
  type UiCommentAuthorDto,
  type UiCommentDto,
  type UiCommentReplyDto,
  type UiCommentStatus,
} from './uiCommentsShared';

export * from './uiCommentsShared';

/**
 * Версия приложения на момент комментария — по ней в следующей сессии видно,
 * к какой вёрстке относилось замечание. Читаем один раз при загрузке модуля:
 * npm кладёт версию в окружение (`npm run dev`, `npm start`), без npm —
 * берём из package.json.
 */
export const APP_VERSION: string | null =
  process.env.npm_package_version || (typeof pkg.version === 'string' ? pkg.version : null) || null;

/** Аватар в треде — кружок 24 px, с запасом на ретину. */
const UI_COMMENT_AVATAR_SIZE = 48;

// ── Что читаем из БД ─────────────────────────────────────────────────────

const AUTHOR_SELECT = { id: true, fullName: true, avatarUrl: true } as const;

export const UI_COMMENT_REPLY_SELECT = {
  id: true,
  text: true,
  createdAt: true,
  updatedAt: true,
  author: { select: AUTHOR_SELECT },
} as const satisfies Prisma.UiCommentSelect;

/** Тред целиком: корень, автор, кто закрыл, ответы по времени. */
export const UI_COMMENT_THREAD_SELECT = {
  id: true,
  path: true,
  anchor: true,
  text: true,
  status: true,
  appVersion: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  author: { select: AUTHOR_SELECT },
  resolvedBy: { select: { id: true, fullName: true } },
  replies: { select: UI_COMMENT_REPLY_SELECT, orderBy: { createdAt: 'asc' } },
} as const satisfies Prisma.UiCommentSelect;

// ── Какие треды отдавать ─────────────────────────────────────────────────

/**
 * Выборка тредов GET /api/ui-comments (только корни, parentId = null):
 *   page  — треды страницы и её поп-апов: path = page или
 *           path LIKE 'page?%' (поп-ап 360 — /admin/users?person=5; у
 *           страницы с id в адресе — 'page&%');
 *   path  — ровно этот путь (старый клиент, до page=);
 *   scope — все страницы.
 * Путь и страница приходят уже нормализованными (схемы lib/uiCommentsShared).
 */
export type UiCommentThreadsQuery = { status?: UiCommentStatus } & (
  | { scope: 'all' }
  | { page: string }
  | { path: string }
);

export function uiCommentThreadsWhere(q: UiCommentThreadsQuery): Prisma.UiCommentWhereInput {
  const where: Prisma.UiCommentWhereInput = { parentId: null };
  if ('page' in q) where.OR = [{ path: q.page }, { path: { startsWith: uiCommentPopupPrefix(q.page) } }];
  else if ('path' in q) where.path = q.path;
  if (q.status) where.status = q.status;
  return where;
}

/**
 * Строка БД действительно с этой страницы. Добивка к startsWith: «_» и «%»
 * в LIKE — шаблоны, а старые пути (до правила параметров) нормализуем.
 */
export function isUiCommentOnPage(path: string, page: string): boolean {
  return uiCommentPageOf(path) === page;
}

// Строки — структурно, без Prisma-типов: тесты собирают их руками, а роуты
// передают результат запроса с селектами выше (лишние поля DTO не пропустит).

type AuthorRow = { id: number; fullName: string; avatarUrl: string | null };

export type UiCommentReplyRow = {
  id: number;
  text: string;
  createdAt: Date;
  updatedAt: Date;
  author: AuthorRow;
};

export type UiCommentThreadRow = {
  id: number;
  path: string;
  anchor: unknown;
  text: string;
  status: string;
  appVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  author: AuthorRow;
  resolvedBy: { id: number; fullName: string } | null;
  replies: UiCommentReplyRow[];
};

// ── Строка → ответ API ───────────────────────────────────────────────────

function toAuthorDto(a: AuthorRow): UiCommentAuthorDto {
  return { id: a.id, fullName: a.fullName, avatarUrl: avatarSrc(a, UI_COMMENT_AVATAR_SIZE) };
}

export function toReplyDto(row: UiCommentReplyRow): UiCommentReplyDto {
  return {
    id: row.id,
    text: row.text,
    author: toAuthorDto(row.author),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCommentDto(row: UiCommentThreadRow): UiCommentDto {
  // Якорь из JSON-колонки — через ту же схему, что и при записи: клиенту
  // уходит проверенная форма без лишних ключей, битый якорь — null.
  const anchor = uiCommentAnchorSchema.safeParse(row.anchor);
  return {
    id: row.id,
    path: row.path,
    anchor: anchor.success ? anchor.data : null,
    text: row.text,
    status: isUiCommentStatus(row.status) ? row.status : 'open',
    author: toAuthorDto(row.author),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolvedBy: row.resolvedBy ? { id: row.resolvedBy.id, fullName: row.resolvedBy.fullName } : null,
    appVersion: row.appVersion,
    replies: row.replies.map(toReplyDto),
  };
}
