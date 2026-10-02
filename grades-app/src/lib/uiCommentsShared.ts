// Комментарии к интерфейсу «как в Figma» — часть, общая для клиента и
// сервера (без node-модулей): типы ответа API, пределы, схемы проверки тела
// запросов и права. Серверная часть (DTO из строки БД, аватары, версия
// приложения) — lib/uiComments, она тянет node:crypto через lib/avatar.
//
// Права (решение планировщика): видят и пишут только админ и лиды. Текст
// правит только автор, удаляет автор или админ, «решено» ставит и снимает
// любой админ или лид. Стардиз и дизайнер комментариев не видят вовсе.

import { z } from 'zod';
import { PERSON_ID_RE, PERSON_PARAM } from './personParam';

// ── Пределы ──────────────────────────────────────────────────────────────

export const UI_COMMENT_LIMITS = {
  /** Текст комментария или ответа, символов после trim. */
  textMax: 2000,
  /** CSS-селектор элемента-якоря. Не обрезаем: обрезанный селектор не найдёт элемент. */
  selectorMax: 600,
  /** Начало текста элемента-якоря — клиент режет сам до этой длины. */
  snippetMax: 200,
  /** pathname + параметры места (normalizeUiCommentPath), без hash. */
  pathMax: 500,
  /** Ширина окна в момент комментария, px. */
  viewportMax: 10_000,
  /** Модуль абсолютных координат, px: дальше этого страница не бывает. */
  absMax: 100_000,
  /** Подпись места внутри страницы («Поп-ап: Саша Тимкина»), символов. */
  contextLabelMax: 120,
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
  /**
   * Где внутри страницы: поп-ап, модалка. label — для людей и выгрузки
   * («Поп-ап: Саша Тимкина»); чей поп-ап — по параметру в path.
   */
  context?: { label?: string };
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

// ── Путь страницы ────────────────────────────────────────────────────────

/** Параметр адреса, который входит в место комментария. */
type PathParam = {
  /** Допустимое значение; другое — параметра как будто нет. */
  re: RegExp;
  /**
   * Место внутри страницы, а не другая страница: поп-ап 360 на «Команде».
   * Список «Эта страница» показывает треды страницы вместе с её поп-апами;
   * метки — только того места, что открыто сейчас.
   */
  popup?: true;
};

/**
 * Какие параметры адреса — часть места комментария, по страницам (ключ —
 * pathname). Всё остальное в search — состояние интерфейса (вкладка,
 * фильтр, ?new=1): в путь не попадает, иначе замечание видно только при том
 * же фильтре. Страницы нет в списке — параметров у неё нет вовсе.
 *
 * Сюда — только то, что меняет содержимое: чей поп-ап 360 открыт (?person=,
 * popup) и чья это страница — портрет, оценка, 360-опрос лида (id человека:
 * без него комментарии про разных людей слились бы). Порядок важен: в пути
 * параметры идут в порядке списка, popup — последними (по префиксу без них
 * API находит поп-апы страницы).
 */
export const UI_COMMENT_PATH_PARAMS: Readonly<Record<string, Readonly<Record<string, PathParam>>>> = {
  '/admin/users': { [PERSON_PARAM]: { re: PERSON_ID_RE, popup: true } },
  '/admin/lead-reviews': { userId: { re: PERSON_ID_RE } },
  '/admin/lead-reviews/new': { userId: { re: PERSON_ID_RE } },
  '/lead/portrait': { id: { re: PERSON_ID_RE } },
  '/lead/assess': { id: { re: PERSON_ID_RE } },
};

function splitPath(raw: string): { pathname: string; params: [string, string, PathParam][] } {
  const hash = raw.indexOf('#');
  const s = (hash === -1 ? raw : raw.slice(0, hash)).trim();
  const q = s.indexOf('?');
  const pathname = q === -1 ? s : s.slice(0, q);
  const allowed = UI_COMMENT_PATH_PARAMS[pathname];
  if (q === -1 || !allowed) return { pathname, params: [] };
  const search = new URLSearchParams(s.slice(q + 1));
  const params: [string, string, PathParam][] = [];
  for (const [key, rule] of Object.entries(allowed)) {
    const v = search.get(key);
    if (v !== null && rule.re.test(v)) params.push([key, v, rule]);
  }
  return { pathname, params };
}

function joinPath(pathname: string, params: [string, string, PathParam][]): string {
  if (!params.length) return pathname;
  const q = new URLSearchParams();
  for (const [k, v] of params) q.set(k, v);
  return `${pathname}?${q.toString()}`;
}

/**
 * Путь комментария: без hash и пробелов по краям, из search — только
 * параметры из UI_COMMENT_PATH_PARAMS этой страницы с корректным значением,
 * в порядке списка. Один и тот же для клиента (путь текущей страницы) и для
 * API (запись и выборка). Проверку формы делает схема ниже.
 */
export function normalizeUiCommentPath(raw: string): string {
  const { pathname, params } = splitPath(raw);
  return joinPath(pathname, params);
}

/**
 * Страница пути — без мест внутри неё (popup-параметров):
 * /admin/users?person=5 → /admin/users, /lead/portrait?id=5 → он же.
 */
export function uiCommentPageOf(path: string): string {
  const { pathname, params } = splitPath(path);
  return joinPath(
    pathname,
    params.filter(([, , rule]) => !rule.popup),
  );
}

/** Путь ведёт в поп-ап страницы (есть popup-параметр). */
export function isUiCommentPopupPath(path: string): boolean {
  return splitPath(path).params.some(([, , rule]) => rule.popup);
}

/**
 * Префикс путей поп-апов страницы (для LIKE): «/admin/users?»,
 * «/lead/portrait?id=5&». page — уже uiCommentPageOf.
 */
export function uiCommentPopupPrefix(page: string): string {
  return `${page}${page.includes('?') ? '&' : '?'}`;
}

/**
 * Адрес, чтобы перейти к месту треда на той же странице: текущий адрес, в
 * котором popup-параметры страницы заменены параметрами из path (нет в path
 * — убраны). Остальные параметры остаются, hash — нет: это уже другое место.
 * Пример: /admin/users?person=5 + путь /admin/users?person=7 → ?person=7.
 */
export function uiCommentPlaceHref(currentHref: string, path: string): string {
  const url = new URL(currentHref, 'http://local');
  const { pathname, params } = splitPath(path);
  const rules = UI_COMMENT_PATH_PARAMS[pathname] ?? {};
  for (const [key, rule] of Object.entries(rules)) if (rule.popup) url.searchParams.delete(key);
  for (const [key, value, rule] of params) if (rule.popup) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

/** Один и тот же путь после нормализации (в БД бывают и старые, до правила). */
export function sameUiCommentPath(a: string, b: string): boolean {
  return normalizeUiCommentPath(a) === normalizeUiCommentPath(b);
}

// ── Проверка тела запросов ───────────────────────────────────────────────

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

/** GET ?page= — страница без её поп-апов (uiCommentPageOf): её треды и треды поп-апов. */
export const uiCommentPageSchema = uiCommentPathSchema.transform(uiCommentPageOf);

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
      context: z
        .object(
          {
            label: optionalText(
              UI_COMMENT_LIMITS.contextLabelMax,
              `Подпись места длиннее ${UI_COMMENT_LIMITS.contextLabelMax} символов`,
            ),
          },
          { invalid_type_error: ANCHOR_ERROR },
        )
        .optional(),
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
    // Пустой context ({} или label из пробелов) не храним
    if (a.context?.label) out.context = { label: a.context.label };
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
