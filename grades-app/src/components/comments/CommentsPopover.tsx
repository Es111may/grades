'use client';

import { forwardRef } from 'react';
import Avatar from '@/components/Avatar';
import { ChatIcon, CloseIcon, PlusIcon } from '@/components/icons';
import { pageLabel, plural, relativeTime } from '@/lib/commentAnchor';
import { PinShape, Z } from './CommentPins';
import type { CommentStatus, CommentThread } from './types';

export type CommentsScope = 'page' | 'all';
export type LoadState = 'loading' | 'ready' | 'error';

/**
 * Поповер над кнопкой: «Эта страница · Все страницы», «Оставить
 * комментарий», фильтр «Открытые · Решённые», список тредов и выключатель
 * меток. Клик по треду этой страницы — прокрутка к метке и карточка; по
 * треду другой страницы — переход туда, тред откроется там.
 */
const CommentsPopover = forwardRef<
  HTMLDivElement,
  {
    scope: CommentsScope;
    onScope: (s: CommentsScope) => void;
    status: CommentStatus;
    onStatus: (s: CommentStatus) => void;
    threads: CommentThread[];
    state: LoadState;
    onRetry: () => void;
    /** Номер метки треда этой страницы. */
    numberOf: (id: number) => number | null;
    /** Место треда не нашлось на странице. */
    isMissing: (t: CommentThread) => boolean;
    selectedId: number | null;
    currentPath: string;
    showPins: boolean;
    onShowPins: (v: boolean) => void;
    onAdd: () => void;
    onPick: (t: CommentThread) => void;
    onClose: () => void;
  }
>(function CommentsPopover(p, ref) {
  const open = p.threads.filter((t) => t.status === 'open').length;
  const resolved = p.threads.length - open;
  const list = p.threads.filter((t) => t.status === p.status);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Комментарии"
      tabIndex={-1}
      className={`fixed right-6 bottom-[84px] ${Z.popover} w-[360px] max-h-[70vh] flex flex-col
                  card shadow-soft-lg outline-none animate-scale-in origin-bottom-right`}
    >
      <div className="shrink-0 px-4 pt-3 pb-3 space-y-3">
        <div className="flex items-center gap-2 h-8">
          <h2 className="font-display text-lg font-medium tracking-tight">Комментарии</h2>
          <button
            type="button"
            onClick={p.onClose}
            aria-label="Закрыть"
            className="ml-auto -mr-1 w-8 h-8 rounded-pill flex items-center justify-center text-stone
                       hover:text-ink hover:bg-ink/5 active:scale-[0.96]
                       transition-[color,background-color,transform] duration-150 ease-out"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="segmented w-full" role="group" aria-label="Какие комментарии">
          {(
            [
              ['page', 'Эта страница'],
              ['all', 'Все страницы'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={p.scope === key}
              onClick={() => p.onScope(key)}
              className={`segmented-item flex-1 justify-center ${p.scope === key ? 'segmented-item-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={p.onAdd}
          className="btn-accent w-full h-10 py-0 active:scale-[0.96]"
        >
          <PlusIcon />
          Оставить комментарий
        </button>

        <div className="flex items-center gap-1" role="group" aria-label="Статус">
          {(
            [
              ['open', 'Открытые', open],
              ['resolved', 'Решённые', resolved],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              aria-pressed={p.status === key}
              onClick={() => p.onStatus(key)}
              className={`chip h-8 px-3 active:scale-[0.96] transition-[color,background-color,transform] duration-150 ${
                p.status === key ? 'bg-ink text-snow' : 'bg-ink/[0.07] text-stone hover:text-ink'
              }`}
            >
              {label}
              <span className={`tabular-nums ${p.status === key ? 'text-snow/70' : 'text-ash'}`}>{count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-cloud p-2">
        {p.state === 'loading' && p.threads.length === 0 ? (
          <ListSkeleton />
        ) : p.state === 'error' && p.threads.length === 0 ? (
          <div className="text-center px-4 py-8">
            <p className="text-sm text-ink">Не удалось загрузить комментарии</p>
            <button type="button" onClick={p.onRetry} className="btn-secondary btn-sm mt-3 active:scale-[0.96]">
              Повторить
            </button>
          </div>
        ) : list.length === 0 ? (
          <div className="text-center px-4 py-8">
            <div className="w-10 h-10 rounded-full bg-ink/5 text-stone flex items-center justify-center mx-auto">
              <ChatIcon className="w-[18px] h-[18px]" />
            </div>
            <p className="text-sm text-ink mt-3">
              {p.status === 'resolved'
                ? 'Решённых пока нет'
                : p.scope === 'page'
                  ? 'Здесь пока нет комментариев'
                  : 'Открытых комментариев нет'}
            </p>
            {p.status === 'open' && p.scope === 'page' && (
              <p className="text-xs text-stone mt-1 text-pretty">
                «Оставить комментарий» — и кликни в нужное место или протяни рамку
              </p>
            )}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {list.map((t) => (
              <li key={t.id}>
                <ThreadRow
                  thread={t}
                  number={p.scope === 'page' ? p.numberOf(t.id) : null}
                  page={p.scope === 'all' ? pageLabel(t.path) : null}
                  here={t.path === p.currentPath}
                  missing={p.scope === 'page' && p.isMissing(t)}
                  selected={t.id === p.selectedId}
                  onClick={() => p.onPick(t)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="shrink-0 flex items-center gap-3 border-t border-cloud px-4 h-12 cursor-pointer">
        <span className="text-[13px] text-ink">Показывать метки</span>
        <button
          type="button"
          role="switch"
          aria-checked={p.showPins}
          onClick={() => p.onShowPins(!p.showPins)}
          className={`relative ml-auto w-9 h-5 rounded-full transition-colors duration-150 ${
            p.showPins ? 'bg-emerald' : 'bg-cloud'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-150 ease-out ${
              p.showPins ? 'translate-x-4' : ''
            }`}
          />
        </button>
      </label>
    </div>
  );
});

export default CommentsPopover;

/** Строка списка: метка или аватар, автор и дата, начало текста, ответы. */
function ThreadRow({
  thread,
  number,
  page,
  here,
  missing,
  selected,
  onClick,
}: {
  thread: CommentThread;
  number: number | null;
  page: string | null;
  here: boolean;
  missing: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const replies = thread.replies.length;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected || undefined}
      className={`w-full text-left flex gap-3 p-3 rounded-[14px]
                  transition-colors duration-150 ${selected ? 'bg-ink/[0.07]' : 'hover:bg-ink/[0.04]'}`}
    >
      {number != null ? (
        <PinShape status={thread.status}>{number}</PinShape>
      ) : (
        <Avatar name={thread.author.fullName} avatarUrl={thread.author.avatarUrl} size={24} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1 text-[13px] leading-tight">
          <span className="font-medium text-ink truncate">{thread.author.fullName}</span>
          <span className="text-stone shrink-0">· {relativeTime(thread.createdAt)}</span>
        </span>
        <span className="text-sm text-graphite leading-snug mt-1 line-clamp-2 break-words">
          {thread.text}
        </span>
        {(replies > 0 || missing || page) && (
          <span className="flex items-center gap-1.5 flex-wrap mt-1.5 text-xs text-stone">
            {page && <span className={here ? 'text-ink' : ''}>{here ? `${page} · эта страница` : page}</span>}
            {page && replies > 0 && <span aria-hidden>·</span>}
            {replies > 0 && (
              <span className="tabular-nums">
                {replies} {plural(replies, ['ответ', 'ответа', 'ответов'])}
              </span>
            )}
            {missing && (
              <span className="text-sunset" title={thread.anchor?.snippet}>
                {replies > 0 ? '· ' : ''}Место не найдено
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-0.5" aria-busy="true" aria-label="Загрузка">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3 p-3">
          <div className="w-6 h-6 rounded-full bg-ink/[0.06] animate-pulse" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-3 w-2/5 rounded-pill bg-ink/[0.06] animate-pulse" />
            <div className="h-3 w-4/5 rounded-pill bg-ink/[0.06] animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
