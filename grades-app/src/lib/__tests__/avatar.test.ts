import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import { LruCache, avatarSrc, avatarVersion, renderAvatar } from '../avatar';
import {
  AVATAR_FORMAT_ERROR,
  AVATAR_MAX_CHARS,
  avatarSizeFor,
  parseAvatarInput,
  parseAvatarSize,
  parseImageDataUrl,
  sniffImageFormat,
  withAvatarSize,
} from '../avatarShared';

// Выдуманный «аватар»: однотонный квадрат, как его ужимает модалка
async function fakeDataUrl(side = 256): Promise<string> {
  const jpg = await sharp({
    create: { width: side, height: side, channels: 3, background: { r: 200, g: 120, b: 60 } },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpg.toString('base64')}`;
}

// Крошечная картинка в нужном формате: sharp пишет и GIF, и AVIF
async function sample(
  format: 'jpeg' | 'png' | 'webp' | 'gif' | 'avif',
  side = 16,
): Promise<Buffer> {
  return sharp({
    create: { width: side, height: side, channels: 3, background: { r: 200, g: 120, b: 60 } },
  })
    .toFormat(format)
    .toBuffer();
}

const dataUrl = (mime: string, bytes: Buffer | string) =>
  `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>';
const FORMAT_ERROR = { kind: 'error', error: AVATAR_FORMAT_ERROR };

describe('avatarVersion', () => {
  it('10 hex, одинаковый для одной картинки и разный для разных', () => {
    const a = avatarVersion('data:image/jpeg;base64,AAAA');
    expect(a).toMatch(/^[0-9a-f]{10}$/);
    expect(avatarVersion('data:image/jpeg;base64,AAAA')).toBe(a);
    expect(avatarVersion('data:image/jpeg;base64,AAAB')).not.toBe(a);
  });
});

describe('avatarSrc', () => {
  it('нет аватара — null', () => {
    expect(avatarSrc({ id: 5, avatarUrl: null })).toBeNull();
    expect(avatarSrc({ id: 5, avatarUrl: '' })).toBeNull();
  });
  it('ссылка с версией и размером, по умолчанию 96', () => {
    const data = 'data:image/jpeg;base64,AAAA';
    const v = avatarVersion(data);
    expect(avatarSrc({ id: 5, avatarUrl: data })).toBe(`/api/avatar/5?v=${v}&s=96`);
    expect(avatarSrc({ id: 5, avatarUrl: data }, 256)).toBe(`/api/avatar/5?v=${v}&s=256`);
  });
  it('в ссылке нет base64', () => {
    const data = `data:image/jpeg;base64,${'A'.repeat(20_000)}`;
    expect(avatarSrc({ id: 1, avatarUrl: data })!.length).toBeLessThan(60);
  });
});

describe('размеры', () => {
  it('parseAvatarSize: только 48/96/192/256, иначе 96', () => {
    expect(parseAvatarSize('48')).toBe(48);
    expect(parseAvatarSize('256')).toBe(256);
    expect(parseAvatarSize('100')).toBe(96);
    expect(parseAvatarSize('abc')).toBe(96);
    expect(parseAvatarSize(null)).toBe(96);
  });
  it('avatarSizeFor: ×2 под ретину, ближайший не меньше, потолок 256', () => {
    expect(avatarSizeFor(24)).toBe(48);
    expect(avatarSizeFor(28)).toBe(96);
    expect(avatarSizeFor(36)).toBe(96);
    expect(avatarSizeFor(48)).toBe(96);
    expect(avatarSizeFor(56)).toBe(192);
    expect(avatarSizeFor(80)).toBe(192);
    expect(avatarSizeFor(96)).toBe(192);
    expect(avatarSizeFor(128)).toBe(256);
    expect(avatarSizeFor(400)).toBe(256);
  });
  it('withAvatarSize: меняет s у нашей ссылки, версию не трогает', () => {
    expect(withAvatarSize('/api/avatar/5?v=abc1234567&s=96', 80)).toBe(
      '/api/avatar/5?v=abc1234567&s=192',
    );
    expect(withAvatarSize('/api/avatar/5?v=abc1234567', 24)).toBe(
      '/api/avatar/5?v=abc1234567&s=48',
    );
  });
  it('withAvatarSize: data URL и чужие ссылки — как есть', () => {
    const data = 'data:image/jpeg;base64,AAAA';
    expect(withAvatarSize(data, 48)).toBe(data);
    expect(withAvatarSize('https://example.com/a.png', 48)).toBe('https://example.com/a.png');
  });
});

describe('parseAvatarInput — что сохраняем из PATCH/POST', () => {
  it('поля нет — не трогаем', () => {
    expect(parseAvatarInput(undefined)).toEqual({ kind: 'skip' });
  });
  it('null — удалить', () => {
    expect(parseAvatarInput(null)).toEqual({ kind: 'set', value: null });
  });
  it('настоящие JPEG, PNG и WebP — сохранить', async () => {
    for (const f of ['jpeg', 'png', 'webp'] as const) {
      const data = dataUrl(`image/${f}`, await sample(f));
      expect(parseAvatarInput(data)).toEqual({ kind: 'set', value: data });
    }
    // Как шлёт модалка: canvas.toDataURL('image/jpeg') от 256×256
    const fromModal = await fakeDataUrl();
    expect(parseAvatarInput(fromModal)).toEqual({ kind: 'set', value: fromModal });
  });
  it('ссылку /api/avatar и прочие не data URL — не сохраняем', () => {
    expect(parseAvatarInput('/api/avatar/5?v=abc&s=96')).toEqual({ kind: 'skip' });
    expect(parseAvatarInput('https://example.com/a.png')).toEqual({ kind: 'skip' });
    expect(parseAvatarInput('')).toEqual({ kind: 'skip' });
  });
  it('GIF, AVIF, SVG и не картинки — ошибка формата', async () => {
    expect(parseAvatarInput(dataUrl('image/gif', await sample('gif')))).toEqual(FORMAT_ERROR);
    expect(parseAvatarInput(dataUrl('image/avif', await sample('avif')))).toEqual(FORMAT_ERROR);
    expect(parseAvatarInput(dataUrl('image/heic', await sample('avif')))).toEqual(FORMAT_ERROR);
    expect(parseAvatarInput(dataUrl('image/svg+xml', SVG))).toEqual(FORMAT_ERROR);
    expect(parseAvatarInput('data:text/html;base64,AAAA')).toEqual(FORMAT_ERROR);
    // Не base64
    expect(parseAvatarInput('data:image/jpeg,%FF%D8%FF')).toEqual(FORMAT_ERROR);
  });
  it('подпись MIME не совпала с байтами — ошибка формата', async () => {
    const jpeg = await sample('jpeg');
    expect(parseAvatarInput(dataUrl('image/jpeg', await sample('gif')))).toEqual(FORMAT_ERROR);
    expect(parseAvatarInput(dataUrl('image/jpeg', await sample('avif')))).toEqual(FORMAT_ERROR);
    expect(parseAvatarInput(dataUrl('image/png', SVG))).toEqual(FORMAT_ERROR);
    // Даже между разрешёнными форматами подпись должна быть честной
    expect(parseAvatarInput(dataUrl('image/jpeg', await sample('png')))).toEqual(FORMAT_ERROR);
    expect(parseAvatarInput(dataUrl('image/webp', jpeg))).toEqual(FORMAT_ERROR);
    // Мусор и обрывки
    expect(parseAvatarInput('data:image/jpeg;base64,AAAA')).toEqual(FORMAT_ERROR);
    expect(parseAvatarInput('data:image/jpeg;base64,')).toEqual(FORMAT_ERROR);
    expect(parseAvatarInput('data:image/jpeg;base64,/9j')).toEqual(FORMAT_ERROR);
    expect(parseAvatarInput('data:image/jpeg;base64,!!!!' + jpeg.toString('base64'))).toEqual(
      FORMAT_ERROR,
    );
  });
  it('без Buffer тоже работает — код общий с браузером', async () => {
    const good = dataUrl('image/jpeg', await sample('jpeg'));
    const bad = dataUrl('image/jpeg', await sample('gif'));
    vi.stubGlobal('Buffer', undefined);
    let kinds: string[];
    try {
      kinds = [parseAvatarInput(good).kind, parseAvatarInput(bad).kind];
    } finally {
      vi.unstubAllGlobals();
    }
    expect(kinds).toEqual(['set', 'error']);
  });
  it('слишком большой data URL — ошибка размера', () => {
    const big = `data:image/jpeg;base64,${'A'.repeat(AVATAR_MAX_CHARS)}`;
    const res = parseAvatarInput(big);
    expect(res.kind).toBe('error');
    expect(res).not.toEqual(FORMAT_ERROR);
  });
});

describe('sniffImageFormat', () => {
  it('JPEG, PNG, WebP — по сигнатуре', async () => {
    expect(sniffImageFormat(await sample('jpeg'))).toBe('jpeg');
    expect(sniffImageFormat(await sample('png'))).toBe('png');
    expect(sniffImageFormat(await sample('webp'))).toBe('webp');
  });
  it('прочие сигнатуры и обрывки — null', async () => {
    expect(sniffImageFormat(await sample('gif'))).toBeNull();
    expect(sniffImageFormat(await sample('avif'))).toBeNull();
    // AVIF/HEIF — контейнер ISO BMFF: «ftyp» с 4-го байта
    expect(sniffImageFormat(Buffer.from('\0\0\0\x1cftypavif\0\0\0\0', 'latin1'))).toBeNull();
    expect(sniffImageFormat(Buffer.from('\0\0\0\x18ftypheic\0\0\0\0', 'latin1'))).toBeNull();
    // RIFF, но не WebP
    expect(sniffImageFormat(Buffer.from('RIFF\0\0\0\0WAVEfmt ', 'latin1'))).toBeNull();
    expect(sniffImageFormat(Buffer.from(SVG))).toBeNull();
    expect(sniffImageFormat([])).toBeNull();
    expect(sniffImageFormat([0xff, 0xd8])).toBeNull();
    expect(sniffImageFormat([0x89, 0x50, 0x4e, 0x47])).toBeNull();
  });
});

describe('parseImageDataUrl', () => {
  it('разбирает MIME и base64', () => {
    expect(parseImageDataUrl('data:image/jpeg;base64,QUJD')).toEqual({
      mime: 'image/jpeg',
      base64: 'QUJD',
    });
  });
  it('не data URL — null', () => {
    expect(parseImageDataUrl('/api/avatar/1')).toBeNull();
    expect(parseImageDataUrl('data:text/plain;base64,QUJD')).toBeNull();
  });
});

describe('LruCache', () => {
  it('сверх лимита выкидывает самую давнюю', () => {
    const c = new LruCache<number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(3);
    expect(c.size).toBe(2);
  });
  it('get поднимает запись: выкидывается другая', () => {
    const c = new LruCache<number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a');
    c.set('c', 3);
    expect(c.get('a')).toBe(1);
    expect(c.get('b')).toBeUndefined();
  });
  it('повторный set не раздувает кэш', () => {
    const c = new LruCache<number>(2);
    c.set('a', 1);
    c.set('a', 2);
    expect(c.size).toBe(1);
    expect(c.get('a')).toBe(2);
  });
});

describe('renderAvatar', () => {
  it('квадрат нужного размера в WebP', async () => {
    const out = await renderAvatar(await fakeDataUrl(), 96);
    expect(out).not.toBeNull();
    const meta = await sharp(out!).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(96);
    expect(meta.height).toBe(96);
  });
  it('не квадрат — обрезает по центру до квадрата', async () => {
    const jpg = await sharp({
      create: { width: 300, height: 200, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();
    const out = await renderAvatar(`data:image/jpeg;base64,${jpg.toString('base64')}`, 48);
    const meta = await sharp(out!).metadata();
    expect([meta.width, meta.height]).toEqual([48, 48]);
  });
  it('не data URL — null', async () => {
    expect(await renderAvatar('/api/avatar/1', 96)).toBeNull();
  });
  it('PNG и WebP — тоже в WebP', async () => {
    for (const f of ['png', 'webp'] as const) {
      const out = await renderAvatar(dataUrl(`image/${f}`, await sample(f, 64)), 48);
      const meta = await sharp(out!).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(['webp', 48, 48]);
    }
  });
  it('старые записи в БД: GIF, AVIF, SVG — null, даже под видом JPEG', async () => {
    const gif = await sample('gif');
    const avif = await sample('avif');
    expect(await renderAvatar(dataUrl('image/gif', gif), 96)).toBeNull();
    expect(await renderAvatar(dataUrl('image/jpeg', gif), 96)).toBeNull();
    expect(await renderAvatar(dataUrl('image/avif', avif), 96)).toBeNull();
    expect(await renderAvatar(dataUrl('image/jpeg', avif), 96)).toBeNull();
    expect(await renderAvatar(dataUrl('image/svg+xml', SVG), 96)).toBeNull();
  });
  it('больше 4096×4096 пикселей — не декодирует', async () => {
    // Однотонный PNG 5000×5000 весит ~80 КБ: проходит и предел длины, и
    // проверку формата при загрузке — остановить его должен limitInputPixels
    const big = dataUrl('image/png', await sample('png', 5000));
    expect(parseAvatarInput(big).kind).toBe('set');
    await expect(renderAvatar(big, 96)).rejects.toThrow(/pixel limit/);
  });
});
