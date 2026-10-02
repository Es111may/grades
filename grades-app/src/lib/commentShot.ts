// Снимок места комментария к интерфейсу (UiComment.screenshot) — чистая
// часть, общая для клиента и сервера: пределы, геометрия кадра, проверка
// загрузки по байтам и ссылка на картинку. Без DOM и node-модулей — всё
// проверяют тесты. Съёмка страницы (html-to-image) — в
// components/comments/captureShot.ts, приём и отдача — роут
// /api/ui-comments/[id]/screenshot.
//
// Снимок делается один раз, в момент комментария, и потом не меняется:
// повторная загрузка — 409. Поэтому версия в ссылке — просто размер.

import type { ViewRect } from './commentAnchor';
import { sniffImageFormat } from './avatarShared';

export const UI_COMMENT_SHOT = {
  /** Поля вокруг рамки, px CSS. */
  margin: 24,
  /** Кадр вокруг точки, px CSS: точка — в центре, пока кадр не упрётся в край. */
  pointW: 480,
  pointH: 320,
  /** Плотность снимка — не выше ретины: px изображения на px CSS. */
  maxRatio: 2,
  /** Длинная сторона снимка, px изображения. Больше — сервер не примет. */
  maxSide: 1600,
  /** Кадр меньше этого по любой стороне, px CSS, — снимать нечего. */
  minSide: 8,
  /** К этому весу клиент ужимает снимок, байт. */
  targetBytes: 400_000,
  /** Больше — сервер не примет, байт. */
  maxBytes: 600_000,
} as const;

/**
 * Ступени сжатия: сначала качество (0,8 → 0,5), потом масштаб. Первая, что
 * влезла в targetBytes, — снимок; не влезла ни одна — последняя, если она
 * меньше maxBytes. Интерфейс сжимается хорошо: обычно хватает первой.
 */
export const SHOT_ENCODE_STEPS: readonly { scale: number; quality: number }[] = [1, 0.75, 0.5].flatMap(
  (scale) => [0.8, 0.7, 0.6, 0.5].map((quality) => ({ scale, quality })),
);

export type ShotFormat = 'webp' | 'jpeg';

export const SHOT_MIME: Record<ShotFormat, string> = { webp: 'image/webp', jpeg: 'image/jpeg' };

/** Расширение файла снимка в выгрузке. */
export function shotExtension(format: ShotFormat): string {
  return format === 'webp' ? 'webp' : 'jpg';
}

// ── Геометрия кадра ─────────────────────────────────────────────────────

/**
 * Кадр снимка во вьюпортных координатах: рамка с полями margin со всех
 * сторон или pointW×pointH с центром в точке (у точки mark — нулевого
 * размера, left/top — сама точка).
 */
export function shotFrame(kind: 'point' | 'rect', mark: ViewRect): ViewRect {
  const s = UI_COMMENT_SHOT;
  if (kind === 'point') {
    return { left: mark.left - s.pointW / 2, top: mark.top - s.pointH / 2, width: s.pointW, height: s.pointH };
  }
  return {
    left: mark.left - s.margin,
    top: mark.top - s.margin,
    width: mark.width + s.margin * 2,
    height: mark.height + s.margin * 2,
  };
}

/** Отрезок [start, start + size) внутри [bStart, bStart + bSize): сдвиг, потом обрезка. */
function fitAxis(start: number, size: number, bStart: number, bSize: number): [number, number] {
  if (size >= bSize) return [bStart, bSize];
  return [Math.min(Math.max(start, bStart), bStart + bSize - size), size];
}

/**
 * Кадр внутри снимаемого элемента. Не влез — сдвигаем внутрь, а если он
 * больше элемента — обрезаем по нему: у точки у края блока кадр остаётся
 * 480×320, просто точка уже не в центре. Целые px: из них считается холст.
 */
export function fitFrame(frame: ViewRect, bounds: ViewRect): ViewRect {
  const [left, width] = fitAxis(frame.left, frame.width, bounds.left, bounds.width);
  const [top, height] = fitAxis(frame.top, frame.height, bounds.top, bounds.height);
  const l = Math.round(left);
  const t = Math.round(top);
  return { left: l, top: t, width: Math.round(left + width) - l, height: Math.round(top + height) - t };
}

/** Кадр достаточно большой, чтобы его снимать. */
export function isShotFrameUsable(frame: ViewRect): boolean {
  return frame.width >= UI_COMMENT_SHOT.minSide && frame.height >= UI_COMMENT_SHOT.minSide;
}

/**
 * Плотность снимка: как у экрана, но не выше maxRatio и так, чтобы длинная
 * сторона не превысила maxSide. На обычном мониторе — 1, на ретине — 2.
 */
export function shotPixelRatio(frame: ViewRect, devicePixelRatio: number): number {
  const s = UI_COMMENT_SHOT;
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const long = Math.max(frame.width, frame.height, 1);
  return Math.min(s.maxRatio, dpr, s.maxSide / long);
}

/** Отметка (точка или рамка) в координатах кадра, px CSS — чтобы нарисовать её на снимке. */
export function markInFrame(mark: ViewRect, frame: ViewRect): ViewRect {
  return { left: mark.left - frame.left, top: mark.top - frame.top, width: mark.width, height: mark.height };
}

// ── Проверка загрузки ───────────────────────────────────────────────────

const u16le = (b: ArrayLike<number>, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: ArrayLike<number>, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u16be = (b: ArrayLike<number>, i: number) => (b[i] << 8) | b[i + 1];
const fourcc = (b: ArrayLike<number>, i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);

/**
 * Размер WebP по первому чанку: VP8 (с потерями) — 14 бит ширины и высоты
 * после стартового кода 9D 01 2A; VP8L (без потерь) — 14 бит (размер − 1)
 * после подписи 2F; VP8X (расширенный: прозрачность, анимация) — 24 бита
 * (размер − 1) холста.
 */
function webpSize(b: ArrayLike<number>): { w: number; h: number } | null {
  if (b.length < 30) return null;
  const chunk = fourcc(b, 12);
  if (chunk === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { w: u16le(b, 26) & 0x3fff, h: u16le(b, 28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const b1 = b[22];
    const b2 = b[23];
    const b3 = b[24];
    return { w: 1 + (((b1 & 0x3f) << 8) | b[21]), h: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
  }
  if (chunk === 'VP8X') return { w: 1 + u24le(b, 24), h: 1 + u24le(b, 27) };
  return null;
}

/**
 * Размер JPEG по маркеру SOF (C0–CF, кроме DHT C4, JPG C8 и DAC CC):
 * идём по сегментам с начала файла. Скан (DA) раньше SOF — битый файл.
 */
function jpegSize(b: ArrayLike<number>): { w: number; h: number } | null {
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    // Заполняющие FF между сегментами
    if (marker === 0xff) {
      i++;
      continue;
    }
    // Маркеры без длины: RST0–7, SOI, EOI, TEM
    if ((marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
      i += 2;
      continue;
    }
    if (marker === 0xda) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 8 >= b.length) return null;
      return { w: u16be(b, i + 7), h: u16be(b, i + 5) };
    }
    const len = u16be(b, i + 2);
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

/** Размер картинки по заголовку, без декодирования. Не разобрали — null. */
export function readImageSize(bytes: ArrayLike<number>, format: ShotFormat): { w: number; h: number } | null {
  const size = format === 'webp' ? webpSize(bytes) : jpegSize(bytes);
  return size && size.w > 0 && size.h > 0 ? size : null;
}

export type ShotUpload =
  | { ok: true; format: ShotFormat; mime: string; w: number; h: number }
  | { ok: false; status: 400 | 413 | 415; error: string };

/**
 * Тело PUT /api/ui-comments/[id]/screenshot: сырые байты картинки. Формат —
 * по Content-Type, и он должен совпасть с подписью в байтах (как у аватаров,
 * lib/avatarShared): под видом WebP не пройдёт ни PNG, ни GIF, ни SVG.
 * Размер — из заголовка картинки, а не со слов клиента.
 */
export function checkShotUpload(contentType: string | null | undefined, bytes: Uint8Array): ShotUpload {
  const s = UI_COMMENT_SHOT;
  const mime = (contentType ?? '').split(';')[0].trim().toLowerCase();
  const format: ShotFormat | null = mime === SHOT_MIME.webp ? 'webp' : mime === SHOT_MIME.jpeg ? 'jpeg' : null;
  if (!format) return { ok: false, status: 415, error: 'Снимок — только WebP или JPEG' };
  if (bytes.length === 0) return { ok: false, status: 400, error: 'Снимок пустой' };
  if (bytes.length > s.maxBytes) {
    return { ok: false, status: 413, error: `Снимок больше ${Math.round(s.maxBytes / 1000)} КБ` };
  }
  if (sniffImageFormat(bytes) !== format) {
    return { ok: false, status: 415, error: 'Содержимое снимка не совпадает с форматом' };
  }
  const size = readImageSize(bytes, format);
  if (!size) return { ok: false, status: 400, error: 'Не удалось прочитать размер снимка' };
  if (size.w > s.maxSide || size.h > s.maxSide) {
    return { ok: false, status: 400, error: `Снимок больше ${s.maxSide} px по длинной стороне` };
  }
  return { ok: true, format, mime: SHOT_MIME[format], w: size.w, h: size.h };
}

/** Формат сохранённого снимка — по байтам; не WebP и не JPEG — null. */
export function storedShotFormat(bytes: ArrayLike<number>): ShotFormat | null {
  const f = sniffImageFormat(bytes);
  return f === 'webp' || f === 'jpeg' ? f : null;
}

// ── Ссылка ──────────────────────────────────────────────────────────────

/** Версия снимка в ссылке: снимок не меняется, хватает размера. */
export function uiCommentShotVersion(w: number, h: number): string {
  return `${w}x${h}`;
}

/** Ссылка на снимок треда с версией — по ней браузер кэширует картинку на год. */
export function uiCommentShotUrl(id: number, w: number, h: number): string {
  return `/api/ui-comments/${id}/screenshot?v=${uiCommentShotVersion(w, h)}`;
}
