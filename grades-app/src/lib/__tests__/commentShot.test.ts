import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  SHOT_ENCODE_STEPS,
  UI_COMMENT_SHOT,
  checkShotUpload,
  fitFrame,
  isShotFrameUsable,
  markInFrame,
  readImageSize,
  shotExtension,
  shotFrame,
  shotPixelRatio,
  storedShotFormat,
  uiCommentShotUrl,
  uiCommentShotVersion,
} from '../commentShot';

// Картинки — однотонные прямоугольники, сгенерированные sharp.
async function image(
  format: 'webp' | 'jpeg' | 'png' | 'gif',
  w: number,
  h: number,
  opts: { alpha?: boolean; lossless?: boolean } = {},
): Promise<Uint8Array> {
  const img = sharp({
    create: {
      width: w,
      height: h,
      channels: opts.alpha ? 4 : 3,
      background: opts.alpha ? { r: 20, g: 20, b: 22, alpha: 0.5 } : { r: 20, g: 20, b: 22 },
    },
  });
  const out =
    format === 'webp' ? img.webp({ quality: 80, lossless: !!opts.lossless }) : img.toFormat(format);
  return new Uint8Array(await out.toBuffer());
}

const view = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

describe('кадр снимка', () => {
  it('точка — 480×320 с центром в точке', () => {
    expect(shotFrame('point', view(600, 400, 0, 0))).toEqual(view(360, 240, 480, 320));
  });

  it('рамка — с полями 24 px со всех сторон', () => {
    expect(shotFrame('rect', view(100, 200, 300, 50))).toEqual(view(76, 176, 348, 98));
  });

  it('внутри элемента — как есть', () => {
    expect(fitFrame(view(360, 240, 480, 320), view(0, 0, 1200, 900))).toEqual(view(360, 240, 480, 320));
  });

  it('у края элемента кадр сдвигается внутрь и не теряет размер', () => {
    // Точка у левого верхнего угла блока
    expect(fitFrame(view(-200, -100, 480, 320), view(40, 80, 1000, 800))).toEqual(view(40, 80, 480, 320));
    // У правого нижнего
    expect(fitFrame(view(900, 700, 480, 320), view(0, 0, 1000, 800))).toEqual(view(520, 480, 480, 320));
  });

  it('кадр больше элемента — обрезается по нему', () => {
    expect(fitFrame(view(0, 0, 480, 320), view(100, 50, 300, 200))).toEqual(view(100, 50, 300, 200));
    // По одной оси влезает, по другой — нет
    expect(fitFrame(view(10, 0, 480, 320), view(0, 50, 1000, 200))).toEqual(view(10, 50, 480, 200));
  });

  it('дробные px — целые, край не уходит за элемент', () => {
    const f = fitFrame(view(10.4, 20.6, 100.3, 50.2), view(0.5, 0.5, 2000, 2000));
    expect(f).toEqual(view(10, 21, 101, 50));
  });

  it('слишком маленький кадр не снимаем', () => {
    expect(isShotFrameUsable(view(0, 0, 480, 320))).toBe(true);
    expect(isShotFrameUsable(view(0, 0, 480, UI_COMMENT_SHOT.minSide - 1))).toBe(false);
  });

  it('отметка в координатах кадра', () => {
    expect(markInFrame(view(600, 400, 0, 0), view(360, 240, 480, 320))).toEqual(view(240, 160, 0, 0));
  });
});

describe('плотность и размер снимка', () => {
  const frame = view(0, 0, 480, 320);

  it('как у экрана, но не выше 2×', () => {
    expect(shotPixelRatio(frame, 1)).toBe(1);
    expect(shotPixelRatio(frame, 1.5)).toBe(1.5);
    expect(shotPixelRatio(frame, 2)).toBe(2);
    expect(shotPixelRatio(frame, 3)).toBe(2);
  });

  it('непонятный devicePixelRatio — как 1', () => {
    expect(shotPixelRatio(frame, 0)).toBe(1);
    expect(shotPixelRatio(frame, NaN)).toBe(1);
  });

  it('длинная сторона — не больше 1600 px', () => {
    const wide = view(0, 0, 1400, 300);
    const ratio = shotPixelRatio(wide, 2);
    expect(ratio).toBeCloseTo(1600 / 1400);
    // Холст отбрасывает дробь: 1600 или 1599, но не больше
    expect(Math.floor(wide.width * ratio)).toBeLessThanOrEqual(UI_COMMENT_SHOT.maxSide);
    expect(Math.floor(wide.width * ratio)).toBeGreaterThanOrEqual(UI_COMMENT_SHOT.maxSide - 1);
    // На обычном экране большой кадр уменьшается тоже
    const tall = view(0, 0, 100, 2400);
    expect(Math.floor(tall.height * shotPixelRatio(tall, 1))).toBeLessThanOrEqual(UI_COMMENT_SHOT.maxSide);
  });

  it('ступени сжатия: сначала качество, потом масштаб', () => {
    expect(SHOT_ENCODE_STEPS[0]).toEqual({ scale: 1, quality: 0.8 });
    expect(SHOT_ENCODE_STEPS.slice(0, 4).every((s) => s.scale === 1)).toBe(true);
    const scales = SHOT_ENCODE_STEPS.map((s) => s.scale);
    expect([...scales].sort((a, b) => b - a)).toEqual(scales);
    expect(SHOT_ENCODE_STEPS.every((s) => s.quality <= 0.8 && s.quality >= 0.5)).toBe(true);
  });
});

describe('размер картинки по заголовку', () => {
  it('WebP с потерями (VP8)', async () => {
    expect(readImageSize(await image('webp', 960, 640), 'webp')).toEqual({ w: 960, h: 640 });
  });

  it('WebP без потерь (VP8L)', async () => {
    expect(readImageSize(await image('webp', 333, 17, { lossless: true }), 'webp')).toEqual({ w: 333, h: 17 });
  });

  it('WebP с прозрачностью (VP8X)', async () => {
    expect(readImageSize(await image('webp', 1600, 900, { alpha: true }), 'webp')).toEqual({ w: 1600, h: 900 });
  });

  it('JPEG', async () => {
    expect(readImageSize(await image('jpeg', 1201, 7), 'jpeg')).toEqual({ w: 1201, h: 7 });
  });

  it('битый или обрезанный файл — null', async () => {
    const webp = await image('webp', 64, 64);
    expect(readImageSize(webp.slice(0, 20), 'webp')).toBeNull();
    const jpeg = await image('jpeg', 64, 64);
    expect(readImageSize(jpeg.slice(0, 40), 'jpeg')).toBeNull();
    expect(readImageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 4, 0, 0]), 'jpeg')).toBeNull();
  });
});

describe('проверка загрузки', () => {
  it('WebP и JPEG — принимаем, размер из байтов', async () => {
    expect(checkShotUpload('image/webp', await image('webp', 960, 640))).toEqual({
      ok: true,
      format: 'webp',
      mime: 'image/webp',
      w: 960,
      h: 640,
    });
    expect(checkShotUpload('image/jpeg; charset=binary', await image('jpeg', 480, 320))).toMatchObject({
      ok: true,
      format: 'jpeg',
      w: 480,
      h: 320,
    });
  });

  it('другой Content-Type — 415', async () => {
    const webp = await image('webp', 16, 16);
    expect(checkShotUpload('image/png', webp)).toMatchObject({ ok: false, status: 415 });
    expect(checkShotUpload(null, webp)).toMatchObject({ ok: false, status: 415 });
    expect(checkShotUpload('application/octet-stream', webp)).toMatchObject({ ok: false, status: 415 });
  });

  it('подпись в байтах не совпала с Content-Type — 415', async () => {
    expect(checkShotUpload('image/webp', await image('png', 16, 16))).toMatchObject({ ok: false, status: 415 });
    expect(checkShotUpload('image/webp', await image('gif', 16, 16))).toMatchObject({ ok: false, status: 415 });
    expect(checkShotUpload('image/jpeg', await image('webp', 16, 16))).toMatchObject({ ok: false, status: 415 });
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(checkShotUpload('image/webp', svg)).toMatchObject({ ok: false, status: 415 });
  });

  it('пустой — 400, больше 600 КБ — 413', async () => {
    expect(checkShotUpload('image/webp', new Uint8Array(0))).toMatchObject({ ok: false, status: 400 });
    const webp = await image('webp', 16, 16);
    const big = new Uint8Array(UI_COMMENT_SHOT.maxBytes + 1);
    big.set(webp);
    expect(checkShotUpload('image/webp', big)).toMatchObject({ ok: false, status: 413 });
  });

  it('больше 1600 px по стороне — 400', async () => {
    expect(checkShotUpload('image/webp', await image('webp', 1601, 10))).toMatchObject({
      ok: false,
      status: 400,
      error: 'Снимок больше 1600 px по длинной стороне',
    });
  });

  it('заголовок не читается — 400', async () => {
    const webp = await image('webp', 64, 64);
    // Подпись RIFF…WEBP есть, а чанк — неизвестный
    const broken = webp.slice();
    broken.set([0x41, 0x42, 0x43, 0x44], 12);
    expect(checkShotUpload('image/webp', broken)).toMatchObject({ ok: false, status: 400 });
  });

  it('формат сохранённого снимка — по байтам', async () => {
    expect(storedShotFormat(await image('webp', 8, 8))).toBe('webp');
    expect(storedShotFormat(await image('jpeg', 8, 8))).toBe('jpeg');
    expect(storedShotFormat(await image('png', 8, 8))).toBeNull();
    expect(shotExtension('webp')).toBe('webp');
    expect(shotExtension('jpeg')).toBe('jpg');
  });
});

describe('ссылка на снимок', () => {
  it('с версией по размеру', () => {
    expect(uiCommentShotVersion(960, 640)).toBe('960x640');
    expect(uiCommentShotUrl(12, 960, 640)).toBe('/api/ui-comments/12/screenshot?v=960x640');
  });
});
