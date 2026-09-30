'use client';

/**
 * Единый хинт сервиса (Pavel: «хинты везде одинаковые по стилистике»):
 * светлая карточка-поповер по ховеру — стиль информера самооценки.
 * CSS-only (named group — не конфликтует с group острова/строк),
 * мгновенный показ, плавное появление, без нативного title.
 *
 * Использование:
 *   <Tooltip text="Подсказка" align="center"><button …/></Tooltip>
 *
 * portal — для якорей внутри overflow: hidden (обрезка имени в строке,
 * карточка таблицы): CSS-поповер там обрезается и не виден вовсе. С portal
 * поповер рендерится в document.body с position: fixed, координаты — от
 * якоря (см. lib/tooltipPlacement). Показ по ховеру и по фокусу с
 * клавиатуры, скрытие — уход мыши, blur, Escape, нажатие.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
  type FocusEvent,
  type PointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  placeTooltip,
  VIEWPORT_MARGIN,
  type TooltipAlign,
  type TooltipPlacement,
} from '@/lib/tooltipPlacement';

type TooltipProps = {
  text: ReactNode;
  children: ReactNode;
  className?: string;
  align?: TooltipAlign;
  /** Максимальная ширина поповера в px (ширина — по контенту). */
  maxWidth?: number;
  style?: CSSProperties;
  /**
   * Поповер через портал в body (position: fixed) — не обрезается
   * overflow: hidden предков. Включать там, где CSS-хинт обрезан.
   */
  portal?: boolean;
  /**
   * Доп. классы самого поповера (только portal): он живёт вне якоря и не
   * наследует его обёрток — например, salary-sensitive.
   */
  tipClassName?: string;
};

// Внешний вид поповера — общий для обоих режимов
const TIP_LOOK = `card p-3 text-left text-xs text-stone leading-relaxed shadow-soft-lg
                  font-normal normal-case tracking-normal whitespace-normal break-words
                  font-sans`;

export default function Tooltip(props: TooltipProps) {
  if (props.portal) return <PortalTooltip {...props} />;
  const {
    text,
    children,
    className = '',
    align = 'left',
    maxWidth = 280,
    style,
  } = props;
  const pos =
    align === 'center'
      ? 'left-1/2 -translate-x-1/2'
      : align === 'right'
        ? 'right-0'
        : 'left-0';
  return (
    <span className={`group/tt relative inline-flex ${className}`} style={style}>
      {children}
      {text != null && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute top-full mt-2 ${pos} z-40
                      ${TIP_LOOK}
                      opacity-0 translate-y-1 transition-all duration-150
                      group-hover/tt:opacity-100 group-hover/tt:translate-y-0`}
          style={{ maxWidth, width: 'max-content' }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

// useLayoutEffect на сервере ругается в консоль; там он и не нужен —
// портал монтируется только по событию в браузере.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Длительность появления/исчезания — как duration-150 у CSS-хинта. */
const FADE_MS = 150;
// Фокусируемое внутри якоря — тогда свой таб-стоп обёртке не нужен
const FOCUSABLE =
  'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
// Якорь внутри кнопки/ссылки (карточка подиума) — таб-стоп внутри
// интерактивного элемента запрещён, фокус остаётся у кнопки
const INTERACTIVE = 'a[href], button, [role="button"]';

function PortalTooltip({
  text,
  children,
  className = '',
  align = 'left',
  maxWidth = 280,
  style,
  tipClassName = '',
}: TooltipProps) {
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  // open — хинт должен быть показан; mounted — поповер в DOM (живёт ещё
  // FADE_MS после закрытия, чтобы доиграть исчезание); shown — видимое
  // состояние анимации (включается, когда поповер встал на место); animate —
  // переход включён: не раньше, чем поповер встал на место в скрытом виде,
  // иначе переворот наверх проигрался бы сдвигом снизу.
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    placement: TooltipPlacement;
  } | null>(null);
  const [tabStop, setTabStop] = useState(false);
  const hover = useRef(false);
  const focus = useRef(false);
  const unmountTimer = useRef<number | undefined>(undefined);
  const hasText = text != null;

  // Таб-стоп — только у «немых» якорей (иконка, бейдж): у кнопки внутри
  // фокус уже есть. Решаем после монтирования — нужен DOM.
  useEffect(() => {
    const el = anchorRef.current;
    setTabStop(
      !!el &&
        hasText &&
        !el.querySelector(FOCUSABLE) &&
        !el.parentElement?.closest(INTERACTIVE),
    );
  }, [hasText]);

  const show = useCallback(() => {
    if (!hasText) return;
    window.clearTimeout(unmountTimer.current);
    setOpen(true);
    setMounted(true);
  }, [hasText]);

  const hide = useCallback(() => {
    setOpen(false);
    setShown(false);
    window.clearTimeout(unmountTimer.current);
    unmountTimer.current = window.setTimeout(() => {
      setMounted(false);
      setAnimate(false);
      setPos(null);
    }, FADE_MS);
  }, []);

  // Escape и нажатие гасят хинт до следующего входа мыши / фокуса
  const dismiss = useCallback(() => {
    hover.current = false;
    focus.current = false;
    hide();
  }, [hide]);

  const sync = useCallback(() => {
    if (hover.current || focus.current) show();
    else hide();
  }, [show, hide]);

  const update = useCallback(() => {
    const a = anchorRef.current;
    const t = tipRef.current;
    if (!a || !t) return;
    const r = a.getBoundingClientRect();
    // Якорь спрятали (display: none — например, выключатель зарплат) —
    // хинт уехал бы в левый верхний угол, гасим
    if (r.width === 0 && r.height === 0) {
      dismiss();
      return;
    }
    const root = document.documentElement;
    // offset*-размеры не учитывают translate анимации — меряем «чистый» бокс
    setPos(
      placeTooltip(
        r,
        { width: t.offsetWidth, height: t.offsetHeight },
        { width: root.clientWidth, height: root.clientHeight },
        align,
      ),
    );
  }, [align, dismiss]);

  // Позиция — до первой отрисовки. text в зависимостях — новый текст,
  // новый размер.
  useIsoLayoutEffect(() => {
    if (!open || !mounted) return;
    update();
  }, [open, mounted, update, text]);

  // Встал на место скрытым — включаем переход и видимость, тоже до отрисовки.
  // Принудительный расчёт стилей фиксирует скрытое состояние (opacity-0,
  // сдвиг в нужную сторону) исходным для перехода — без него браузер склеил
  // бы оба шага и показал хинт без анимации. Без requestAnimationFrame:
  // кадры в фоновой вкладке дросселируются, и хинт запаздывал бы.
  useIsoLayoutEffect(() => {
    if (!open || !pos || shown) return;
    void tipRef.current?.offsetWidth;
    setAnimate(true);
    setShown(true);
  }, [open, pos, shown]);

  // Пока хинт в DOM — едем за якорем при скролле любого контейнера и ресайзе
  useEffect(() => {
    if (!mounted) return;
    let raf = 0;
    const onMove = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [mounted, update]);

  // Escape слушаем на документе: фокус может быть и не на якоре (ховер).
  // preventDefault не зовём — Escape дальше закрывает поп-ап, если он есть.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, dismiss]);

  useEffect(() => () => window.clearTimeout(unmountTimer.current), []);

  const onPointerEnter = (e: PointerEvent) => {
    // На тач-экране «ховер» — это тап: он и так открывает строку, а хинт
    // остался бы висеть поверх поп-апа
    if (e.pointerType === 'touch') return;
    hover.current = true;
    sync();
  };
  const onPointerLeave = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    hover.current = false;
    sync();
  };
  const onFocus = (e: FocusEvent) => {
    // Только клавиатурный фокус: клик мышью тоже фокусирует таб-стоп,
    // и хинт вернулся бы сразу после dismiss по нажатию
    let visible = true;
    try {
      visible = (e.target as HTMLElement).matches(':focus-visible');
    } catch {
      // старый браузер без :focus-visible — показываем по любому фокусу
    }
    if (!visible) return;
    focus.current = true;
    sync();
  };
  const onBlur = () => {
    focus.current = false;
    sync();
  };

  const placement = pos?.placement ?? 'bottom';
  const hiddenShift = placement === 'bottom' ? 'translate-y-1' : '-translate-y-1';

  return (
    <span
      ref={anchorRef}
      className={`inline-flex ${className}`}
      style={style}
      tabIndex={tabStop ? 0 : undefined}
      aria-describedby={tabStop ? id : undefined}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={dismiss}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {children}
      {mounted &&
        hasText &&
        createPortal(
          <span
            ref={tipRef}
            id={id}
            role="tooltip"
            className={`pointer-events-none fixed z-[60]
                        ${TIP_LOOK}
                        ${animate ? 'transition-[opacity,transform] duration-150' : ''}
                        ${shown ? 'opacity-100 translate-y-0' : `opacity-0 ${hiddenShift}`}
                        ${tipClassName}`}
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              width: 'max-content',
              // На узком окне — не шире вьюпорта минус отступы
              maxWidth: `min(${maxWidth}px, calc(100vw - ${VIEWPORT_MARGIN * 2}px))`,
            }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
