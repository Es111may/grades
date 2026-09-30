// Аватары — часть, общая для клиента и сервера (без node-модулей).
//
// В БД аватар хранится data URL'ом (JPEG 256×256, ~17 КБ). Клиенту его не
// шлём: в списке «Команды» это ~870 КБ на 37 человек, причём дважды (HTML +
// RSC) и без кэша. Вместо него — ссылка /api/avatar/<id>?v=<хэш>&s=<размер>
// (её строит серверный lib/avatar.ts), а картинку отдаёт роут с долгим
// кэшем браузера. Здесь — размеры, подбор размера под место на экране и
// проверка того, что приходит в PATCH/POST.

/** Размеры, которые отдаёт /api/avatar, px. */
export const AVATAR_SIZES = [48, 96, 192, 256] as const;
export type AvatarSize = (typeof AVATAR_SIZES)[number];
export const DEFAULT_AVATAR_SIZE: AvatarSize = 96;

/** Префикс ссылок на аватары — по нему Avatar узнаёт «нашу» ссылку. */
export const AVATAR_ROUTE = '/api/avatar/';

export function isAvatarSize(n: number): n is AvatarSize {
  return (AVATAR_SIZES as readonly number[]).includes(n);
}

/** Размер из query (`s`): неизвестный или пустой — по умолчанию. */
export function parseAvatarSize(raw: string | null | undefined): AvatarSize {
  const n = raw ? Number(raw) : NaN;
  return isAvatarSize(n) ? n : DEFAULT_AVATAR_SIZE;
}

/**
 * Какой размер запросить под кружок в `px` CSS-пикселей: с запасом на
 * ретину (×2), ближайший не меньше, но не больше 256 — крупнее исходника нет.
 */
export function avatarSizeFor(px: number): AvatarSize {
  const need = Math.ceil(px * 2);
  return AVATAR_SIZES.find((s) => s >= need) ?? AVATAR_SIZES[AVATAR_SIZES.length - 1];
}

/**
 * Ссылка /api/avatar с размером под `px`. Размер в ссылке от сервера — лишь
 * значение по умолчанию: одна и та же строка списка рисуется и кружком 24 px
 * в 9-Box, и 80 px в поп-апе. Чужие ссылки и data URL (превью только что
 * выбранной картинки в модалке) возвращаем как есть.
 */
export function withAvatarSize(src: string, px: number): string {
  if (!src.startsWith(AVATAR_ROUTE)) return src;
  const [path, query = ''] = src.split('?');
  const params = new URLSearchParams(query);
  params.set('s', String(avatarSizeFor(px)));
  return `${path}?${params.toString()}`;
}

// ── Что принимаем в PATCH/POST ───────────────────────────────────────────
//
// Модалка шлёт avatarUrl, только когда картинку выбрали заново (data URL)
// или удалили (null). Любую другую строку — например, ссылку /api/avatar,
// вернувшуюся из строки списка, — не сохраняем: иначе в БД вместо картинки
// окажется ссылка на саму себя.

/** Предел длины data URL, символов (~400 КБ). Клиент ужимает до ~17 КБ. */
export const AVATAR_MAX_CHARS = 400_000;

// Только растровые форматы: их и умеет ужимать модалка, а SVG нам не нужен.
const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp|gif|avif));base64,/;

export type AvatarInput =
  | { kind: 'skip' }
  | { kind: 'set'; value: string | null }
  | { kind: 'error'; error: string };

export function parseAvatarInput(raw: string | null | undefined): AvatarInput {
  if (raw === undefined) return { kind: 'skip' };
  if (raw === null) return { kind: 'set', value: null };
  if (!DATA_URL_RE.test(raw)) return { kind: 'skip' };
  if (raw.length > AVATAR_MAX_CHARS) {
    return { kind: 'error', error: 'Аватар слишком большой — нужен файл поменьше' };
  }
  return { kind: 'set', value: raw };
}

// Из БД читаем мягче, чем принимаем: старые записи могли прийти в любом
// image/* — sharp всё равно перегонит их в WebP.
const STORED_DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,/i;

/** Разбор data URL из БД: MIME и байты в base64. Не data URL — null. */
export function parseImageDataUrl(dataUrl: string): { mime: string; base64: string } | null {
  const m = STORED_DATA_URL_RE.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], base64: dataUrl.slice(m[0].length) };
}
