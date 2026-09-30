// Аватары — серверная часть: ссылка с версией, ресайз и кэш картинок.
// Только для сервера (node:crypto, sharp). Клиентские компоненты берут
// lib/avatarShared.
//
// Ссылка /api/avatar/<id>?v=<хэш>&s=<размер>: v — первые 10 hex sha1 от data
// URL в БД. Сменили картинку — сменилась ссылка, поэтому браузер может
// держать её в кэше год (immutable) и не перепроверять.

import { createHash } from 'node:crypto';
import { DEFAULT_AVATAR_SIZE, AVATAR_ROUTE, parseImageDataUrl, type AvatarSize } from './avatarShared';

/** Версия картинки для ссылки и ETag: первые 10 hex sha1 от data URL. */
export function avatarVersion(dataUrl: string): string {
  return createHash('sha1').update(dataUrl).digest('hex').slice(0, 10);
}

/**
 * Ссылка на аватар для клиента вместо data URL; null — аватара нет. Размер —
 * по умолчанию: компонент Avatar подставит свой под место на экране.
 */
export function avatarSrc(
  user: { id: number; avatarUrl: string | null },
  size: AvatarSize = DEFAULT_AVATAR_SIZE,
): string | null {
  if (!user.avatarUrl) return null;
  return `${AVATAR_ROUTE}${user.id}?v=${avatarVersion(user.avatarUrl)}&s=${size}`;
}

/**
 * Квадрат `size`×`size` в WebP из data URL в БД. Не data URL — null.
 * sharp грузим лениво: avatarSrc нужен шапке каждой страницы, а нативный
 * libvips — только роуту /api/avatar.
 */
export async function renderAvatar(dataUrl: string, size: AvatarSize): Promise<Buffer | null> {
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed) return null;
  const { default: sharp } = await import('sharp');
  return sharp(Buffer.from(parsed.base64, 'base64'))
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .webp({ quality: 80 })
    .toBuffer();
}

/**
 * Простой LRU на Map: порядок вставки = порядок давности. get поднимает
 * запись наверх, set сверх лимита выкидывает самую старую.
 */
export class LruCache<V> {
  private map = new Map<string, V>();
  constructor(private readonly max: number) {}

  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value as string;
      this.map.delete(oldest);
    }
  }

  get size(): number {
    return this.map.size;
  }
}

/**
 * Готовые WebP в памяти процесса: ключ id:версия:размер. 300 записей по
 * 2–15 КБ — до ~4 МБ; на 37 человек × 4 размера хватает с запасом.
 */
export const avatarCache = new LruCache<Buffer>(300);
