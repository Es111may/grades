'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Tooltip from '@/components/Tooltip';
import { ChatFillIcon, ChatIcon } from '@/components/icons';
import {
  commentHash,
  commentPath,
  parseCommentHash,
  type CommentAnchor,
  type CommentAnchorKind,
  type ViewRect,
} from '@/lib/commentAnchor';
import { createThread, fetchAllThreads, fetchPageThreads } from './api';
import { UI_ATTR, buildAnchor, isInsideUi, revealAnchor, type AnchorGeom } from './anchorDom';
import CommentComposer from './CommentComposer';
import { CommentPin, DraftPin, PIN, RectOutline, Z } from './CommentPins';
import CommentsPopover, { type CommentsScope, type LoadState } from './CommentsPopover';
import PlacementOverlay from './PlacementOverlay';
import ThreadCard from './ThreadCard';
import type { CommentStatus, CommentThread, CommentsViewer } from './types';
import { useAnchorGeoms } from './useAnchorGeoms';
import { useEscape } from './useEscape';

/** Флаг «Показывать метки» в localStorage: '0' — выключены, иначе включены. */
const PINS_KEY = 'ui-comments-pins';

/** Отступы кнопки от краёв окна и поповера от кнопки, px (см. классы ниже). */
const EDGE = 24;
const BUTTON = 48;
const POPOVER_W = 360;
const GAP = 12;

function readPinsPref(): boolean {
  try {
    return localStorage.getItem(PINS_KEY) !== '0';
  } catch {
    return true;
  }
}

/** Прямоугольник метки (и рамки, если есть) — к нему цепляется карточка. */
function markRect(g: AnchorGeom): ViewRect {
  const w = g.rect?.width ?? 0;
  const h = g.rect?.height ?? 0;
  return { left: g.x, top: g.y - PIN, width: Math.max(PIN, w), height: PIN + h };
}

/**
 * Комментарии к интерфейсу «как в Figma» для админа и лидов: кружок в
 * правом нижнем углу, поповер со списком, постановка точки или рамки,
 * метки на странице и карточка треда. Всё — порталом в body с position:
 * fixed: вёрстка страницы не сдвигается. Слой — над поп-апами страницы
 * (z-50), чтобы комментировать и внутри них.
 */
export default function CommentsRoot({ viewer }: { viewer: CommentsViewer }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const path = commentPath(pathname ?? '/', search?.toString());
  const pathRef = useRef(path);
  pathRef.current = path;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ── Данные ──────────────────────────────────────────────────────────
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  // Для какой страницы пришли треды: сразу после перехода в threads ещё
  // прошлая страница
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [all, setAll] = useState<CommentThread[] | null>(null);
  const [allState, setAllState] = useState<LoadState>('loading');
  const pageReq = useRef(0);
  const allReq = useRef(0);

  const load = useCallback(async () => {
    const id = ++pageReq.current;
    try {
      const list = await fetchPageThreads(path);
      if (id !== pageReq.current) return;
      setThreads(list);
      setLoadedPath(path);
      setState('ready');
    } catch {
      if (id === pageReq.current) setState('error');
    }
  }, [path]);

  const loadAll = useCallback(async () => {
    const id = ++allReq.current;
    setAllState((s) => (s === 'ready' ? s : 'loading'));
    try {
      const list = await fetchAllThreads();
      if (id !== allReq.current) return;
      setAll(list);
      setAllState('ready');
    } catch {
      if (id === allReq.current) setAllState('error');
    }
  }, []);

  // ── Интерфейс ───────────────────────────────────────────────────────
  const [popover, setPopover] = useState(false);
  const [scope, setScope] = useState<CommentsScope>('page');
  const [status, setStatus] = useState<CommentStatus>('open');
  const [showPins, setShowPinsState] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [draft, setDraft] = useState<{ key: string; anchor: CommentAnchor } | null>(null);
  const draftText = useRef('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Тред, который надо открыть, когда загрузятся треды его страницы
  // (ссылка с #comment-<id> или переход из «Все страницы»)
  const [pending, setPending] = useState<{ id: number; path: string } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => setShowPinsState(readPinsPref()), []);
  const setShowPins = useCallback((v: boolean) => {
    setShowPinsState(v);
    try {
      localStorage.setItem(PINS_KEY, v ? '1' : '0');
    } catch {
      // приватное окно — флаг живёт до перезагрузки
    }
  }, []);

  // Новая страница — свои треды; открытое на прошлой закрываем
  useEffect(() => {
    setThreads([]);
    setState('loading');
    setSelectedId(null);
    setDraft(null);
    setPlacing(false);
    void load();
  }, [load]);

  // Ссылка с #comment-<id>: при загрузке и при смене hash. Путь — тот же,
  // что у тредов (из usePathname + useSearchParams), а не из location: у
  // них может отличаться кодирование query
  useEffect(() => {
    const read = () => {
      const id = parseCommentHash(window.location.hash);
      if (id) setPending({ id, path: pathRef.current });
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  // Чужие комментарии — при возвращении во вкладку
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  // «Все страницы» — свежий список при каждом показе
  useEffect(() => {
    if (popover && scope === 'all') void loadAll();
  }, [popover, scope, loadAll]);

  // Номера меток — по порядку появления на странице: решённый тред номер
  // не освобождает, нумерация не прыгает
  const numbers = useMemo(() => {
    const m = new Map<number, number>();
    [...threads]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
      .forEach((t, i) => m.set(t.id, i + 1));
    return m;
  }, [threads]);

  // ── Геометрия меток ────────────────────────────────────────────────
  const entries = useMemo(
    () => [
      ...threads.map((t) => ({ key: `t${t.id}`, anchor: t.anchor })),
      ...(draft ? [{ key: draft.key, anchor: draft.anchor }] : []),
    ],
    [threads, draft],
  );
  const geomActive = mounted && (showPins || popover || selectedId != null || draft != null);
  const geoms = useAnchorGeoms(entries, geomActive);

  const selected = selectedId != null ? (threads.find((t) => t.id === selectedId) ?? null) : null;
  const selectedGeom = selected ? geoms.get(`t${selected.id}`) : undefined;
  const draftGeom = draft ? geoms.get(draft.key) : undefined;

  // Открыть тред по ссылке, когда треды страницы пришли
  useEffect(() => {
    if (!pending || pending.path !== path || state !== 'ready' || loadedPath !== path) return;
    const t = threads.find((x) => x.id === pending.id);
    setPending(null);
    if (!t) return;
    if (t.status === 'resolved') setStatus('resolved');
    setSelectedId(t.id);
    // Кадр — на отрисовку меток, потом прокрутка
    requestAnimationFrame(() => revealAnchor(t.anchor));
  }, [pending, path, state, loadedPath, threads]);

  // ── Действия ────────────────────────────────────────────────────────
  const focusButton = () => buttonRef.current?.focus({ preventScroll: true });

  const closeCard = useCallback(() => {
    const id = selectedId;
    setSelectedId(null);
    // Открыли по ссылке — убираем #comment-<id>, чтобы перезагрузка не
    // открывала тред снова
    if (id != null && parseCommentHash(window.location.hash) === id) {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    }
    // Фокус — на метку треда, если она есть, иначе на кнопку
    const pin = id != null ? document.querySelector<HTMLElement>(`[data-comment-pin="${id}"]`) : null;
    (pin ?? buttonRef.current)?.focus({ preventScroll: true });
  }, [selectedId]);

  useEscape(() => {
    setPopover(false);
    focusButton();
  }, popover);

  function togglePopover() {
    if (popover) {
      setPopover(false);
      return;
    }
    setPopover(true);
    void load();
    requestAnimationFrame(() => popoverRef.current?.focus({ preventScroll: true }));
  }

  function startPlacing() {
    setPopover(false);
    setSelectedId(null);
    setDraft(null);
    setPlacing(true);
  }

  function place(kind: CommentAnchorKind, selection: ViewRect) {
    // Пока оверлей в DOM: elementsFromPoint отсекает его как часть слоя
    const anchor = buildAnchor(kind, selection);
    setPlacing(false);
    if (anchor) setDraft({ key: `draft-${Date.now()}`, anchor });
  }

  async function submitDraft(text: string) {
    if (!draft) return;
    const t = await createThread(path, draft.anchor, text);
    setThreads((prev) => [...prev, t]);
    setAll((prev) => (prev ? [t, ...prev] : prev));
    setDraft(null);
    // Только что поставили — метку надо видеть
    setShowPins(true);
    if (status === 'resolved') setStatus('open');
  }

  const replaceThread = useCallback((t: CommentThread) => {
    const swap = (list: CommentThread[]) => list.map((x) => (x.id === t.id ? t : x));
    setThreads(swap);
    setAll((prev) => (prev ? swap(prev) : prev));
  }, []);

  const removeFromThread = useCallback((threadId: number, replyId?: number) => {
    const apply = (list: CommentThread[]) =>
      replyId == null
        ? list.filter((x) => x.id !== threadId)
        : list.map((x) =>
            x.id === threadId ? { ...x, replies: x.replies.filter((r) => r.id !== replyId) } : x,
          );
    setThreads(apply);
    setAll((prev) => (prev ? apply(prev) : prev));
    if (replyId == null) {
      setSelectedId(null);
      focusButton();
    }
  }, []);

  function pick(t: CommentThread) {
    if (t.path === path) {
      setSelectedId(t.id);
      requestAnimationFrame(() => revealAnchor(t.anchor));
      return;
    }
    // Другая страница: переходим, тред откроется там, когда придут её треды.
    // Если сменится и layout (admin → lead), слой смонтируется заново и
    // прочитает hash.
    setPopover(false);
    setPending({ id: t.id, path: t.path });
    router.push(`${t.path}${commentHash(t.id)}`);
  }

  // Tab внутри слоя — только наш: поп-апы страницы держат фокус в себе
  // (keepTabInside на window) и вернули бы его в поп-ап, пока открыт наш
  // поповер или карточка поверх него
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && isInsideUi(document.activeElement)) e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Клик мимо слоя закрывает поповер и карточку; новый комментарий — только
  // если в нём ничего не написано
  useEffect(() => {
    if (!popover && selectedId == null && !draft) return;
    const onDown = (e: MouseEvent) => {
      if (isInsideUi(e.target as Node)) return;
      setPopover(false);
      setSelectedId(null);
      if (!draftText.current.trim()) setDraft(null);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [popover, selectedId, draft]);

  if (!mounted) return null;

  // ── Отрисовка ──────────────────────────────────────────────────────
  const openCount = threads.filter((t) => t.status === 'open').length;
  const pinThreads = threads.filter(
    (t) =>
      t.id === selectedId ||
      (showPins && (t.status === 'open' || status === 'resolved')),
  );

  const listThreads = scope === 'page' ? [...threads].reverse() : (all ?? []);
  const listState = scope === 'page' ? state : allState;

  // Карточка без видимой метки: слева от поповера, если он открыт, иначе
  // над кнопкой
  const fallbackStyle: CSSProperties = popover
    ? { right: EDGE + POPOVER_W + GAP, bottom: EDGE + BUTTON + GAP }
    : { right: EDGE, bottom: EDGE + BUTTON + GAP };
  const cardAnchor =
    selectedGeom && (selectedGeom.status === 'ok' || selectedGeom.status === 'offscreen')
      ? markRect(selectedGeom)
      : null;

  return createPortal(
    <div {...{ [UI_ATTR]: '' }} className="hidden lg:block">
      {/* Рамки — под метками */}
      {pinThreads.map((t) => {
        const g = geoms.get(`t${t.id}`);
        if (!g || g.status !== 'ok' || !g.clip) return null;
        return <RectOutline key={`r${t.id}`} rect={g.clip} status={t.status} selected={t.id === selectedId} />;
      })}
      {pinThreads.map((t) => {
        const g = geoms.get(`t${t.id}`);
        if (!g || g.status !== 'ok') return null;
        return (
          <CommentPin
            key={t.id}
            id={t.id}
            number={numbers.get(t.id) ?? 0}
            status={t.status}
            x={g.x}
            y={g.y}
            selected={t.id === selectedId}
            preview={placing ? null : `${t.author.fullName}: ${t.text.slice(0, 120)}`}
            onClick={() => setSelectedId((cur) => (cur === t.id ? null : t.id))}
          />
        );
      })}

      {draft && draftGeom && draftGeom.status !== 'missing' && (
        <>
          {draftGeom.clip && <RectOutline rect={draftGeom.clip} status="draft" selected />}
          {draftGeom.status === 'ok' && <DraftPin x={draftGeom.x} y={draftGeom.y} />}
        </>
      )}

      {/* Кнопка: обводка не нужна — глубину даёт тень. Иконка: контур, при
          открытом поповере — заливка (обе в DOM, кросс-фейд). */}
      <Tooltip
        portal
        text={popover ? null : 'Комментарии'}
        align="right"
        tipClassName={Z.tip}
        className={`fixed right-6 bottom-6 ${Z.button}`}
      >
        <button
          ref={buttonRef}
          type="button"
          onClick={togglePopover}
          aria-label={openCount ? `Комментарии, открытых: ${openCount}` : 'Комментарии'}
          aria-haspopup="dialog"
          aria-expanded={popover}
          className={`relative w-12 h-12 rounded-pill bg-snow text-ink shadow-soft-lg
                      flex items-center justify-center hover:bg-canvas active:scale-[0.96]
                      transition-[background-color,transform] duration-150 ease-out`}
        >
          <ChatIcon
            className={`absolute w-[22px] h-[22px] transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
              popover ? 'opacity-0 scale-[0.25] blur-[4px]' : 'opacity-100 scale-100 blur-0'
            }`}
          />
          <ChatFillIcon
            className={`absolute w-[22px] h-[22px] transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
              popover ? 'opacity-100 scale-100 blur-0' : 'opacity-0 scale-[0.25] blur-[4px]'
            }`}
          />
          {openCount > 0 && (
            <span
              aria-hidden
              className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 rounded-pill bg-lime text-black ring-2 ring-snow
                         text-[11px] font-medium leading-none tabular-nums flex items-center justify-center"
            >
              {openCount}
            </span>
          )}
        </button>
      </Tooltip>

      {popover && (
        <CommentsPopover
          ref={popoverRef}
          scope={scope}
          onScope={setScope}
          status={status}
          onStatus={setStatus}
          threads={listThreads}
          state={listState}
          onRetry={() => void (scope === 'page' ? load() : loadAll())}
          numberOf={(id) => numbers.get(id) ?? null}
          isMissing={(t) => {
            const s = geoms.get(`t${t.id}`)?.status;
            return s === 'missing' || s === 'hidden';
          }}
          selectedId={selectedId}
          currentPath={path}
          showPins={showPins}
          onShowPins={setShowPins}
          onAdd={startPlacing}
          onPick={pick}
          onClose={() => {
            setPopover(false);
            focusButton();
          }}
        />
      )}

      {draft && draftGeom && (
        <CommentComposer
          anchor={
            draftGeom.status === 'missing' || draftGeom.status === 'hidden'
              ? { left: draftGeom.x, top: draftGeom.y, width: 0, height: 0 }
              : markRect(draftGeom)
          }
          textRef={draftText}
          onSubmit={submitDraft}
          onCancel={() => setDraft(null)}
        />
      )}

      {selected && (
        <ThreadCard
          key={selected.id}
          thread={selected}
          number={numbers.get(selected.id) ?? null}
          viewer={viewer}
          anchor={cardAnchor}
          fallbackStyle={fallbackStyle}
          missing={selectedGeom?.status === 'missing' || selectedGeom?.status === 'hidden'}
          onClose={closeCard}
          onChanged={replaceThread}
          onDeleted={removeFromThread}
        />
      )}

      {placing && <PlacementOverlay onPlace={place} onCancel={() => setPlacing(false)} />}
    </div>,
    document.body,
  );
}
