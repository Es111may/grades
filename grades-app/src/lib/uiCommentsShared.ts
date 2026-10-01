// Комментарии к интерфейсу «как в Figma» — часть, общая для клиента и
// сервера (без node-модулей): типы ответа API, пределы, схемы проверки тела
// запросов и права. Серверная часть (DTO из строки БД, аватары, версия
// приложения) — lib/uiComments, она тянет node:crypto через lib/avatar.
//
// Права (решение планировщика): видят и пишут только админ и лиды. Текст
// правит только автор, удаляет автор или админ, «решено» ставит и снимает
// любой админ или лид. Стардиз и дизайнер комментариев не видят вовсе.

import { z } from 'zod';

// ── Пределы ──────────────────────────────────────────────────────────────

export const UI_COMMENT_LIMITS = {
  /** Текст комментария или ответа, символов после trim. */
  textMax: 2000,
  /** CSS-селектор элемента-якоря. Не обрезаем: обрезанный селектор не найдёт элемент. */
  selectorMax: 600,
  /** Начало текста элемента-якоря — клиент режет сам до этой длины. */
  snippetMax: 200,
  /** pathname + search, без hash. */
  pathMax: 500,
  /** Ширина окна в момент комментария, px. */
  viewportMax: 10_000,
  /** Модуль абсолютных координат, px: дальше этого страница не бывает. */
  absMax: 100_000,
} as const;

// ── Типы ответа API ──────────────────────────────────────────────────────

export type UiCommentStatus = 'open' | 'resolved';
export const UI_COMMENT_STATUSES: readonly UiCommentStatus[] = ['open', 'resolved'];

export function isUiCommentStatus(v: unknown): v is UiCommentStatus {
  return v === 'open' || v === 'resolved';
}

/**
 * Место комментария. rel — доли (0…1) внутри элемента по selector: переживает
 * смену ширины окна. abs — px от левого края основного контейнера и верха
 * документа: запасной вариант, если элемент не нашёлся. У точки w/h нет, у
 * рамки — обязательны в abs (и в rel, если rel передан).
 */
export type UiCommentAnchor = {
  kind: 'point' | 'rect';
  selector?: string;
  rel?: { x: number; y: number; w?: number; h?: number };
  abs: { x: number; y: number; w?: number; h?: number };
  viewportW: number;
  snippet?: string;
};

export type UiCommentAuthorDto = { id: number; fullName: string; avatarUrl: string | null };

export type UiCommentReplyDto = {
  id: number;
  text: string;
  author: UiCommentAuthorDto;
  /** ISO 8601 */
  createdAt: string;
  updatedAt: string;
};

/** Тред: корневой комментарий с ответами (по createdAt, старые сверху). */
export type UiCommentDto = {
  id: number;
  path: string;
  /** null — запись с битым якорем в БД; клиент такой тред рисует без метки. */
  anchor: UiCommentAnchor | null;
  text: string;
  status: UiCommentStatus;
  author: UiCommentAuthorDto;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolvedBy: { id: number; fullName: string } | null;
  appVersion: string | null;
  replies: UiCommentReplyDto[];
};

// ── Права ────────────────────────────────────────────────────────────────

type Me = { id: number; role: string } | null | undefined;
/** Строка БД (authorId) или DTO с клиента (author.id) — подходят обе. */
type Authored = { authorId: number } | { author: { id: number } };

const authorIdOf = (c: Authored) => ('authorId' in c ? c.authorId : c.author.id);

/** Видеть комментарии, писать, отвечать и менять статус — админ и лиды. */
export function canUseUiComments(me: Me): boolean {
  return me?.role === 'admin' || me?.role === 'lead';
}

/** Удалить комментарий или ответ (с тредом) — автор или админ. */
export function canDeleteUiComment(me: Me, comment: Authored): boolean {
  if (!me || !canUseUiComments(me)) return false;
  return me.role === 'admin' || authorIdOf(comment) === me.id;
}

/** Править текст — только автор, даже админ чужой текст не меняет. */
export function canEditUiCommentText(me: Me, comment: Authored): boolean {
  if (!me || !canUseUiComments(me)) return false;
  return authorIdOf(comment) === me.id;
}

/** Отказ для роутов: не вошёл — 401, не админ и не лид — 403, иначе null. */
export function uiCommentsAccessError(me: Me): { status: 401 | 403; error: string } | null {
  if (!me?.id) return { status: 401, error: 'Нужно войти' };
  if (!canUseUiComments(me)) return { status: 403, error: 'Комментарии к интерфейсу — только для админа и лидов' };
  return null;
}

// ── Проверка тела запросов ───────────────────────────────────────────────

/** Путь страницы: без hash и пробелов по краям. Проверку делает схема ниже. */
export function normalizeUiCommentPath(raw: string): string {
  const hash = raw.indexOf('#');
  return (hash === -1 ? raw : raw.slice(0, hash)).trim();
}

export const uiCommentPathSchema = z
  .string({ required_error: 'Не указана страница', invalid_type_error: 'Страница — строкой' })
  .transform(normalizeUiCommentPath)
  .pipe(
    z
      .string()
      // «//host» — уже не путь внутри сервиса
      .regex(/^\/(?!\/)/, 'Путь страницы должен начинаться с «/»')
      .max(UI_COMMENT_LIMITS.pathMax, `Путь страницы длиннее ${UI_COMMENT_LIMITS.pathMax} символов`),
  );

export const uiCommentTextSchema = z
  .string({ required_error: 'Нужен текст комментария', invalid_type_error: 'Текст — строкой' })
  .trim()
  .min(1, 'Комментарий пустой')
  .max(UI_COMMENT_LIMITS.textMax, `Комментарий длиннее ${UI_COMMENT_LIMITS.textMax} символов`);

const ANCHOR_ERROR = 'Некорректное место комментария';

const fraction = z.number({ invalid_type_error: ANCHOR_ERROR }).finite().min(0, ANCHOR_ERROR).max(1, ANCHOR_ERROR);
const px = z
  .number({ invalid_type_error: ANCHOR_ERROR })
  .finite()
  .min(-UI_COMMENT_LIMITS.absMax, ANCHOR_ERROR)
  .max(UI_COMMENT_LIMITS.absMax, ANCHOR_ERROR);
// Рамку клиент нормализует: x/y — левый верхний угол, размеры не меньше нуля
const size = z
  .number({ invalid_type_error: ANCHOR_ERROR })
  .finite()
  .min(0, 'Размер рамки не может быть отрицательным')
  .max(UI_COMMENT_LIMITS.absMax, ANCHOR_ERROR);

/** Пустая строка — как будто поля нет. */
const optionalText = (max: number, message: string) =>
  z
    .string({ invalid_type_error: ANCHOR_ERROR })
    .trim()
    .max(max, message)
    .optional()
    .transform((s) => (s ? s : undefined));

export const uiCommentAnchorSchema = z
  .object(
    {
      kind: z.enum(['point', 'rect'], { errorMap: () => ({ message: 'Якорь — точка или рамка' }) }),
      selector: optionalText(
        UI_COMMENT_LIMITS.selectorMax,
        `Селектор длиннее ${UI_COMMENT_LIMITS.selectorMax} символов`,
      ),
      rel: z.object({ x: fraction, y: fraction, w: fraction.optional(), h: fraction.optional() }).optional(),
      abs: z.object({ x: px, y: px, w: size.optional(), h: size.optional() }, { required_error: ANCHOR_ERROR }),
      viewportW: z
        .number({ required_error: ANCHOR_ERROR, invalid_type_error: ANCHOR_ERROR })
        .int(ANCHOR_ERROR)
        .min(0, ANCHOR_ERROR)
        .max(UI_COMMENT_LIMITS.viewportMax, ANCHOR_ERROR),
      snippet: optionalText(UI_COMMENT_LIMITS.snippetMax, `Фрагмент текста длиннее ${UI_COMMENT_LIMITS.snippetMax} символов`),
    },
    { required_error: 'Не указано место комментария', invalid_type_error: ANCHOR_ERROR },
  )
  .superRefine((a, ctx) => {
    if (a.kind !== 'rect') return;
    if (a.abs.w === undefined || a.abs.h === undefined) {
      ctx.addIssue({ code: 'custom', message: 'У рамки нужны ширина и высота', path: ['abs'] });
    }
    if (a.rel && (a.rel.w === undefined || a.rel.h === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'У рамки нужны ширина и высота', path: ['rel'] });
    }
  })
  // Собираем заново: у точки размеров нет, пустые поля не пишем в JSON-колонку
  // и не отдаём клиенту. Неизвестные ключи zod срезал ещё раньше.
  .transform((a): UiCommentAnchor => {
    const rect = a.kind === 'rect';
    const out: UiCommentAnchor = {
      kind: a.kind,
      abs: rect ? { x: a.abs.x, y: a.abs.y, w: a.abs.w, h: a.abs.h } : { x: a.abs.x, y: a.abs.y },
      viewportW: a.viewportW,
    };
    if (a.selector) out.selector = a.selector;
    if (a.rel) out.rel = rect ? { x: a.rel.x, y: a.rel.y, w: a.rel.w, h: a.rel.h } : { x: a.rel.x, y: a.rel.y };
    if (a.snippet) out.snippet = a.snippet;
    return out;
  });

const id = z
  .number({ required_error: 'Не указан комментарий', invalid_type_error: 'Некорректный id' })
  .int('Некорректный id')
  .positive('Некорректный id');

/** POST /api/ui-comments — новый тред. */
export const uiCommentCreateSchema = z.object({
  path: uiCommentPathSchema,
  anchor: uiCommentAnchorSchema,
  text: uiCommentTextSchema,
});

/** POST /api/ui-comments — ответ в тред (anchor и path, если пришли, игнорируются). */
export const uiCommentReplySchema = z.object({
  parentId: id,
  text: uiCommentTextSchema,
});

/** PATCH /api/ui-comments/[id] — текст и/или статус. */
export const uiCommentPatchSchema = z
  .object({
    text: uiCommentTextSchema.optional(),
    status: z.enum(['open', 'resolved'], { errorMap: () => ({ message: 'Статус — open или resolved' }) }).optional(),
  })
  .refine((b) => b.text !== undefined || b.status !== undefined, { message: 'Нечего менять: нужен text или status' });

/** Первая ошибка схемы — одной строкой для { error } в ответе API. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Некорректный запрос';
}
