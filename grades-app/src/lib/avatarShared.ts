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
//
// Формат — только JPEG, PNG и WebP, и не по одной подписи MIME, а по первым
// байтам: у sharp 0.33 известная уязвимость в декодировании, поэтому до
// роута /api/avatar не должно доходить ничего, кроме этих трёх форматов.
// Модалка и так всегда перегоняет картинку в JPEG 256×256.

/** Предел длины data URL, символов (~400 КБ). Клиент ужимает до ~17 КБ. */
export const AVATAR_MAX_CHARS = 400_000;

export const AVATAR_FORMAT_ERROR = 'Аватар — только JPEG, PNG или WebP';

const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,/;

export type AvatarFormat = 'jpeg' | 'png' | 'webp';

/**
 * Формат по сигнатуре в начале файла: JPEG — FF D8 FF, PNG — 89 50 4E 47
 * 0D 0A 1A 0A, WebP — «RIFF», 4 байта длины, «WEBP». Остальное (GIF,
 * AVIF/HEIF, SVG, TIFF…) — null. По этим же байтам libvips выбирает
 * декодер, так что прочие декодеры sharp такие данные не увидят.
 */
export function sniffImageFormat(bytes: ArrayLike<number>): AvatarFormat | null {
  const has = (at: number, sig: readonly number[]) => sig.every((b, i) => bytes[at + i] === b);
  if (has(0, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (has(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (has(0, [0x52, 0x49, 0x46, 0x46]) && has(8, [0x57, 0x45, 0x42, 0x50])) return 'webp';
  return null;
}

/**
 * Первые 18 байт base64 (24 символа) — хватает на любую сигнатуру выше.
 * Через atob, без Buffer: функция нужна и в браузере. Не base64 — null.
 */
function base64Head(base64: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(base64.slice(0, 24)), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export type AvatarInput =
  | { kind: 'skip' }
  | { kind: 'set'; value: string | null }
  | { kind: 'error'; error: string };

export function parseAvatarInput(raw: string | null | undefined): AvatarInput {
  if (raw === undefined) return { kind: 'skip' };
  if (raw === null) return { kind: 'set', value: null };
  if (!raw.startsWith('data:')) return { kind: 'skip' };
  if (raw.length > AVATAR_MAX_CHARS) {
    return { kind: 'error', error: 'Аватар слишком большой — нужен файл поменьше' };
  }
  // data URL не JPEG/PNG/WebP — ошибка, а не молчаливый пропуск: модалка
  // такого не шлёт, значит, запрос собран вручную. Подпись MIME должна
  // совпасть с байтами: GIF или AVIF под видом image/jpeg не пройдут.
  const m = DATA_URL_RE.exec(raw);
  const head = m ? base64Head(raw.slice(m[0].length)) : null;
  if (!m || !head || sniffImageFormat(head) !== m[1]) {
    return { kind: 'error', error: AVATAR_FORMAT_ERROR };
  }
  return { kind: 'set', value: raw };
}

// Из БД читаем мягче, чем принимаем: у старых записей подпись MIME могла
// быть любой image/*. Формат по байтам всё равно сверяет renderAvatar
// (lib/avatar) — в sharp уходят только JPEG, PNG и WebP.
const STORED_DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,/i;

/** Разбор data URL из БД: MIME и байты в base64. Не data URL — null. */
export function parseImageDataUrl(dataUrl: string): { mime: string; base64: string } | null {
  const m = STORED_DATA_URL_RE.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], base64: dataUrl.slice(m[0].length) };
}
