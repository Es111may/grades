'use client';

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import Avatar from '@/components/Avatar';
import Segmented from '@/components/Segmented';
import { ChatIcon, ChevronDownIcon, CloseIcon, PlusIcon } from '@/components/icons';
import { commentHash, pageLabel, plural, relativeTime } from '@/lib/commentAnchor';
import { isUiCommentPopupPath, type UiCommentShotDto } from '@/lib/uiCommentsShared';
import { PinShape, Z } from './CommentPins';
import { ShotChip, ShotLightbox } from './ShotPreview';
import ThreadBody, { ICON_BTN } from './ThreadBody';
import type { CommentStatus, CommentThread, CommentsViewer } from './types';
import { useEscape } from './useEscape';

export type CommentsScope = 'page' | 'all';
export type LoadState = 'loading' | 'ready' | 'error';

/**
 * Поповер над кнопкой: «Эта страница · Все страницы», в одном ряду фильтр
 * «Открытые · Решённые» и маленькая «Оставить», список тредов и выключатель
 * меток. Клик по треду этой страницы — прокрутка к метке и карточка; по
 * треду из поп-апа — открывается поп-ап этого человека, потом карточка; по
 * треду другой страницы — тред открывается прямо здесь, вместо списка
 * (`detail`): переход туда не нужен, а страница могла бы и не пустить —
 * оценка или портрет чужого дизайнера уводят на «Команду». Туда ведёт
 * «Перейти к месту». Список при этом не размонтируется — скрыт, и «Назад»
 * (или Escape) возвращает его с той же прокруткой и фокусом на строке.
 * Миниатюра снимка в строке открывает снимок целиком, не трогая строку.
 *
 * «Эта страница» — треды страницы вместе с её поп-апами. Номер-метка — у
 * тредов того места, что открыто сейчас; у остальных — аватар и подпись
 * места («В поп-апе: Саша Тимкина», «На странице»).
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
    /** Номер метки — только у тредов места, открытого сейчас. */
    numberOf: (t: CommentThread) => number | null;
    /** Тред места, открытого сейчас (метка — на экране). */
    isHere: (t: CommentThread) => boolean;
    /** Подпись места для треда не отсюда. */
    captionOf: (t: CommentThread) => string;
    /** Место треда отсюда не нашлось — что сказать в строке; null — нашлось. */
    missingOf: (t: CommentThread) => string | null;
    selectedId: number | null;
    showPins: boolean;
    onShowPins: (v: boolean) => void;
    onAdd: () => void;
    onPick: (t: CommentThread) => void;
    onClose: () => void;
    /** Тред другой страницы, открытый вместо списка; null — список. */
    detail: CommentThread | null;
    viewer: CommentsViewer;
    /** Из треда — обратно к списку. */
    onBack: () => void;
    /** «Перейти к месту»: на страницу треда, он откроется там. */
    onGo: (t: CommentThread) => void;
    onChanged: (t: CommentThread) => void;
    onDeleted: (threadId: number, replyId?: number) => void;
  }
>(function CommentsPopover(p, ref) {
  const rootRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => rootRef.current as HTMLDivElement);
  const listRef = useRef<HTMLDivElement>(null);
  // Прокрутка списка в момент клика по строке: скрытый (display: none)
  // список её теряет, а «Назад» должен вернуть туда же
  const listScroll = useRef(0);
  // Снимок целиком — из миниатюры строки или из треда в поповере
  const [shot, setShot] = useState<UiCommentShotDto | null>(null);

  const open = p.threads.filter((t) => t.status === 'open').length;
  const resolved = p.threads.length - open;
  const list = p.threads.filter((t) => t.status === p.status);
  const detailId = p.detail?.id ?? null;

  // Вернулись из треда: прокрутка списка — как была, фокус — на строку
  // треда (её может не быть: тред удалили или он ушёл в другой фильтр —
  // тогда на поповер). До отрисовки: без кадра со списком в начале
  const shownDetail = useRef<number | null>(null);
  useLayoutEffect(() => {
    const prev = shownDetail.current;
    shownDetail.current = detailId;
    if (prev == null || detailId != null) return;
    if (listRef.current) listRef.current.scrollTop = listScroll.current;
    const row = rootRef.current?.querySelector<HTMLElement>(`[data-thread-row="${prev}"]`);
    (row ?? rootRef.current)?.focus({ preventScroll: true });
  }, [detailId]);

  /** Подпись места в «Все страницы»: страница и поп-ап, если он. */
  const allPlace = (t: CommentThread) =>
    [pageLabel(t.path), isUiCommentPopupPath(t.path) ? p.captionOf(t) : null].filter(Boolean).join(' · ');

  return (
    <>
      <div
        ref={rootRef}
        role="dialog"
        aria-label="Комментарии"
        tabIndex={-1}
        className={`fixed right-6 bottom-[84px] ${Z.popover} w-[360px] max-h-[70vh] flex flex-col
                    card shadow-soft-lg outline-none animate-scale-in origin-bottom-right`}
      >
        {p.detail && (
          <ThreadDetail
            key={p.detail.id}
            thread={p.detail}
            viewer={p.viewer}
            place={allPlace(p.detail)}
            onBack={p.onBack}
            onClose={p.onClose}
            onGo={p.onGo}
            onOpenShot={setShot}
            onChanged={p.onChanged}
            onDeleted={p.onDeleted}
          />
        )}

        {/* Список — скрыт, пока открыт тред: прокрутка и состояние живы */}
        <div className={`shrink-0 px-4 pt-3 pb-3 space-y-3 ${p.detail ? 'hidden' : ''}`}>
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

          {/* Компактный сегмент (h-8, как в «Динамике по месяцам») — все три
              ряда шапки одной высоты, шаг между ними 12px. */}
          <Segmented
            size="compact"
            press
            label="Какие комментарии"
            className="w-full"
            itemClassName="flex-1 justify-center"
            value={p.scope}
            onChange={p.onScope}
            options={[
              { value: 'page', label: 'Эта страница' },
              { value: 'all', label: 'Все страницы' },
            ]}
          />

          {/* Фильтр слева, «Оставить» справа в том же ряду. Порядок Tab — чипы,
              затем кнопка. На «Все страницы» кнопка остаётся: комментарий
              ставится на текущую страницу. */}
          <div className="flex items-center gap-2">
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

            {/* Высота как у чипов; слева у иконки отступ меньше — оптически
                плюс «легче» буквы. Фокус — общий :focus-visible (sky-контур). */}
            <button
              type="button"
              onClick={p.onAdd}
              aria-label="Оставить комментарий"
              className="btn-accent btn-sm ml-auto shrink-0 h-8 py-0 pl-2.5 pr-3 gap-1 active:scale-[0.96]
                         transition-[filter,transform]"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Оставить
            </button>
          </div>
        </div>

        <div
          ref={listRef}
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-cloud p-2 ${p.detail ? 'hidden' : ''}`}
        >
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
                  Нажми «Оставить» и кликни в нужное место или протяни рамку
                </p>
              )}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {list.map((t) => (
                <li key={t.id}>
                  <ThreadRow
                    thread={t}
                    number={p.scope === 'page' ? p.numberOf(t) : null}
                    place={p.scope === 'all' ? allPlace(t) : p.isHere(t) ? null : p.captionOf(t)}
                    here={p.scope === 'all' && p.isHere(t)}
                    missing={p.scope === 'page' ? p.missingOf(t) : null}
                    selected={t.id === p.selectedId}
                    onClick={() => {
                      listScroll.current = listRef.current?.scrollTop ?? 0;
                      p.onPick(t);
                    }}
                    onOpenShot={setShot}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <label
          className={`shrink-0 flex items-center gap-3 border-t border-cloud px-4 h-12 cursor-pointer ${p.detail ? 'hidden' : ''}`}
        >
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
      {/* Рядом с поповером, а не внутри: у него transform-анимация, и
          fixed-просмотр встал бы относительно него */}
      {shot && <ShotLightbox shot={shot} onClose={() => setShot(null)} />}
    </>
  );
});

export default CommentsPopover;

/**
 * Тред другой страницы — вместо списка, тем же ThreadBody, что у карточки
 * при метке. Шапка — «Назад» и действия треда на местах шапки поповера,
 * под ней — где тред и «Перейти к месту». Escape — к списку (в стеке слоя
 * выше поповера: тред открывается позже); фокус — сюда, как у карточки.
 * Прокрутка — внутри, поповер не выше 70vh.
 */
function ThreadDetail({
  thread,
  viewer,
  place,
  onBack,
  onClose,
  onGo,
  onOpenShot,
  onChanged,
  onDeleted,
}: {
  thread: CommentThread;
  viewer: CommentsViewer;
  /** «Оценка», «Команда · В поп-апе: Саша Тимкина». */
  place: string;
  onBack: () => void;
  onClose: () => void;
  onGo: (t: CommentThread) => void;
  onOpenShot: (shot: UiCommentShotDto) => void;
  onChanged: (t: CommentThread) => void;
  onDeleted: (threadId: number, replyId?: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onBack, true);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [thread.id]);

  return (
    <div ref={ref} role="group" aria-label="Комментарий" tabIndex={-1} className="min-h-0 flex flex-col outline-none">
      <ThreadBody
        thread={thread}
        viewer={viewer}
        variant="popover"
        start={
          <button type="button" onClick={onBack} aria-label="Назад к списку" className={ICON_BTN}>
            <ChevronDownIcon className="w-4 h-4 rotate-90" />
          </button>
        }
        above={
          <div className="shrink-0 flex items-center gap-3 px-4 pb-3 text-xs">
            <span className="min-w-0 truncate text-stone" title={place}>
              {place}
            </span>
            {/* Ссылка, а не кнопка: Cmd/Ctrl-клик и средняя кнопка — в новой
                вкладке, тред там откроется по #comment-<id>. Обычный клик —
                переход внутри приложения (onGo) */}
            <a
              href={`${thread.path}${commentHash(thread.id)}`}
              data-go-to-place
              onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                onGo(thread);
              }}
              className="ml-auto shrink-0 inline-flex items-center gap-0.5 font-medium text-ink
                         hover:underline underline-offset-2"
            >
              Перейти к месту
              <ChevronDownIcon className="w-3.5 h-3.5 -rotate-90" />
            </a>
          </div>
        }
        hint={null}
        onClose={onClose}
        onOpenShot={() => thread.screenshot && onOpenShot(thread.screenshot)}
        onChanged={onChanged}
        onDeleted={onDeleted}
      />
    </div>
  );
}

/**
 * Строка списка: метка или аватар, автор и дата, начало текста; ниже —
 * место (страница или поп-ап), ответы и «Место не найдено». Есть снимок
 * места — миниатюра справа.
 */
function ThreadRow({
  thread,
  number,
  place,
  here,
  missing,
  selected,
  onClick,
  onOpenShot,
}: {
  thread: CommentThread;
  number: number | null;
  /** «Команда · В поп-апе: Саша Тимкина» или «В поп-апе: …»; null — не нужно. */
  place: string | null;
  /** Тред того места, что открыто сейчас (для «Все страницы»). */
  here: boolean;
  missing: string | null;
  selected: boolean;
  onClick: () => void;
  onOpenShot: (shot: UiCommentShotDto) => void;
}) {
  const replies = thread.replies.length;
  const shot = thread.screenshot;
  // Миниатюра — своя кнопка поверх места в строке (кнопка в кнопке
  // недопустима); ховер строки — от обёртки, чтобы не гас над миниатюрой
  return (
    <div className="group/row relative">
      <button
        type="button"
        onClick={onClick}
        data-thread-row={thread.id}
        aria-current={selected || undefined}
        className={`w-full text-left flex gap-3 p-3 rounded-[14px]
                    transition-colors duration-150 ${selected ? 'bg-ink/[0.07]' : 'group-hover/row:bg-ink/[0.04]'}`}
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
          {(replies > 0 || missing || place) && (
            <span className="flex items-center gap-1.5 flex-wrap mt-1.5 text-xs text-stone">
              {place && <span className={here ? 'text-ink' : ''}>{here ? `${place} · эта страница` : place}</span>}
              {place && replies > 0 && <span aria-hidden>·</span>}
              {replies > 0 && (
                <span className="tabular-nums">
                  {replies} {plural(replies, ['ответ', 'ответа', 'ответов'])}
                </span>
              )}
              {missing && (
                <span className="text-sunset" title={thread.anchor?.snippet}>
                  {replies > 0 || place ? '· ' : ''}
                  {missing}
                </span>
              )}
            </span>
          )}
        </span>
        {shot && <span aria-hidden className="w-10 h-7 shrink-0" />}
      </button>
      {shot && (
        <button
          type="button"
          onClick={() => onOpenShot(shot)}
          data-thread-shot={thread.id}
          aria-label="Открыть снимок целиком"
          className="absolute top-3 right-3 rounded-[4px] cursor-zoom-in hover:opacity-90 transition-opacity duration-150"
        >
          <ShotChip shot={shot} />
        </button>
      )}
    </div>
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
