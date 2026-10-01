/**
 * PATCH  /api/ui-comments/[id] { text?, status? } → UiCommentDto (тред целиком,
 *   даже если правили ответ). text — только автор; status — только у корня
 *   треда, любой админ или лид: resolved ставит resolvedBy/resolvedAt, open —
 *   снимает. updatedAt меняется только от правки текста — смена статуса его
 *   не трогает, у неё свой resolvedAt.
 * DELETE /api/ui-comments/[id] → { ok: true }. Автор или админ; у треда ответы
 *   удаляются вместе с ним (каскад в схеме).
 *
 * Доступ — как у /api/ui-comments: не вошёл — 401, не админ и не лид — 403.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import {
  UI_COMMENT_THREAD_SELECT,
  canDeleteUiComment,
  canEditUiCommentText,
  firstIssueMessage,
  toCommentDto,
  uiCommentPatchSchema,
  uiCommentsAccessError,
} from '@/lib/uiComments';

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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { me, denied } = await authorize();
  if (denied) return denied;

  const id = parseId(params.id);
  if (!id) return bad('Некорректный id');

  const comment = await prisma.uiComment.findUnique({
    where: { id },
    select: { id: true, authorId: true, parentId: true, text: true, status: true, updatedAt: true },
  });
  if (!comment) return bad('Комментарий не найден', 404);

  const parsed = uiCommentPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(firstIssueMessage(parsed.error));
  const { text, status } = parsed.data;

  if (text !== undefined && !canEditUiCommentText(me, comment)) {
    return bad('Текст комментария правит только автор', 403);
  }
  if (status !== undefined && comment.parentId !== null) {
    return bad('Статус есть только у треда, не у ответа');
  }

  const data: Prisma.UiCommentUncheckedUpdateInput = {};
  if (text !== undefined && text !== comment.text) data.text = text;
  if (status !== undefined && status !== comment.status) {
    data.status = status;
    // Повторное «решено» не перетирает, кто и когда закрыл: сюда попадаем
    // только при настоящей смене статуса
    data.resolvedById = status === 'resolved' ? me.id : null;
    data.resolvedAt = status === 'resolved' ? new Date() : null;
  }
  if (Object.keys(data).length) {
    // Без новой правки текста держим прежний updatedAt: по нему клиент
    // показывает «изменено», а статус — не правка
    if (data.text === undefined) data.updatedAt = comment.updatedAt;
    await prisma.uiComment.update({ where: { id }, data });
  }

  const thread = await prisma.uiComment.findUnique({
    where: { id: comment.parentId ?? comment.id },
    select: UI_COMMENT_THREAD_SELECT,
  });
  // Тред могли удалить, пока шёл запрос
  if (!thread) return bad('Комментарий не найден', 404);
  return NextResponse.json(toCommentDto(thread));
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { me, denied } = await authorize();
  if (denied) return denied;

  const id = parseId(params.id);
  if (!id) return bad('Некорректный id');

  const comment = await prisma.uiComment.findUnique({ where: { id }, select: { id: true, authorId: true } });
  if (!comment) return bad('Комментарий не найден', 404);
  if (!canDeleteUiComment(me, comment)) return bad('Удалить комментарий может автор или админ', 403);

  // deleteMany: тред мог исчезнуть между проверкой и удалением — не 500
  await prisma.uiComment.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
