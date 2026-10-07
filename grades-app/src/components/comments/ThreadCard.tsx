'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Avatar from '@/components/Avatar';
import { InlineConfirm } from '@/components/ConfirmDialog';
import Tooltip from '@/components/Tooltip';
import {
  CheckCircleIcon,
  CheckIcon,
  CloseIcon,
  LinkIcon,
  PencilIcon,
  ReopenIcon,
  TrashIcon,
} from '@/components/icons';
import { commentHash, relativeTime, type ViewRect } from '@/lib/commentAnchor';
import { canDeleteUiComment, canEditUiCommentText, type UiCommentShotDto } from '@/lib/uiCommentsShared';
import { createReply, deleteComment, patchComment } from './api';
import CommentField from './CommentField';
import { PinShape, Z } from './CommentPins';
import { ShotLightbox, ShotThumb } from './ShotPreview';
import type { CommentReply, CommentThread, CommentsViewer } from './types';
import { useEscape } from './useEscape';
import { useFloating } from './useFloating';

const ICON_BTN = `w-8 h-8 shrink-0 rounded-pill flex items-center justify-center text-stone
  hover:text-ink hover:bg-ink/5 active:scale-[0.96]
  transition-[color,background-color,transform] duration-150 ease-out
  disabled:opacity-40 disabled:pointer-events-none`;

/**
 * Карточка треда у метки: автор, дата, текст (автор правит прямо здесь),
 * ответы и поле ответа; «Решено» / «Открыть снова» — любой админ или лид,
 * «Удалить» — автор или админ, с подтверждением; «Скопировать ссылку» —
 * адрес страницы с #comment-<id>, по нему тред откроется сам. Снимок места
 * — превью под текстом треда, клик открывает его целиком (ShotLightbox,
 * рядом с карточкой в слое).
 *
 * Позиция: у метки (useFloating, под ней или над ней), а если метки на
 * экране нет — `fallback`: например, слева от поповера списка; тогда
 * `hint` объясняет, где метка (в закрытом поп-апе, на странице под поп-апом).
 */
export default function ThreadCard({
  thread,
  number,
  viewer,
  anchor,
  fallbackStyle,
  hint,
  onClose,
  onChanged,
  onDeleted,
}: {
  thread: CommentThread;
  number: number | null;
  viewer: CommentsViewer;
  /** Прямоугольник метки (и рамки) на экране; null — метки не видно. */
  anchor: ViewRect | null;
  /** Где стоять, если метки не видно. */
  fallbackStyle: CSSProperties;
  /** Почему метки не видно (lib/commentAnchor, threadHint); null — видно. */
  hint: string | null;
  onClose: () => void;
  onChanged: (t: CommentThread) => void;
  onDeleted: (threadId: number, replyId?: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useFloating(ref, anchor);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shotOpen, setShotOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEscape(onClose, true);
  useEscape(() => setArmed(false), armed);

  // Фокус — в карточку: Tab дальше идёт по её кнопкам
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [thread.id]);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  const resolved = thread.status === 'resolved';
  const canDelete = canDeleteUiComment(viewer, thread);

  /** Запрос с общим «занято» и ошибкой в карточке; true — получилось. */
  async function run(fn: () => Promise<void>): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось — попробуйте ещё раз');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const toggleStatus = () =>
    run(async () => {
      onChanged(await patchComment(thread.id, { status: resolved ? 'open' : 'resolved' }));
    });

  const sendReply = () =>
    run(async () => {
      const r = await createReply(thread.id, reply.trim());
      setReply('');
      onChanged({ ...thread, replies: [...thread.replies, r] });
      // Новый ответ — в поле зрения
      requestAnimationFrame(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });

  const removeThread = () =>
    run(async () => {
      await deleteComment(thread.id);
      onDeleted(thread.id);
    });

  async function copyLink() {
    const url = `${window.location.origin}${thread.path}${commentHash(thread.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError('Не удалось скопировать ссылку');
    }
  }

  const style: CSSProperties = anchor
    ? { top: pos?.top ?? anchor.top, left: pos?.left ?? anchor.left }
    : fallbackStyle;

  return (
    <>
      <div
        ref={ref}
        role="dialog"
        aria-label={number ? `Комментарий ${number}` : 'Комментарий'}
        tabIndex={-1}
        className={`fixed ${Z.card} w-[340px] max-h-[min(72vh,560px)] flex flex-col
                    card shadow-soft-lg outline-none animate-scale-in origin-top-left`}
        style={style}
      >
        {/* Шапка: номер и статус слева, действия справа */}
        <div className="shrink-0 flex items-center gap-1 pl-4 pr-2 h-12">
          {number != null && <PinShape status={thread.status}>{number}</PinShape>}
          <span className={`ml-1.5 text-[13px] ${resolved ? 'text-emerald' : 'text-stone'}`}>
            {resolved ? 'Решён' : 'Открыт'}
          </span>
          <div className="ml-auto flex items-center">
            <Tooltip portal text={resolved ? 'Открыть снова' : 'Решено'} align="center" tipClassName={Z.tip}>
              <button
                type="button"
                onClick={toggleStatus}
                disabled={busy}
                aria-label={resolved ? 'Открыть снова' : 'Отметить решённым'}
                className={`${ICON_BTN} ${resolved ? '' : 'hover:!text-emerald'}`}
              >
                {resolved ? <ReopenIcon /> : <CheckCircleIcon />}
              </button>
            </Tooltip>
            <Tooltip
              portal
              text={copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
              align="center"
              tipClassName={Z.tip}
            >
              <button type="button" onClick={copyLink} aria-label="Скопировать ссылку" className={ICON_BTN}>
                {copied ? <CheckIcon className="w-4 h-4 text-emerald" /> : <LinkIcon />}
              </button>
            </Tooltip>
            {canDelete && (
              <Tooltip portal text="Удалить" align="center" tipClassName={Z.tip}>
                <button
                  type="button"
                  onClick={() => setArmed(true)}
                  disabled={busy}
                  aria-label="Удалить комментарий"
                  className={`${ICON_BTN} hover:!text-blaze hover:!bg-blaze/10`}
                >
                  <TrashIcon />
                </button>
              </Tooltip>
            )}
            <button type="button" onClick={onClose} aria-label="Закрыть" className={ICON_BTN}>
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Тред: корень и ответы. Скролл — внутри карточки */}
        <div ref={listRef} className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-3 space-y-4">
          <Message
            item={thread}
            viewer={viewer}
            shot={thread.screenshot}
            onOpenShot={() => setShotOpen(true)}
            onSave={(text) => run(async () => onChanged(await patchComment(thread.id, { text })))}
          />
          {resolved && thread.resolvedBy && thread.resolvedAt && (
            <div className="flex items-center gap-1.5 text-xs text-stone">
              <CheckCircleIcon className="w-3.5 h-3.5 text-emerald" />
              <span>
                Решено · {thread.resolvedBy.fullName}, {relativeTime(thread.resolvedAt)}
              </span>
            </div>
          )}
          {thread.replies.map((r) => (
            <Message
              key={r.id}
              item={r}
              viewer={viewer}
              onSave={(text) => run(async () => onChanged(await patchComment(r.id, { text })))}
              onDelete={() =>
                run(async () => {
                  await deleteComment(r.id);
                  onDeleted(thread.id, r.id);
                })
              }
            />
          ))}
          {hint && (
            <p className="text-xs text-stone">
              {hint}
              {thread.anchor?.snippet && (
                <span className="block mt-1 text-ash">Рядом было: «{thread.anchor.snippet}»</span>
              )}
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="shrink-0 text-xs text-blaze px-4 pb-2">
            {error}
          </p>
        )}

        {/* Низ: ответ или подтверждение удаления */}
        <div className="shrink-0 border-t border-cloud p-3">
          {armed ? (
            // Escape снимает подтверждение — через стек слоя (useEscape выше)
            <InlineConfirm
              density="compact"
              className="gap-1.5"
              message={thread.replies.length ? 'Удалить вместе с ответами?' : 'Удалить комментарий?'}
              confirmLabel="Удалить"
              pending={busy}
              onCancel={() => setArmed(false)}
              onConfirm={removeThread}
            />
          ) : (
            <div className="flex items-end gap-1.5">
              <CommentField
                value={reply}
                onChange={setReply}
                onSubmit={sendReply}
                placeholder="Ответить"
                disabled={busy}
                className="flex-1"
              />
              <button
                type="button"
                onClick={sendReply}
                disabled={!reply.trim() || busy}
                className="btn-accent btn-sm h-10 py-0 shrink-0"
              >
                Отправить
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Рядом с карточкой, а не внутри: у карточки transform-анимация, и
          fixed-просмотр встал бы относительно неё */}
      {shotOpen && thread.screenshot && (
        <ShotLightbox shot={thread.screenshot} onClose={() => setShotOpen(false)} />
      )}
    </>
  );
}

/** Сообщение треда — корень или ответ. Правит только автор, удаляет автор или админ. */
function Message({
  item,
  viewer,
  shot,
  onOpenShot,
  onSave,
  onDelete,
}: {
  item: CommentThread | CommentReply;
  viewer: CommentsViewer;
  /** Только у корня треда: снимок места и его просмотр. */
  shot?: UiCommentShotDto | null;
  onOpenShot?: () => void;
  /** true — сохранилось; иначе правка остаётся открытой, ошибка — в карточке. */
  onSave: (text: string) => Promise<boolean>;
  /** Только у ответов: тред удаляется кнопкой в шапке карточки. */
  onDelete?: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [armed, setArmed] = useState(false);
  const canEdit = canEditUiCommentText(viewer, item);
  const canDelete = !!onDelete && canDeleteUiComment(viewer, item);
  const edited = new Date(item.updatedAt).getTime() - new Date(item.createdAt).getTime() > 1000;

  useEscape(() => setEditing(false), editing);
  useEscape(() => setArmed(false), armed);

  async function save() {
    const t = draft.trim();
    if (!t) return;
    if (t !== item.text && !(await onSave(t))) return;
    setEditing(false);
  }

  return (
    <div className="group/msg flex gap-2.5">
      <Avatar name={item.author.fullName} avatarUrl={item.author.avatarUrl} size={24} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 min-h-6 text-[13px] leading-tight">
          <span className="font-medium text-ink truncate">{item.author.fullName}</span>
          <span className="text-stone shrink-0">· {relativeTime(item.createdAt)}</span>
          {/* Действия — по ховеру и фокусу, место за ними держим всегда */}
          {(canEdit || canDelete) && !editing && (
            <span className="ml-auto flex items-center opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(item.text);
                    setEditing(true);
                  }}
                  aria-label="Изменить"
                  className={`${ICON_BTN} -my-1`}
                >
                  <PencilIcon className="w-3.5 h-3.5" />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => setArmed(true)}
                  aria-label="Удалить ответ"
                  className={`${ICON_BTN} -my-1 hover:!text-blaze hover:!bg-blaze/10`}
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
          )}
        </div>
        {editing ? (
          <div className="mt-1.5">
            <CommentField value={draft} onChange={setDraft} onSubmit={save} placeholder="Комментарий" autoFocus />
            <div className="flex justify-end gap-1.5 mt-1.5">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="btn-ghost btn-sm h-8 py-0 active:scale-[0.96]"
              >
                Отмена
              </button>
              <button type="button" onClick={save} disabled={!draft.trim()} className="btn-accent btn-sm h-8 py-0">
                Сохранить
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap break-words text-pretty mt-0.5">
            {item.text}
            {/* «изменено» — в конце текста, а не в шапке: там его место
                занимают кнопки правки, и имя обрезалось бы */}
            {edited && <span className="text-xs text-ash whitespace-nowrap"> · изменено</span>}
          </p>
        )}
        {shot && onOpenShot && !editing && <ShotThumb shot={shot} onOpen={onOpenShot} />}
        {armed && (
          <InlineConfirm
            density="tight"
            className="gap-1.5 mt-1.5"
            message="Удалить ответ?"
            confirmLabel="Удалить"
            onCancel={() => setArmed(false)}
            onConfirm={async () => {
              setArmed(false);
              await onDelete?.();
            }}
          />
        )}
      </div>
    </div>
  );
}
