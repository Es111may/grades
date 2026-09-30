export const dynamic = 'force-dynamic';
// sharp — нативный модуль, только в Node-рантайме
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { avatarCache, avatarVersion, renderAvatar } from '@/lib/avatar';
import { parseAvatarSize } from '@/lib/avatarShared';

/**
 * GET /api/avatar/[id]?v=<версия>&s=<48|96|192|256>
 *
 * Картинка аватара в WebP вместо data URL в каждой строке списка. Только
 * вошедшим: аватар — фото сотрудника. Ссылку с версией строит lib/avatar
 * (avatarSrc): версия совпала — кэш браузера на год без перепроверки;
 * устаревшая ссылка (картинку сменили, а страница старая) — отдаём текущую
 * картинку, но без долгого кэша, чтобы старая версия не прилипла.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = parseInt(params.id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const url = new URL(req.url);
  const size = parseAvatarSize(url.searchParams.get('s'));
  const requested = url.searchParams.get('v');

  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  });
  if (!row?.avatarUrl) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const version = avatarVersion(row.avatarUrl);
  const etag = `"${version}-${size}"`;
  const headers = {
    'Content-Type': 'image/webp',
    'Cache-Control':
      requested === version ? 'private, max-age=31536000, immutable' : 'private, no-cache',
    ETag: etag,
  };

  const ifNoneMatch = req.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch.split(',').some((t) => t.trim() === etag)) {
    return new NextResponse(null, { status: 304, headers });
  }

  const key = `${userId}:${version}:${size}`;
  let bytes = avatarCache.get(key);
  if (!bytes) {
    try {
      bytes = (await renderAvatar(row.avatarUrl, size)) ?? undefined;
    } catch (err) {
      // Битая картинка в БД: в лог — только id, без содержимого
      console.error(`[/api/avatar] render failed for user #${userId}:`, (err as Error).message);
    }
    if (!bytes) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    avatarCache.set(key, bytes);
  }

  // Копия в Uint8Array — тип тела ответа; картинка в пару КБ, копировать дёшево
  return new NextResponse(new Uint8Array(bytes), { status: 200, headers });
}
