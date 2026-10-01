// Запросы слоя комментариев к /api/ui-comments. Ошибка — исключение с
// текстом сервера (или общим), его показывает интерфейс.

import type { CommentAnchor } from '@/lib/commentAnchor';
import type { CommentReply, CommentStatus, CommentThread } from './types';

const BASE = '/api/ui-comments';

// GET требует path — иначе 400; scope=all — до 500 тредов, новые сверху
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    cache: 'no-store',
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error || `Ошибка ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function fetchPageThreads(path: string): Promise<CommentThread[]> {
  const j = await call<{ comments: CommentThread[] }>(`${BASE}?path=${encodeURIComponent(path)}`);
  return j.comments ?? [];
}

export async function fetchAllThreads(): Promise<CommentThread[]> {
  const j = await call<{ comments: CommentThread[] }>(`${BASE}?scope=all`);
  return j.comments ?? [];
}

export function createThread(path: string, anchor: CommentAnchor, text: string) {
  return call<CommentThread>(BASE, { method: 'POST', body: JSON.stringify({ path, anchor, text }) });
}

export function createReply(parentId: number, text: string) {
  return call<CommentReply>(BASE, { method: 'POST', body: JSON.stringify({ parentId, text }) });
}

/**
 * Правка текста (тред или ответ) или статуса (только тред). Ответ — тред
 * целиком, даже если правили ответ.
 */
export function patchComment(id: number, patch: { text?: string; status?: CommentStatus }) {
  return call<CommentThread>(`${BASE}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteComment(id: number) {
  return call<{ ok: true }>(`${BASE}/${id}`, { method: 'DELETE' });
}
