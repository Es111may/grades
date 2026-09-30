import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { LruCache, avatarSrc, avatarVersion, renderAvatar } from '../avatar';
import {
  AVATAR_MAX_CHARS,
  avatarSizeFor,
  parseAvatarInput,
  parseAvatarSize,
  parseImageDataUrl,
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
  it('data URL картинки — сохранить', () => {
    const data = 'data:image/jpeg;base64,AAAA';
    expect(parseAvatarInput(data)).toEqual({ kind: 'set', value: data });
    expect(parseAvatarInput('data:image/png;base64,AAAA').kind).toBe('set');
  });
  it('ссылку /api/avatar и прочие строки — не сохраняем', () => {
    expect(parseAvatarInput('/api/avatar/5?v=abc&s=96')).toEqual({ kind: 'skip' });
    expect(parseAvatarInput('https://example.com/a.png')).toEqual({ kind: 'skip' });
    expect(parseAvatarInput('data:image/svg+xml;base64,AAAA')).toEqual({ kind: 'skip' });
    expect(parseAvatarInput('data:text/html;base64,AAAA')).toEqual({ kind: 'skip' });
    expect(parseAvatarInput('')).toEqual({ kind: 'skip' });
  });
  it('слишком большой data URL — ошибка', () => {
    const big = `data:image/jpeg;base64,${'A'.repeat(AVATAR_MAX_CHARS)}`;
    expect(parseAvatarInput(big).kind).toBe('error');
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
});
