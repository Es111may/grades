'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, PlusIcon } from '@/components/icons';
import { isCommentsLayerOpen, isFromCommentsLayer, isInCommentsLayer } from '@/lib/commentsLayer';
import SalaryBlock, {
  SalaryHeadline,
  canAddBonusNow,
  useCompensation,
  type Compensation,
  type CompensationData,
} from '@/components/SalaryBlock';

/**
 * Карточка «Зарплата» на странице дизайнера — нижняя половина слота 9-Box
 * в bento. Ставка и вилка, остальное — в поп-апе по «+»: там тот же блок,
 * что в поп-апе 360, и меню «⋯» с пересмотром и премией.
 *
 * Данные грузит карточка и отдаёт блоку в поп-апе: правки там перечитывают
 * общие — карточка обновляется вместе с блоком, второго запроса нет.
 * Карточка и поп-ап — salary-sensitive: при скрытых зарплатах их нет.
 */
export default function SalaryCard({
  userId,
  className = '',
  tall = false,
}: {
  userId: number;
  className?: string;
  /**
   * Карточка во весь слот bento (без 9-Box сверху — у портрета человека вне
   * грейдирования): «+» — вверху справа, по центру ряда подписи, а не
   * посреди пустой карточки.
   */
  tall?: boolean;
}) {
  const comp = useCompensation(userId);
  const [open, setOpen] = useState(false);
  const plusRef = useRef<HTMLButtonElement>(null);
  // Фокус — обратно на «+»: Safari по клику кнопку не фокусирует, поэтому
  // «вернуть, что было в фокусе» не годится
  const close = useCallback(() => {
    setOpen(false);
    plusRef.current?.focus();
  }, []);

  return (
    // py-[13px] + ряд подписи в 24px: подпись на той же высоте, что у
    // соседних карточек bento с p-5 (центр подписи — 25px от верха против
    // 24,75px у них). Поля сверху и снизу равны — «+» по self-center стоит
    // ровно по центру карточки, а не на полтора пикселя выше.
    <div className={`salary-sensitive card flex gap-3 px-5 py-[13px] ${className}`}>
      <div className="flex-1 min-w-0">
        <SalaryHeadline comp={comp} variant="card" />
      </div>
      {/* «+» — когда данные пришли: в поп-апе всегда есть что показать —
          цифры, причину, почему их нет, или меню пересмотра. 32px с иконкой
          16px (Pavel: 40px — слишком крупно); хит-зона — те же 32px. */}
      {comp.data && (
        <button
          ref={plusRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Подробнее о зарплате"
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`${tall ? 'self-start -mt-1' : 'self-center'} shrink-0 w-8 h-8 rounded-pill
                     bg-ink/5 hover:bg-ink/10 text-ink flex items-center justify-center
                     active:scale-[0.96] transition-[background-color,transform] duration-150 ease-out`}
        >
          <PlusIcon className="w-4 h-4" />
        </button>
      )}
      {open && comp.data && (
        <SalaryDialog userId={userId} comp={comp} data={comp.data} onClose={close} />
      )}
    </div>
  );
}

const MENU_ITEM =
  'block w-full whitespace-nowrap text-left px-3 py-2 rounded-[10px] text-sm text-ink hover:bg-canvas transition-colors';

/**
 * Поп-ап «Зарплата»: оболочка — как у поп-апа 360 (затемнение, snow,
 * rounded-modal, shadow-soft-lg, 420px), внутри — SalaryBlock. Порталом в
 * body: у предков bento бывает transform (fade-up), fixed от него поехал бы.
 * Прижат к верхней трети, а не по центру: история раскрывается вниз, и
 * заголовок при этом не уезжает.
 */
function SalaryDialog({
  userId,
  comp,
  data,
  onClose,
}: {
  userId: number;
  comp: Compensation;
  data: CompensationData;
  onClose: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Фокус — в поп-ап (на «+» его вернёт карточка)
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Страница под поп-апом не скроллится; ширину пропавшего скроллбара
  // возвращаем отступом — вёрстка не прыгает
  useEffect(() => {
    const { body, documentElement } = document;
    const gap = window.innerWidth - documentElement.clientWidth;
    const was = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = was.overflow;
      body.style.paddingRight = was.paddingRight;
    };
  }, []);

  // Меню «⋯» — как в поп-апе 360: по ховеру (грейс 160мс на уход) и по
  // клику; клик вне закрывает
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function menuEnter() {
    if (menuTimer.current) clearTimeout(menuTimer.current);
    setMenuOpen(true);
  }
  function menuLeave() {
    if (menuTimer.current) clearTimeout(menuTimer.current);
    menuTimer.current = setTimeout(() => setMenuOpen(false), 160);
  }
  useEffect(() => {
    return () => {
      if (menuTimer.current) clearTimeout(menuTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      // Клик в слое комментариев — не «мимо»: меню остаётся, его можно комментировать
      if (isFromCommentsLayer(e)) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  // Escape закрывает сначала меню, потом поп-ап; Tab ходит по кругу внутри.
  // Пока в слое комментариев что-то открыто (поле, карточка треда поверх
  // поп-апа), Escape — его; Tab из слоя ловушка не возвращает (keepTabInside)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (isCommentsLayerOpen()) return;
        if (menuOpen) {
          setMenuOpen(false);
          menuBtnRef.current?.focus();
        } else {
          onClose();
        }
      } else if (e.key === 'Tab' && panelRef.current) {
        keepTabInside(e, panelRef.current);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen, onClose]);

  // Пункты — как в поп-апе 360; права и статус пересмотра — из ответа API
  const planned = data.planned;
  const canPlan = data.can.editPlanned;
  const hasPlan = planned.state === 'active';
  const canAddBonus = canPlan && canAddBonusNow(data);
  const hasMenu = canPlan || canAddBonus;
  const [planSignal, setPlanSignal] = useState(0);
  const [bonusSignal, setBonusSignal] = useState(0);

  function pick() {
    setMenuOpen(false);
    // Пункт исчезает вместе с меню — фокус оставляем в поп-апе
    panelRef.current?.focus();
  }
  // Только открываем редактор (сигнал блоку, он же перечитывает данные).
  // Статус создаётся по «Сохранить» одним PUT с fresh: true — и поверх
  // выполненного тоже, без прежних DELETE+PUT. «Отмена» ничего не пишет.
  function startPlan() {
    pick();
    setPlanSignal((n) => n + 1);
  }
  async function clearPlan() {
    pick();
    const res = await fetch(`/api/users/${userId}/planned-raise`, { method: 'DELETE' });
    if (res.ok) await comp.reload();
  }
  function startBonus() {
    pick();
    setBonusSignal((n) => n + 1);
  }

  return createPortal(
    <div className="salary-sensitive fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh] pb-10">
      <div
        className="absolute inset-0 bg-black/60 animate-fade-in"
        onClick={(e) => {
          if (!isFromCommentsLayer(e.nativeEvent)) onClose();
        }}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-[420px] max-h-[calc(85dvh-40px)] flex flex-col
                   bg-snow rounded-modal shadow-soft-lg outline-none animate-scale-in"
      >
        {/* Шапка над телом (z-10): меню «⋯» выпадает поверх блока */}
        <div className="relative z-10 shrink-0 flex items-center gap-1 pl-6 pr-4 pt-4 pb-2">
          <h2 id={titleId} className="font-display text-xl font-medium tracking-tight">
            Зарплата
          </h2>
          {hasMenu && (
            <div
              ref={menuRef}
              className="relative ml-auto"
              onMouseEnter={menuEnter}
              onMouseLeave={menuLeave}
            >
              <button
                ref={menuBtnRef}
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="w-8 h-8 rounded-pill flex items-center justify-center
                           text-stone hover:text-ink hover:bg-ink/5 transition-colors text-lg tracking-widest"
                aria-label="Ещё действия"
                aria-expanded={menuOpen}
              >
                ⋯
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-max card p-1.5 shadow-soft-lg animate-scale-in origin-top-right">
                  {canPlan && (
                    <button type="button" onClick={startPlan} className={MENU_ITEM}>
                      {hasPlan ? 'Изменить пересмотр' : 'Запланировать пересмотр'}
                    </button>
                  )}
                  {canPlan && hasPlan && (
                    <button type="button" onClick={clearPlan} className={MENU_ITEM}>
                      Снять пересмотр
                    </button>
                  )}
                  {canAddBonus && (
                    <button type="button" onClick={startBonus} className={MENU_ITEM}>
                      Добавить премию
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`${hasMenu ? '' : 'ml-auto'} w-8 h-8 rounded-pill bg-ink/5 text-stone
                        hover:text-ink flex items-center justify-center transition-colors`}
            aria-label="Закрыть"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
        {/* Скролл — внутри поп-апа (overscroll-contain: фон не уезжает) */}
        <div className="min-h-0 overflow-y-auto overscroll-contain px-6 pt-2 pb-6 text-sm">
          <SalaryBlock
            userId={userId}
            source={comp}
            label="Ставка"
            editSignal={planSignal}
            bonusSignal={bonusSignal}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Tab по кругу внутри поп-апа. Свёрнутая история (inert) — не в счёт. Фокус
 * в слое комментариев (он вне поп-апа, порталом в body) не возвращаем: там
 * пишут комментарий к этому поп-апу.
 */
function keepTabInside(e: KeyboardEvent, root: HTMLElement) {
  if (isInCommentsLayer(document.activeElement)) return;
  const els = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest('[inert]'),
  );
  if (els.length === 0) return;
  const first = els[0];
  const last = els[els.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === root)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !root.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}
