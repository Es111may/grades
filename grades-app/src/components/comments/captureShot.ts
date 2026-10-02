// Снимок места нового комментария: кусок страницы вокруг точки или рамки,
// WebP (или JPEG, если браузер не пишет WebP). Рисует html-to-image — он
// копирует DOM с вычисленными стилями в SVG и растеризует его на холсте;
// библиотека грузится отдельным чанком только в момент съёмки. Геометрия
// кадра и пределы — в lib/commentShot (там тесты).
//
// Что снимаем. Не весь экран, а ближайший к якорю элемент, который вмещает
// кадр: так копируется меньше DOM и съёмка быстрее. Выше опоры не идём —
// поп-ап (role=dialog), иначе main, иначе body. И не поднимаемся над
// прокрученным контейнером: копия рисуется с прокруткой в начале, и кадр
// уехал бы. Слой комментариев в снимок не попадает (фильтр по атрибуту).
//
// Известные ограничения: прокрутка внутри снимаемого элемента (таблица,
// сдвинутая вбок) сбрасывается в начало; backdrop-filter — без размытия;
// WebGL-холст (TitleAurora) может выйти пустым. Снимок — подсказка к
// комментарию, а не эталон: любая ошибка — просто комментарий без него.

import { containsRect, type CommentAnchorKind, type ViewRect } from '@/lib/commentAnchor';
import {
  SHOT_ENCODE_STEPS,
  UI_COMMENT_SHOT,
  fitFrame,
  isShotFrameUsable,
  markInFrame,
  shotFrame,
  shotPixelRatio,
} from '@/lib/commentShot';
import { COMMENTS_LAYER_ATTR } from '@/lib/commentsLayer';
import { pageElementAt, type AnchorGeom } from './anchorDom';
import { PIN } from './CommentPins';

export type CapturedShot = { blob: Blob; w: number; h: number };

/** Дольше этого снимок не ждём — комментарий уходит без него, мс. */
const CAPTURE_TIMEOUT_MS = 6000;

const LAYER_SELECTOR = `[${COMMENTS_LAYER_ATTR}]`;

function toViewRect(r: DOMRect): ViewRect {
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/**
 * Можно ли сделать элемент корнем копии: блочный HTML-элемент. Строчный
 * (у него не работают размеры и сдвиг), display: contents, части таблицы
 * без самой таблицы и SVG — нет, берём предка.
 */
function canBeRoot(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const d = getComputedStyle(el).display;
  return d !== 'inline' && d !== 'contents' && d !== 'none' && !d.startsWith('table-');
}

function isScrolled(el: Element): boolean {
  return el.scrollTop !== 0 || el.scrollLeft !== 0;
}

/** Что снимать: ближайший подходящий предок, вмещающий кадр (см. шапку файла). */
function pickRoot(start: Element, frame: ViewRect): HTMLElement | null {
  const limit = start.closest('[role="dialog"]') ?? start.closest('main') ?? document.body;
  let best: HTMLElement | null = null;
  for (let el: Element | null = start; el; el = el.parentElement) {
    if (canBeRoot(el)) {
      best = el;
      if (containsRect(toViewRect(el.getBoundingClientRect()), frame, 1)) break;
    }
    if (el === limit) break;
    const parent: Element | null = el.parentElement;
    if (!parent || (best && isScrolled(parent))) break;
  }
  return best;
}

/** Цвет «rgb(…)» / «rgba(…, 1)» без прозрачности. */
function isOpaque(color: string): boolean {
  if (!color || color === 'transparent') return false;
  const m = /^rgba\((.+)\)$/.exec(color);
  if (!m) return true;
  const alpha = Number(m[1].split(/[\s,/]+/).filter(Boolean)[3]);
  return !(alpha < 1);
}

/** Непрозрачный фон под снимком: свой у элемента или первого предка, иначе страницы. */
function backdropOf(el: Element): string {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const c = getComputedStyle(e).backgroundColor;
    if (isOpaque(c)) return c;
  }
  return '#141416';
}

/** CSS-переменная цвета токена («213 255 12») → цвет для холста. */
function tokenColor(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `rgb(${v.split(/\s+/).join(', ')})` : fallback;
}

/**
 * Отметка поверх снимка — как её видел автор: у точки капля-метка (хвостик
 * — в самой точке), у рамки пунктир. Иначе у точки, сдвинутой от центра к
 * краю, не понять, о чём речь.
 */
function drawMark(ctx: CanvasRenderingContext2D, kind: CommentAnchorKind, mark: ViewRect, ratio: number, ring: string) {
  ctx.save();
  ctx.scale(ratio, ratio);
  if (kind === 'rect') {
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = tokenColor('--c-lime-dark', 'rgb(228, 255, 92)');
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(mark.left, mark.top, mark.width, mark.height, 4);
    else ctx.rect(mark.left, mark.top, mark.width, mark.height);
    ctx.stroke();
  } else {
    // Капля 24 px с острым левым нижним углом, обводка 2 px цветом фона
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(mark.left, mark.top - PIN, PIN, PIN, [12, 12, 12, 3]);
    else ctx.arc(mark.left + PIN / 2, mark.top - PIN / 2, PIN / 2, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = ring;
    ctx.stroke();
    ctx.fillStyle = tokenColor('--c-lime', 'rgb(213, 255, 12)');
    ctx.fill();
  }
  ctx.restore();
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function scaledCopy(src: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * scale));
  c.height = Math.max(1, Math.round(src.height * scale));
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
  }
  return c;
}

// Пишет ли браузер WebP: без поддержки toBlob молча отдаёт PNG
let webpSupported: boolean | null = null;

/** Сжать до targetBytes по ступеням SHOT_ENCODE_STEPS; не влезло и в maxBytes — null. */
async function encode(src: HTMLCanvasElement): Promise<CapturedShot | null> {
  let last: CapturedShot | null = null;
  let canvas = src;
  let scale = 1;
  for (const step of SHOT_ENCODE_STEPS) {
    if (step.scale !== scale) {
      canvas = scaledCopy(src, step.scale);
      scale = step.scale;
    }
    let blob: Blob | null = null;
    if (webpSupported !== false) {
      blob = await canvasToBlob(canvas, 'image/webp', step.quality);
      webpSupported = blob?.type === 'image/webp';
      if (!webpSupported) blob = null;
    }
    blob ??= await canvasToBlob(canvas, 'image/jpeg', step.quality);
    if (!blob) {
      console.warn('[comments] снимок не сжался — комментарий без него');
      return null;
    }
    last = { blob, w: canvas.width, h: canvas.height };
    if (blob.size <= UI_COMMENT_SHOT.targetBytes) return last;
  }
  if (last && last.blob.size <= UI_COMMENT_SHOT.maxBytes) return last;
  console.warn('[comments] снимок тяжелее предела — комментарий без него');
  return null;
}

async function render(kind: CommentAnchorKind, geom: AnchorGeom): Promise<CapturedShot | null> {
  if ((geom.status !== 'ok' && geom.status !== 'offscreen') || !geom.rect) return null;
  const mark: ViewRect =
    kind === 'rect' ? geom.rect : { left: geom.x, top: geom.y, width: 0, height: 0 };
  const wanted = shotFrame(kind, mark);
  const start = geom.el ?? pageElementAt(mark.left + mark.width / 2, mark.top + mark.height / 2);
  const root = start ? pickRoot(start, wanted) : null;
  if (!root) return null;

  const box = root.getBoundingClientRect();
  const frame = fitFrame(wanted, toViewRect(box));
  if (!isShotFrameUsable(frame)) return null;
  const ratio = shotPixelRatio(frame, window.devicePixelRatio);
  const cs = getComputedStyle(root);

  const { toCanvas } = await import('html-to-image');
  const shot = await toCanvas(root, {
    // Размер кадра: столько и будет у SVG и холста
    width: frame.width,
    height: frame.height,
    pixelRatio: ratio,
    // Слой комментариев (метки, карточки, само поле) — не страница
    filter: (node) => !(node as Element).closest?.(LAYER_SELECTOR),
    // Аватары разных людей и размеров — разные ссылки, кэш по полному адресу
    includeQueryParams: true,
    // Корень копии — во всю свою ширину (width/height выше html-to-image
    // ставит и ему), без своих отступов, позиции и трансформаций, сдвинут
    // так, что в кадр попадает нужный кусок
    style: {
      width: cs.width,
      height: cs.height,
      maxWidth: 'none',
      maxHeight: 'none',
      minWidth: '0',
      minHeight: '0',
      margin: '0',
      position: 'relative',
      top: '0',
      left: '0',
      right: 'auto',
      bottom: 'auto',
      translate: 'none',
      scale: 'none',
      rotate: 'none',
      transformOrigin: '0 0',
      transform: `translate(${box.left - frame.left}px, ${box.top - frame.top}px)`,
    },
  });

  // Свой холст: непрозрачный фон (у корня он бывает прозрачным, а JPEG
  // прозрачность сделал бы чёрной) и отметка поверх
  const out = document.createElement('canvas');
  out.width = shot.width;
  out.height = shot.height;
  const ctx = out.getContext('2d');
  if (!ctx || !out.width || !out.height) return null;
  const backdrop = backdropOf(root);
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(shot, 0, 0);
  drawMark(ctx, kind, markInFrame(mark, frame), out.width / frame.width, backdrop);
  return encode(out);
}

/**
 * Снимок места для нового комментария. Никогда не бросает: не вышло или
 * дольше CAPTURE_TIMEOUT_MS — null и предупреждение в консоли, комментарий
 * уходит без снимка.
 */
export async function captureShot(kind: CommentAnchorKind, geom: AnchorGeom): Promise<CapturedShot | null> {
  let timer = 0;
  const timeout = new Promise<null>((resolve) => {
    timer = window.setTimeout(() => {
      console.warn('[comments] снимок не успел — комментарий без него');
      resolve(null);
    }, CAPTURE_TIMEOUT_MS);
  });
  const shot = render(kind, geom).catch((e: unknown) => {
    console.warn('[comments] снимок не получился — комментарий без него', e);
    return null;
  });
  try {
    return await Promise.race([shot, timeout]);
  } finally {
    window.clearTimeout(timer);
  }
}

/** Дать браузеру отрисовать «Снимок…» до съёмки: она занимает главный поток. */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => window.setTimeout(resolve, 0)));
}
