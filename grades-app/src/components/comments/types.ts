// Комментарии к интерфейсу — форма ответов /api/ui-comments. Типы — из
// общей части lib/uiCommentsShared (без node-модулей, можно в клиенте).

import type { UiCommentDto, UiCommentReplyDto, UiCommentStatus } from '@/lib/uiCommentsShared';

export type CommentStatus = UiCommentStatus;
export type CommentThread = UiCommentDto;
export type CommentReply = UiCommentReplyDto;

/** Кто смотрит: слой рисуется только админу и лиду. */
export type CommentsViewer = { id: number; role: 'admin' | 'lead'; fullName: string };
