/**
 * Снимок места комментария к интерфейсу (lib/commentShot). Доступ — как у
 * /api/ui-comments: не вошёл — 401, не админ и не лид — 403.
 *
 * PUT /api/ui-comments/[id]/screenshot — тело: сырые байты картинки,
 *   Content-Type image/webp или image/jpeg, до 600 КБ, до 1600 px по
 *   длинной стороне (размер читаем из заголовка картинки). Только автор
 *   треда и только у корня треда, один раз: снимок — состояние экрана в
 *   момент комментария, повторная загрузка — 409. updatedAt не трогаем —
 *   по нему клиент показывает «изменено». → { screenshot: UiCommentShotDto }
 * GET /api/ui-comments/[id]/screenshot?v=<версия> — картинка. Версия из
 *   ссылки совпала — кэш браузера на год без перепроверки, иначе — с
 *   перепроверкой по ETag (как у /api/avatar). Снимка нет — 404.
 *
 * Ошибки — { error: string } по-русски.
 */

export const dynamic = 'force-dynamic';
// node:crypto для ETag
export const runtime = 'nodejs';

import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import {
  SHOT_MIME,
  UI_COMMENT_SHOT,
  checkShotUpload,
  storedShotFormat,
  uiCommentShotVersion,
} from '@/lib/commentShot';
import { toShotDto, uiCommentsAccessError } from '@/lib/uiComments';

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Текущий пользователь, если ему можно в комментарии, иначе готовый 401/403. */
async function authorize() {
  const me = await getCurrentUser();
  const denied = uiCommentsAccessError(me);
  if (denied || !me) {
    return { me: null, denied: bad(denied?.error ?? 'Нужно войти', denied?.status ?? 401) } as const;
  }
  return { me, denied: null } as const;
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { me, denied } = await authorize();
  if (denied) return denied;

  const id = parseId(params.id);
  if (!id) return bad('Некорректный id');

  // Байты снимка не читаем — только есть ли он
  const comment = await prisma.uiComment.findUnique({
    where: { id },
    select: { id: true, authorId: true, parentId: true, updatedAt: true, screenshotW: true },
  });
  if (!comment) return bad('Комментарий не найден', 404);
  if (comment.parentId !== null) return bad('Снимок прикрепляется к треду, а не к ответу');
  if (comment.authorId !== me.id) return bad('Снимок прикрепляет только автор комментария', 403);
  if (comment.screenshotW !== null) return bad('Снимок уже прикреплён', 409);

  // Заведомо большое тело — не читаем вовсе
  const declared = Number(req.headers.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > UI_COMMENT_SHOT.maxBytes) {
    return bad(`Снимок больше ${Math.round(UI_COMMENT_SHOT.maxBytes / 1000)} КБ`, 413);
  }
  const bytes = new Uint8Array(await req.arrayBuffer().catch(() => new ArrayBuffer(0)));
  const shot = checkShotUpload(req.headers.get('content-type'), bytes);
  if (!shot.ok) return bad(shot.error, shot.status);

  // Условие screenshotW: null — второй запрос, пришедший одновременно, не
  // перезапишет первый. Без новой правки текста держим прежний updatedAt
  const { count } = await prisma.uiComment.updateMany({
    where: { id, parentId: null, authorId: me.id, screenshotW: null },
    data: {
      screenshot: Buffer.from(bytes),
      screenshotW: shot.w,
      screenshotH: shot.h,
      updatedAt: comment.updatedAt,
    },
  });
  if (!count) return bad('Снимок уже прикреплён', 409);
  return NextResponse.json({ screenshot: toShotDto({ id, screenshotW: shot.w, screenshotH: shot.h }) });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { denied } = await authorize();
  if (denied) return denied;

  const id = parseId(params.id);
  if (!id) return bad('Некорректный id');

  const row = await prisma.uiComment.findUnique({
    where: { id },
    select: { screenshot: true, screenshotW: true, screenshotH: true },
  });
  const bytes = row?.screenshot;
  const format = bytes ? storedShotFormat(bytes) : null;
  if (!row || !bytes || !format || !row.screenshotW || !row.screenshotH) return bad('Снимка нет', 404);

  const version = uiCommentShotVersion(row.screenshotW, row.screenshotH);
  const etag = `"${createHash('sha1').update(bytes).digest('hex').slice(0, 16)}"`;
  const headers = {
    'Content-Type': SHOT_MIME[format],
    'Cache-Control':
      req.nextUrl.searchParams.get('v') === version ? 'private, max-age=31536000, immutable' : 'private, no-cache',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
  };

  const ifNoneMatch = req.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch.split(',').some((t) => t.trim() === etag)) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(new Uint8Array(bytes), { status: 200, headers });
}
