/**
 * Комментарии к интерфейсу «как в Figma» — только админ и лиды
 * (lib/uiComments). Не вошёл — 401, другая роль — 403.
 *
 * GET /api/ui-comments?path=/admin/users[&status=open|resolved]
 *   → { comments: UiCommentDto[] } — треды этой страницы с ответами, старые
 *     сверху. path — pathname + search (hash отрезаем), в query — через
 *     encodeURIComponent.
 * GET /api/ui-comments?scope=all[&status=open|resolved]
 *   → { comments: UiCommentDto[] } — все страницы, новые сверху, до 500.
 *
 * POST /api/ui-comments { path, anchor, text } → 201 UiCommentDto (новый тред)
 * POST /api/ui-comments { parentId, text }     → 201 UiCommentReplyDto (ответ;
 *   родитель — корень треда, path/anchor из тела не берём)
 *
 * Ошибки — { error: string } по-русски.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import {
  APP_VERSION,
  UI_COMMENT_REPLY_SELECT,
  UI_COMMENT_THREAD_SELECT,
  firstIssueMessage,
  isUiCommentStatus,
  toCommentDto,
  toReplyDto,
  uiCommentCreateSchema,
  uiCommentPathSchema,
  uiCommentReplySchema,
  uiCommentsAccessError,
} from '@/lib/uiComments';

/** Предел выборки «все страницы»: больше разом никто не разберёт. */
const ALL_SCOPE_LIMIT = 500;

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

export async function GET(req: NextRequest) {
  const { denied } = await authorize();
  if (denied) return denied;

  const params = req.nextUrl.searchParams;
  const scope = params.get('scope');
  if (scope !== null && scope !== 'all') return bad('scope — только all');
  const status = params.get('status');
  if (status !== null && !isUiCommentStatus(status)) return bad('Статус — open или resolved');

  let path: string | undefined;
  if (scope !== 'all') {
    const parsed = uiCommentPathSchema.safeParse(params.get('path') ?? undefined);
    if (!parsed.success) return bad(firstIssueMessage(parsed.error));
    path = parsed.data;
  }

  const rows = await prisma.uiComment.findMany({
    where: { parentId: null, ...(path !== undefined ? { path } : {}), ...(status ? { status } : {}) },
    select: UI_COMMENT_THREAD_SELECT,
    orderBy: { createdAt: scope === 'all' ? 'desc' : 'asc' },
    ...(scope === 'all' ? { take: ALL_SCOPE_LIMIT } : {}),
  });
  return NextResponse.json({ comments: rows.map(toCommentDto) });
}

export async function POST(req: NextRequest) {
  const { me, denied } = await authorize();
  if (denied) return denied;

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return bad('Некорректный запрос');

  // Ответ в тред: есть parentId
  const parentId = (body as { parentId?: unknown }).parentId;
  if (parentId !== undefined && parentId !== null) {
    const parsed = uiCommentReplySchema.safeParse(body);
    if (!parsed.success) return bad(firstIssueMessage(parsed.error));

    const parent = await prisma.uiComment.findUnique({
      where: { id: parsed.data.parentId },
      select: { id: true, parentId: true, path: true },
    });
    if (!parent) return bad('Тред не найден', 404);
    // Треды плоские, как в Figma: ответ на ответ — в тот же тред
    if (parent.parentId !== null) return bad('Ответить можно только на тред, не на ответ');

    const reply = await prisma.uiComment.create({
      data: {
        path: parent.path,
        text: parsed.data.text,
        authorId: me.id,
        parentId: parent.id,
        appVersion: APP_VERSION,
      },
      select: UI_COMMENT_REPLY_SELECT,
    });
    return NextResponse.json(toReplyDto(reply), { status: 201 });
  }

  const parsed = uiCommentCreateSchema.safeParse(body);
  if (!parsed.success) return bad(firstIssueMessage(parsed.error));

  const thread = await prisma.uiComment.create({
    data: {
      path: parsed.data.path,
      anchor: parsed.data.anchor,
      text: parsed.data.text,
      authorId: me.id,
      appVersion: APP_VERSION,
    },
    select: UI_COMMENT_THREAD_SELECT,
  });
  return NextResponse.json(toCommentDto(thread), { status: 201 });
}
