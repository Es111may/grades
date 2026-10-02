'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Tooltip from '@/components/Tooltip';
import { ChatFillIcon, ChatIcon } from '@/components/icons';
import {
  commentHash,
  commentPath,
  missingLabel,
  parseCommentHash,
  placeCaption,
  threadHint,
  type CommentAnchor,
  type CommentAnchorKind,
  type ViewRect,
} from '@/lib/commentAnchor';
import { COMMENTS_LAYER_ATTR, COMMENTS_LAYER_OPEN, isInCommentsLayer } from '@/lib/commentsLayer';
import {
  normalizeUiCommentPath,
  sameUiCommentPath,
  uiCommentPageOf,
  uiCommentPlaceHref,
} from '@/lib/uiCommentsShared';
import { createThread, fetchAllThreads, fetchPageThreads, uploadShot } from './api';
import { buildAnchor, measureAnchor, revealAnchor, type AnchorGeom } from './anchorDom';
import { captureShot, nextPaint, type CapturedShot } from './captureShot';
import CommentComposer, { type SubmitPhase } from './CommentComposer';
import { CommentPin, DraftPin, PIN, RectOutline, Z } from './CommentPins';
import CommentsPopover, { type CommentsScope, type LoadState } from './CommentsPopover';
import PlacementOverlay from './PlacementOverlay';
import ThreadCard from './ThreadCard';
import type { CommentStatus, CommentThread, CommentsViewer } from './types';
import { useAnchorGeoms } from './useAnchorGeoms';
import { useEscape } from './useEscape';

/** Флаг «Показывать метки» в localStorage: '0' — выключены, иначе включены. */
const PINS_KEY = 'ui-comments-pins';

/**
 * Сколько ждать, пока страница откроет место треда (поп-ап 360 по
 * ?person=), прежде чем показать карточку без метки, мс.
 */
const PLACE_WAIT_MS = 1500;

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
 * (z-50), чтобы комментировать и внутри них; события слоя поп-апы и меню
 * страницы не закрывают (lib/commentsLayer).
 *
 * Место и страница. path — где человек сейчас: адрес без hash, из search —
 * только параметры места (lib/uiCommentsShared: ?person= у поп-апа 360).
 * page — та же страница без поп-апов. Треды грузятся по page — все места
 * страницы сразу, — а метки рисуются только у тредов текущего path: в
 * поп-апе одного человека не видно меток из поп-апа другого.
 */
export default function CommentsRoot({ viewer }: { viewer: CommentsViewer }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const path = normalizeUiCommentPath(commentPath(pathname ?? '/', search?.toString()));
  const page = uiCommentPageOf(path);
  const pathRef = useRef(path);
  pathRef.current = path;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ── Данные ──────────────────────────────────────────────────────────
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  // Для какой страницы пришли треды: сразу после перехода в threads ещё
  // прошлая страница
  const [loadedPage, setLoadedPage] = useState<string | null>(null);
  const [all, setAll] = useState<CommentThread[] | null>(null);
  const [allState, setAllState] = useState<LoadState>('loading');
  const pageReq = useRef(0);
  const allReq = useRef(0);

  const load = useCallback(async () => {
    const id = ++pageReq.current;
    try {
      const list = await fetchPageThreads(page);
      if (id !== pageReq.current) return;
      setThreads(list);
      setLoadedPage(page);
      setState('ready');
    } catch {
      if (id === pageReq.current) setState('error');
    }
  }, [page]);

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
  // path — место, где поставили отметку: туда тред и запишется, даже если
  // поп-ап успели закрыть, пока писали
  const [draft, setDraft] = useState<{ key: string; anchor: CommentAnchor; path: string } | null>(null);
  const draftText = useRef('');
  // Снимок отметки: если отправка не удалась, повтор не снимает заново
  const draftShot = useRef<{ key: string; shot: CapturedShot | null } | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Тред, который надо открыть, когда загрузятся треды его страницы и
  // откроется его место (ссылка с #comment-<id>, переход из списка в поп-ап
  // другого человека или на другую страницу). moved — адрес места уже
  // поставили; waited — дольше ждать не стали, карточка — без метки.
  const [pending, setPending] = useState<{
    id: number;
    path: string;
    moved?: boolean;
    waited?: boolean;
  } | null>(null);
  // Тред, к метке которого прокрутить, как только метка появится
  const revealId = useRef<number | null>(null);
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

  // Новая страница — свои треды; открытое на прошлой закрываем. Поп-ап на
  // той же странице — не новая страница: треды те же, меняются метки
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

  // Номера меток — по порядку появления в своём месте (странице или поп-апе
  // конкретного человека): решённый тред номер не освобождает, нумерация не
  // прыгает, а в каждом поп-апе метки начинаются с 1
  const numbers = useMemo(() => {
    const m = new Map<number, number>();
    const perPlace = new Map<string, number>();
    [...threads]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
      .forEach((t) => {
        const place = normalizeUiCommentPath(t.path);
        const n = (perPlace.get(place) ?? 0) + 1;
        perPlace.set(place, n);
        m.set(t.id, n);
      });
    return m;
  }, [threads]);

  // Треды того места, что открыто сейчас: только у них метки на экране
  const hereIds = useMemo(
    () => new Set(threads.filter((t) => sameUiCommentPath(t.path, path)).map((t) => t.id)),
    [threads, path],
  );
  const isHere = useCallback((t: CommentThread) => hereIds.has(t.id), [hereIds]);

  // ── Геометрия меток ────────────────────────────────────────────────
  const entries = useMemo(
    () => [
      ...threads.filter((t) => hereIds.has(t.id)).map((t) => ({ key: `t${t.id}`, anchor: t.anchor })),
      ...(draft ? [{ key: draft.key, anchor: draft.anchor }] : []),
    ],
    [threads, hereIds, draft],
  );
  const geomActive = mounted && (showPins || popover || selectedId != null || draft != null);
  const geoms = useAnchorGeoms(entries, geomActive);

  const selected = selectedId != null ? (threads.find((t) => t.id === selectedId) ?? null) : null;
  const selectedHere = !!selected && hereIds.has(selected.id);
  const selectedGeom = selected && selectedHere ? geoms.get(`t${selected.id}`) : undefined;
  const draftGeom = draft ? geoms.get(draft.key) : undefined;

  /** Карточка треда; к метке прокрутим, когда она появится на экране. */
  const showThread = useCallback((t: CommentThread) => {
    if (t.status === 'resolved') setStatus('resolved');
    setSelectedId(t.id);
    revealId.current = t.id;
  }, []);

  // Открыть тред по ссылке или из списка, когда треды его страницы пришли.
  // Тред из другого места этой страницы (поп-ап 360 другого человека, сама
  // страница под поп-апом) — сначала адрес места: страница откроет или
  // закроет поп-ап сама (UsersClient читает ?person=). Карточку показываем,
  // когда место открылось, а не дождались — через PLACE_WAIT_MS без метки
  useEffect(() => {
    if (!pending || uiCommentPageOf(pending.path) !== page) return;
    if (state !== 'ready' || loadedPage !== page) return;
    const t = threads.find((x) => x.id === pending.id);
    if (!t) {
      setPending(null);
      return;
    }
    if (!sameUiCommentPath(t.path, path) && !pending.waited) {
      if (!pending.moved) {
        window.history.replaceState(null, '', uiCommentPlaceHref(window.location.href, t.path));
        setPending({ ...pending, moved: true });
        return;
      }
      const timer = window.setTimeout(
        () => setPending((p) => (p && p.id === pending.id ? { ...p, waited: true } : p)),
        PLACE_WAIT_MS,
      );
      return () => window.clearTimeout(timer);
    }
    setPending(null);
    showThread(t);
  }, [pending, page, path, state, loadedPage, threads, showThread]);

  // Прокрутка к метке выбранного треда — как только метка измерена: у треда
  // из поп-апа она появляется, когда поп-ап откроется
  useEffect(() => {
    const id = revealId.current;
    if (id == null || id !== selectedId) return;
    const g = geoms.get(`t${id}`);
    if (!g || (g.status !== 'ok' && g.status !== 'offscreen')) return;
    revealId.current = null;
    const t = threads.find((x) => x.id === id);
    if (t) revealAnchor(t.anchor);
  }, [geoms, selectedId, threads]);

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
    if (anchor) setDraft({ key: `draft-${Date.now()}`, anchor, path });
  }

  async function submitDraft(text: string, onPhase: (phase: SubmitPhase) => void) {
    if (!draft) return;
    const d = draft;
    // Снимок — до отправки, пока страница такая, какой её видел автор; слой
    // комментариев (и само поле) в него не попадает. Ошибка снимка не мешает
    // комментарию: captureShot не бросает
    let shot = draftShot.current?.key === d.key ? draftShot.current.shot : undefined;
    if (shot === undefined) {
      onPhase('shot');
      await nextPaint();
      shot = await captureShot(d.anchor.kind, measureAnchor(d.anchor));
      draftShot.current = { key: d.key, shot };
      onPhase('send');
    }
    const t = await createThread(d.path, d.anchor, text);
    draftShot.current = null;
    setThreads((prev) => [...prev, t]);
    setAll((prev) => (prev ? [t, ...prev] : prev));
    setDraft(null);
    // Только что поставили — метку надо видеть
    setShowPins(true);
    if (status === 'resolved') setStatus('open');
    if (shot) void attachShot(t.id, shot);
  }

  const replaceThread = useCallback((t: CommentThread) => {
    const swap = (list: CommentThread[]) => list.map((x) => (x.id === t.id ? t : x));
    setThreads(swap);
    setAll((prev) => (prev ? swap(prev) : prev));
  }, []);

  /** Снимок — к уже созданному треду; не загрузился — тред остаётся без него. */
  const attachShot = useCallback(async (threadId: number, shot: CapturedShot) => {
    try {
      const screenshot = await uploadShot(threadId, shot.blob);
      const apply = (list: CommentThread[]) => list.map((x) => (x.id === threadId ? { ...x, screenshot } : x));
      setThreads(apply);
      setAll((prev) => (prev ? apply(prev) : prev));
    } catch (e) {
      console.warn('[comments] снимок не загрузился — комментарий без него', e);
    }
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
    if (sameUiCommentPath(t.path, path)) {
      showThread(t);
      return;
    }
    // Другое место этой страницы — поп-ап другого человека или сама
    // страница: адрес места ставит эффект pending, поповер остаётся
    if (uiCommentPageOf(t.path) === page) {
      setSelectedId(null);
      setPending({ id: t.id, path: t.path });
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
      if (e.key === 'Tab' && isInCommentsLayer(document.activeElement)) e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Клик мимо слоя закрывает поповер и карточку; новый комментарий — только
  // если в нём ничего не написано
  useEffect(() => {
    if (!popover && selectedId == null && !draft) return;
    const onDown = (e: MouseEvent) => {
      if (isInCommentsLayer(e.target)) return;
      setPopover(false);
      setSelectedId(null);
      if (!draftText.current.trim()) setDraft(null);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [popover, selectedId, draft]);

  if (!mounted) return null;

  // ── Отрисовка ──────────────────────────────────────────────────────
  // На кружке — открытые на всей странице, вместе с поп-апами
  const openCount = threads.filter((t) => t.status === 'open').length;
  const pinThreads = threads.filter(
    (t) =>
      hereIds.has(t.id) &&
      (t.id === selectedId || (showPins && (t.status === 'open' || status === 'resolved'))),
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
  const selectedMissing = selectedGeom?.status === 'missing' || selectedGeom?.status === 'hidden';
  // Что-то открыто — Escape страниц его не трогает (lib/commentsLayer)
  const layerOpen = popover || placing || !!draft || selected != null;

  return createPortal(
    <div {...{ [COMMENTS_LAYER_ATTR]: layerOpen ? COMMENTS_LAYER_OPEN : '' }} className="hidden lg:block">
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
          numberOf={(t) => (hereIds.has(t.id) ? (numbers.get(t.id) ?? null) : null)}
          isHere={isHere}
          captionOf={placeCaption}
          missingOf={(t) => {
            if (!hereIds.has(t.id)) return null;
            const s = geoms.get(`t${t.id}`)?.status;
            return s === 'missing' || s === 'hidden' ? missingLabel(t.anchor) : null;
          }}
          selectedId={selectedId}
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
          hint={threadHint({ ...selected, here: selectedHere, missing: selectedMissing })}
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
