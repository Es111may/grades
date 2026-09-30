'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { signIn } from 'next-auth/react';
import Avatar from '@/components/Avatar';
import { CloseIcon, CoinsIcon } from '@/components/icons';
import type { UserRow } from './UsersClient';
import TitleAurora from '@/components/TitleAurora';

type AssessmentHistoryRow = {
  id: number;
  publishedAt: string | null;
  effectiveGrade: string | null;
  totalXp: number | null;
  leadName: string | null;
};

type LeadReviewHistoryRow = {
  id: number;
  period: string;
  importedAt: string;
  responseCount: number;
  enps: number | null;
};

type HistoryData = {
  assessments: AssessmentHistoryRow[];
  leadReviews: LeadReviewHistoryRow[];
};

type NoteRow = {
  id: number;
  text: string;
  createdAt: string;
  authorId: number;
  author: { fullName: string };
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'Админ',
  lead: 'Лид',
  stardiz: 'Стардиз',
  designer: 'Дизайнер',
};

// Цветовые токены для чипа роли — используем поверх базового `.chip`
// (одинаковый размер и шрифт, отличается только фон/текст).
const ROLE_TONE: Record<string, string> = {
  admin: 'bg-sunset/15 text-sunset',
  lead: 'bg-lime/15 text-lime-dark',
  // Токен violet: в тёмной теме тот же #bf5af2. В светлой фиолетовый текст
  // на фиолетовой подложке — 3,4:1, мелкому тексту мало; текст основным
  // цветом, подложка остаётся фиолетовой (как у .chip-gold).
  stardiz: 'bg-violet/15 text-violet [html[data-theme=light]_&]:text-ink',
  designer: 'bg-cloud/60 text-stone',
};

const GRADE_NAMES: Record<string, string> = {
  junior: 'Джун',
  junior_plus: 'Джун+',
  premiddle: 'Пре-мидл',
  middle: 'Мидл',
  middle_plus: 'Мидл+',
  senior: 'Синьор',
};

const buildColor = (code: string) =>
  code === 'creator' ? '#00ca48' : code === 'visioner' ? '#7c3aed' : '#0ea5e9';

import { formatDateShort as formatDate } from '@/lib/dates';
import GradingPlanChip, {
  GradingDateEditor,
  putGradingDate,
  type GradingPlanFields,
} from '@/components/GradingPlanChip';
import { canSetGradingDate, gradingPlanStatus } from '@/lib/gradingPlan';
import { isGradable, isHourly } from '@/lib/employment';
import {
  DISMISSAL_TYPE_LABELS,
  canViewDismissalDate,
  canViewDismissalStatus,
  isDismissalType,
  showsDismissal,
} from '@/lib/dismissal';
import { canEditBonuses, canEditPlannedRaise, canViewCompensation } from '@/lib/compPermissions';
import { canDeactivateUser, canEditOwnProfile, canEditUser } from '@/lib/permissions';
import SalaryBlock, { useCompensation } from '@/components/SalaryBlock';
import type { PlannedRaiseRow } from '@/components/PlannedRaiseBadge';

export default function UserCard360({
  user,
  rank = null,
  meId,
  meRole,
  onClose,
  onEdit,
  onDeactivated,
  onGradingChanged,
  onPlannedRaiseChange,
}: {
  user: UserRow;
  /** Позиция в рейтинге по composite среди активных дизайнеров («№1»). */
  rank?: number | null;
  meId: number | null;
  meRole: string;
  onClose: () => void;
  onEdit: (user: UserRow) => void;
  /** patch — поля, которые сервер проставил сам (дата увольнения), если вернул. */
  onDeactivated: (id: number, patch?: Partial<UserRow>) => void;
  /** Дата грейдирования поменялась — план из ответа сервера в список и карточку. */
  onGradingChanged: (id: number, plan: GradingPlanFields) => void;
  /** Плановый пересмотр поставлен, изменён или снят — обновить бейдж в списке. */
  onPlannedRaiseChange: (id: number, planned: PlannedRaiseRow | null) => void;
}) {
  // Редактор даты грейдирования — объявлен до обработчика Escape: тот
  // закрывает сначала редактор, потом поп-ап.
  const [gradingEditing, setGradingEditing] = useState(false);

  // Закрытие по Escape. defaultPrevented — Escape уже обработал кто-то
  // внутри (редактор даты гасит его сам, когда фокус в нём).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (gradingEditing) setGradingEditing(false);
      else onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, gradingEditing]);

  // Phase 14: сводка самооценки — количество и свежесть (для чипа).
  const [selfInfo, setSelfInfo] = useState<{ count: number; last: string | null } | null>(
    null,
  );
  useEffect(() => {
    if (user.role !== 'designer') return;
    let cancelled = false;
    fetch(`/api/users/${user.id}/self-assessment`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const last = d.selfAssessments.reduce(
          (acc: string | null, sa: { updatedAt: string }) =>
            !acc || sa.updatedAt > acc ? sa.updatedAt : acc,
          null,
        );
        setSelfInfo({ count: d.selfAssessments.length, last });
      })
      .catch(() => {
        // чип самооценки опционален
      });
    return () => {
      cancelled = true;
    };
  }, [user.id, user.role]);

  // Заметки по дизайнеру — приватные для admin/lead
  const canSeeNotes =
    (meRole === 'admin' || meRole === 'lead') && user.role === 'designer';
  const [notes, setNotes] = useState<NoteRow[]>([]);
  useEffect(() => {
    if (!canSeeNotes) return;
    let cancelled = false;
    fetch(`/api/users/${user.id}/notes`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!cancelled && Array.isArray(d)) setNotes(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user.id, canSeeNotes]);

  async function deleteNote(noteId: number) {
    const res = await fetch(`/api/notes/${noteId}`, { method: 'DELETE' });
    if (res.ok) setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }

  // Дата грейдирования — прямо в поп-апе (Pavel): назначить, изменить по
  // клику на пилюлю, сбросить крестиком. Через PUT /grading-date, а не PATCH
  // карточки: стардизу PATCH закрыт, а дату своим он ставить вправе.
  // Права — админ всем, лид и стардиз своим подопечным. Ставят дату только
  // грейдируемым (активным штатным дизайнерам и стардизам), снять можно у
  // любого, у кого она осталась.
  const canSetGrading =
    meId !== null && canSetGradingDate({ id: meId, role: meRole }, user);
  const canEditGrading = canSetGrading && isGradable(user);
  const gradingState = gradingPlanStatus({
    nextGradingAt: user.nextGradingAt ?? null,
    nextGradingSetAt: user.nextGradingSetAt ?? null,
    lastPublishedAt: user.lastAssessedAt ?? null,
  }).state;
  // «Назначить» — когда даты нет или прошлое грейдирование уже проведено:
  // пилюля «проведено» остаётся фактом, рядом назначают следующее.
  const canAssignGrading =
    canEditGrading && (gradingState === 'none' || gradingState === 'done');
  const [gradingInitial, setGradingInitial] = useState('');
  const [gradingErr, setGradingErr] = useState<string | null>(null);
  const [clearingGrading, setClearingGrading] = useState(false);

  // Другой человек в том же поп-апе — редактор закрыт, ошибки нет
  useEffect(() => {
    setGradingEditing(false);
    setGradingErr(null);
  }, [user.id]);

  function openGradingEditor(initial: string) {
    setGradingInitial(initial);
    setGradingErr(null);
    setGradingEditing(true);
  }

  function gradingSaved(plan: GradingPlanFields) {
    setGradingEditing(false);
    onGradingChanged(user.id, plan);
  }

  async function clearGradingDate() {
    setClearingGrading(true);
    setGradingErr(null);
    const r = await putGradingDate(user.id, null, 'Не удалось сбросить дату');
    setClearingGrading(false);
    if ('error' in r) {
      setGradingErr(r.error);
      return;
    }
    onGradingChanged(user.id, r.plan);
  }

  // Редактор закрылся — фокус обратно в строку (пилюля или «Назначить»),
  // а не в никуда: с клавиатуры можно продолжить с того же места.
  const gradingRowRef = useRef<HTMLDivElement | null>(null);
  const gradingWasEditing = useRef(false);
  useEffect(() => {
    if (gradingWasEditing.current && !gradingEditing) {
      gradingRowRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
    gradingWasEditing.current = gradingEditing;
  }, [gradingEditing]);

  // Ленивая подгрузка истории оценок (Assessment'ов и LeadReview'ов).
  const [history, setHistory] = useState<HistoryData | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/${user.id}/history`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setHistory(data);
      })
      .catch(() => {
        // история необязательна — попап работает и без неё
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const isSelf = meId !== null && meId === user.id;

  // Это «свой» подопечный для лида/стардиза?
  const isMine =
    meId !== null &&
    ((meRole === 'lead' && user.leadId === meId) ||
      (meRole === 'stardiz' && (user.stardizId === meId || user.leadId === meId)));

  // Правка и деактивация — lib/permissions: админ всех, лид только своих
  // дизайнеров и стардизов. Свою карточку лид тоже открывает — модалка сама
  // оставит в ней только имя и аватар (canEditOwnProfile). Стардизу
  // «Изменить» не показываем: PATCH карточки ему закрыт, дату грейдирования
  // он ставит прямо в строке «Грейдирование».
  const viewer = meId !== null ? { id: meId, role: meRole } : null;
  const canEdit = canEditUser(viewer, user) || canEditOwnProfile(viewer, user);

  const canAssess =
    user.role === 'designer' &&
    user.active &&
    !isHourly(user) &&
    !isSelf &&
    (meRole === 'admin' || isMine);

  const canDeactivate = canDeactivateUser(viewer, user) && user.active;

  const canOpenPortrait = user.role === 'designer' && user.active;

  // Лид/стардиз (Phase 22): портрет 360° доступен админу всегда и
  // самому лиду/стардизу для просмотра своих оценок.
  const isLeadOrStardiz = user.role === 'lead' || user.role === 'stardiz';
  const canOpenLeadReview =
    isLeadOrStardiz && user.active && (meRole === 'admin' || isSelf);
  const canImportLeadReview = isLeadOrStardiz && user.active && meRole === 'admin';

  // Меню «⋯»: открывается по ховеру (грейс 160мс на уход) и по клику;
  // клик-вне закрывает
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
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
    // Кнопка «⋯» — не «вне»: иначе mousedown закрывал меню, а click тут же
    // открывал снова, и второй клик по «⋯» меню не закрывал
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || menuBtnRef.current?.contains(t)) return;
      setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  // Двухступенчатое жёсткое удаление (только admin)
  const [deleteArmed, setDeleteArmed] = useState(false);

  // Двухступенчатое удаление-«деактивация» — без нативного confirm,
  // который мог не отрабатывать в некоторых браузерах.
  const [deactivateArmed, setDeactivateArmed] = useState(false);
  function armDeactivate() {
    setDeactivateArmed(true);
    setTimeout(() => setDeactivateArmed(false), 5000);
  }
  async function handleDeactivate() {
    const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
    if (res.ok) {
      // Дату увольнения сервер ставит сам — если вернул, показываем сразу
      const j = await res.json().catch(() => ({}));
      onDeactivated(
        user.id,
        typeof j.dismissedAt === 'string' ? { dismissedAt: j.dismissedAt } : undefined,
      );
      setDeactivateArmed(false);
    } else {
      const j = await res.json().catch(() => ({}));
      alert(`Не удалось деактивировать: ${j.error ?? res.statusText}`);
      setDeactivateArmed(false);
    }
  }

  // Стаж — «1 г 10 мес» к дате найма. У уволенных и почасовщиков с датой
  // увольнения считаем до неё, а не до сегодня.
  function tenureStr(hiredAt: string | null, until: string | null = null): string | null {
    if (!hiredAt) return null;
    const st = new Date(hiredAt);
    const now = until ? new Date(until) : new Date();
    let m = (now.getFullYear() - st.getFullYear()) * 12 + (now.getMonth() - st.getMonth());
    if (now.getDate() < st.getDate()) m--;
    if (m < 1) return '<1 мес';
    const y = Math.floor(m / 12);
    const mm = m % 12;
    if (y === 0) return `${mm} мес`;
    return mm === 0 ? `${y} г` : `${y} г ${mm} мес`;
  }

  // Phase 23.4 — увольнение. Дату видят админ и лид, тип и причину —
  // только админ (сервер другим эти поля и не отдаёт).
  const withDismissal = showsDismissal(user);
  const seeDismissalDate = withDismissal && canViewDismissalDate({ role: meRole });
  const seeDismissalStatus = withDismissal && canViewDismissalStatus({ role: meRole });
  const dismissedAt = withDismissal ? user.dismissedAt ?? null : null;
  const tenure = tenureStr(user.hiredAt, dismissedAt);

  const lastA = history?.assessments?.[0] ?? null;
  const prevA = history?.assessments?.[1] ?? null;
  const lastDelta =
    lastA && prevA && lastA.totalXp !== null && prevA.totalXp !== null
      ? lastA.totalXp - prevA.totalXp
      : null;

  const canImpersonate = meRole === 'admin' && !isSelf && user.active;
  const canHardDelete = meRole === 'admin' && !isSelf;
  // Phase 23.4 — компенсации: админ всех, лид своих (сервер проверяет тоже)
  const canViewComp = canViewCompensation(viewer, user);
  const canPlan = canEditPlannedRaise(viewer, user) && user.active;
  const hasPlan = !!user.plannedRaise;
  // Данные блока «Зарплата» грузит поп-ап и отдаёт ему (source), как карточка
  // на портрете: пункты меню перечитывают те же данные — строка пересмотра
  // в блоке обновляется сразу, без переоткрытия.
  const comp = useCompensation(canViewComp ? user.id : null);
  const [planSignal, setPlanSignal] = useState(0);
  // Только сигнал блоку: он открывает редактор и перечитывает данные. Сам
  // статус появляется по «Сохранить» (PlannedRow в SalaryBlock), а не при
  // открытии: иначе «Запланировать → Отмена» оставлял пустой статус и бейдж.
  function startPlan() {
    setMenuOpen(false);
    setPlanSignal((n) => n + 1);
  }
  async function clearPlan() {
    setMenuOpen(false);
    const res = await fetch(`/api/users/${user.id}/planned-raise`, { method: 'DELETE' });
    if (!res.ok) return;
    onPlannedRaiseChange(user.id, null);
    await comp.reload();
  }
  // Премию вносит только админ; пункт — когда история загрузилась (без
  // HR-данных её нет, и форме негде появиться). Сама форма — в SalaryBlock.
  const [bonusReady, setBonusReady] = useState(false);
  const [bonusSignal, setBonusSignal] = useState(0);
  const canAddBonus = canPlan && canEditBonuses(viewer) && bonusReady;
  function startBonus() {
    setMenuOpen(false);
    setBonusSignal((n) => n + 1);
  }
  const hasMenu = canPlan || canImpersonate || canImportLeadReview || canDeactivate || canHardDelete;
  // Если в меню только пункты про пересмотр (у лида — когда человека он
  // видит по деньгам, но деактивировать не вправе) — при скрытых зарплатах
  // прячем и саму кнопку, иначе откроется пустое меню. «Добавить премию»
  // тоже salary-sensitive и бывает только вместе с пунктами пересмотра.
  const menuOnlySalary = canPlan && !canImpersonate && !canImportLeadReview && !canDeactivate && !canHardDelete;

  async function handleHardDelete() {
    const res = await fetch(`/api/users/${user.id}?hard=true`, { method: 'DELETE' });
    if (res.ok) {
      onDeactivated(user.id);
      onClose();
    } else {
      const j = await res.json().catch(() => ({}));
      alert(
        `Не удалилось: ${j.error ?? res.statusText}.\nЕсли у человека есть подопечные — открой «Изменить», там перенос и удаление.`,
      );
      setDeleteArmed(false);
    }
  }

  // ---------- Секции поп-апа (Pavel, 30.09.2026) ----------
  // Секцию без строк для этого зрителя не рисуем — ни заголовка, ни линии.
  // Линия стоит перед секцией, если выше есть видимая секция. «Зарплату»
  // прячет глаз в шапке — CSS, без перерисовки, — поэтому её линии живут
  // внутри неё: сверху — если выше «Команда»; если выше пусто, а ниже
  // что-то есть — снизу. Тогда при скрытых зарплатах нет ни двойной линии,
  // ни линии над пустотой.
  const showDismissalDateRow = seeDismissalDate && (!!dismissedAt || seeDismissalStatus);
  const hasTeam =
    !!user.lead || !!user.stardiz || !!user.hiredAt || showDismissalDateRow || seeDismissalStatus;
  const showGradingRow =
    (user.role === 'designer' || user.role === 'stardiz') &&
    !isHourly(user) &&
    (!!user.nextGradingAt || canEditGrading);
  const showSelfRow = user.role === 'designer' && !!selfInfo && selfInfo.count > 0;
  const showTrend = !!history && history.assessments.length > 0 && user.role !== 'admin';
  const trendPoints =
    showTrend && history ? [...history.assessments].reverse().map((a) => a.totalXp ?? 0) : [];
  // TrendSparkline рисует от двух точек
  const hasTrendChart = trendPoints.length >= 2;
  const hasGrading = showGradingRow || showSelfRow || showTrend;
  const showNotes = canSeeNotes && notes.length > 0;
  const showLeadReviews = isLeadOrStardiz && !!history && history.leadReviews.length > 0;
  const afterSalary = hasGrading || showNotes || showLeadReviews;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-16 pb-10">
      {/* Затемнение без blur. backdrop-blur здесь был на весь экран и сэмплил
          всё позади — включая аврору страницы, которая под модалкой продолжает
          анимироваться. Каждый её кадр заставлял полноэкранный слой блюра
          перерастрироваться, и поп-ап моргал (Pavel, 29.07.2026). Под
          60-процентным чёрным двухпиксельный блюр почти не читался, так что
          внешне потеря незаметна. */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      {/* Каркас Pavel (12.07.2026, секции — 30.09.2026): hero по центру с
          авророй → секции «лейбл—значение» (Команда · Зарплата ·
          Грейдирование с графиком роста) → заметки → действия текстом +
          меню «⋯». */}
      <div className="relative w-full max-w-[420px] bg-snow rounded-modal shadow-soft-lg flex flex-col max-h-[calc(100dvh-104px)]">
        <div className="overflow-hidden rounded-modal flex flex-col min-h-0">
          {/* Скролл живёт внутри попапа (overscroll-contain — фон не
              уезжает); ряд кнопок ниже — закреплён */}
          <div className="overflow-y-auto overscroll-contain min-h-0">
          {/* ---------- Hero ---------- */}
          <div className="relative text-center px-6 pt-10 pb-1 overflow-hidden isolation-isolate title-halo">
            {/* staticFrame: внутри скроллящегося поп-апа анимация заставляла
                пересчитывать композицию на каждом кадре скролла. Один кадр —
                то же мягкое свечение, но без моргания. */}
            <TitleAurora staticFrame className="!w-[560px] !h-[420px] opacity-40" />
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-pill bg-ink/5 text-stone
                         hover:text-ink flex items-center justify-center transition-colors z-10"
              aria-label="Закрыть"
              type="button"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
            {/* Fade к низу — аврора растворяется, а не обрезается кромкой
                hero. -z-[5]: между канвасом (-z-10) и контентом — иначе
                градиент накрывал нижний ряд чипов «опасити». */}
            <div className="absolute inset-x-0 bottom-0 h-16 -z-[5] bg-gradient-to-b from-transparent to-snow pointer-events-none" />
            <div className="flex justify-center">
              <Avatar name={user.fullName} avatarUrl={user.avatarUrl} size={80} />
            </div>
            <h2 className="font-display text-2xl font-medium tracking-tight mt-4">
              {user.fullName}
            </h2>
            <div className="text-[13px] text-stone mt-0.5 truncate">{user.email}</div>
            {/* Ряд 1: номер · уровень · отдел (Pavel) */}
            <div className="flex items-center justify-center gap-1 mt-4 flex-wrap">
              {user.role === 'designer' && user.compositeScore != null && (
                <span
                  className={`chip h-6 text-white ${
                    Math.round(user.compositeScore * 100) >= 60
                      ? 'bg-emerald'
                      : Math.round(user.compositeScore * 100) >= 50
                        ? 'bg-sunset'
                        : 'bg-blaze'
                  }`}
                >
                  <b className="font-medium">{Math.round(user.compositeScore * 100)}</b>
                  {rank != null && <span className="text-white/75">№{rank}</span>}
                </span>
              )}
              {user.role === 'designer' && user.effectiveGrade && (
                <span className="chip h-6 bg-ink text-snow">
                  {GRADE_NAMES[user.effectiveGrade] ?? user.effectiveGrade}
                </span>
              )}
              {user.build && (
                <span className="chip-neutral h-6">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: buildColor(user.build.code) }}
                  />
                  {user.build.name}
                </span>
              )}
            </div>
            {/* Ряд 2: роль · в срок · floor · неактивен */}
            <div className="flex items-center justify-center gap-1 mt-1.5 flex-wrap">
              <span className={`chip h-6 ${ROLE_TONE[user.role] ?? ROLE_TONE.designer}`}>
                {ROLE_LABEL[user.role] ?? user.role}
              </span>
              {user.role === 'designer' && user.onTimePercent != null && (
                <span className="chip-neutral h-6">
                  {Math.round(user.onTimePercent)}% в срок
                </span>
              )}
              {user.role === 'designer' &&
                user.gradeFloor &&
                user.gradeFloor !== user.effectiveGrade && (
                  <span className="chip-warn h-6">
                    Floor: {GRADE_NAMES[user.gradeFloor] ?? user.gradeFloor}
                  </span>
                )}
              {isHourly(user) && (
                <span className="chip-gold h-6 inline-flex items-center gap-1">
                  <CoinsIcon className="w-3 h-3 text-gold" />
                  Почасовщик
                </span>
              )}
              {!user.active && <span className="chip-danger h-6">Неактивен</span>}
            </div>
          </div>

          {/* ---------- Секции: Команда · Зарплата · Грейдирование ----------
              Pavel (30.09.2026): информация — секциями с моно-заголовком,
              как у «Заметок»; между секциями линия с воздухом по 20px, строки
              внутри — прежний шаг 12px. Какие секции и линии есть — см.
              hasTeam / hasGrading выше. pt-10 + заголовок с отступом 12px:
              первая строка — там же, где была при прежних 60px. */}
          <div className="px-6 pt-10 pb-5 text-sm">
            {hasTeam && (
              <PopupSection title="Команда">
                {user.lead && (
                  <div className="flex items-center gap-3">
                    <span className="text-stone">Лид</span>
                    <span className="ml-auto text-ink text-right">{user.lead.fullName}</span>
                  </div>
                )}
                {user.stardiz && (
                  <div className="flex items-center gap-3">
                    <span className="text-stone">Стардиз</span>
                    <span className="ml-auto text-ink text-right">{user.stardiz.fullName}</span>
                  </div>
                )}
                {user.hiredAt && (
                  <div className="flex items-center gap-3">
                    <span className="text-stone">Дата найма</span>
                    <span className="ml-auto text-ink text-right">
                      {formatDate(user.hiredAt)}
                      {tenure && <span className="text-stone"> · {tenure}</span>}
                    </span>
                  </div>
                )}
                {/* Без даты: админу — «Не указана» (заполнит в «Изменить»),
                    лиду строку не показываем. */}
                {showDismissalDateRow && (
                  <div className="flex items-center gap-3">
                    <span className="text-stone">Дата увольнения</span>
                    <span className="ml-auto text-right">
                      {dismissedAt ? (
                        <span className="text-ink">{formatDate(dismissedAt)}</span>
                      ) : (
                        <span className="text-ash">Не указана</span>
                      )}
                    </span>
                  </div>
                )}
                {seeDismissalStatus && (
                  <div className="flex items-baseline gap-3">
                    <span className="text-stone shrink-0">Статус</span>
                    <span className="ml-auto text-right min-w-0 break-words">
                      {isDismissalType(user.dismissalType) ? (
                        <span className="text-ink">{DISMISSAL_TYPE_LABELS[user.dismissalType]}</span>
                      ) : !user.dismissalReason ? (
                        <span className="text-ash">Не указан</span>
                      ) : null}
                      {user.dismissalReason && (
                        <span
                          className={
                            isDismissalType(user.dismissalType)
                              ? 'block text-xs text-stone mt-0.5'
                              : 'text-ink'
                          }
                        >
                          {user.dismissalReason}
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </PopupSection>
            )}

            {/* Зарплата — только тем, кто видит деньги. Глаз в шапке прячет
                секцию целиком (salary-sensitive), вместе с её линиями. Первая
                строка блока — «Ставка»: «Зарплата» теперь заголовок. */}
            {canViewComp && (
              <div className="salary-sensitive">
                {hasTeam && <SectionDivider />}
                <PopupSection title="Зарплата">
                  <SalaryBlock
                    userId={user.id}
                    variant="popup"
                    source={comp}
                    label="Ставка"
                    editSignal={planSignal}
                    bonusSignal={bonusSignal}
                    onPlannedChange={(p) => onPlannedRaiseChange(user.id, p)}
                    onBonusReadyChange={setBonusReady}
                  />
                </PopupSection>
                {!hasTeam && afterSalary && <SectionDivider />}
              </div>
            )}

            {hasGrading && (
              <>
                {hasTeam && <SectionDivider />}
                <PopupSection title="Грейдирование">
                  {/* Phase 23.2 — план грейдирования. Показываем для
                      грейдируемых ролей; чип сам решает тон (просрочено /
                      подходит / проведено). Без даты строка есть только у
                      тех, кто может её назначить. */}
                  {showGradingRow &&
                    (gradingEditing && canEditGrading ? (
                      <GradingDateEditor
                        userId={user.id}
                        initial={gradingInitial}
                        onSaved={gradingSaved}
                        onCancel={() => setGradingEditing(false)}
                      />
                    ) : (
                      <div ref={gradingRowRef}>
                        <div className="flex items-center gap-3">
                          <span className="text-stone">Грейдирование</span>
                          <span className="ml-auto flex items-center gap-3">
                            {user.nextGradingAt && (
                              <GradingPlanChip
                                user={user}
                                size="md"
                                onClear={canSetGrading ? clearGradingDate : undefined}
                                onEdit={
                                  canEditGrading
                                    ? () => openGradingEditor(user.nextGradingAt?.slice(0, 10) ?? '')
                                    : undefined
                                }
                                clearing={clearingGrading}
                              />
                            )}
                            {/* Хит-зона 32px по высоте, строка остаётся в 24px;
                                -mx-2 гасит поля — текст ровно по краю значений */}
                            {canAssignGrading && (
                              <button
                                type="button"
                                onClick={() => openGradingEditor('')}
                                className="-my-1.5 -mx-2 h-8 px-2 text-xs text-stone hover:text-ink
                                           transition-colors"
                              >
                                Назначить
                              </button>
                            )}
                          </span>
                        </div>
                        {gradingErr && (
                          <p className="text-xs text-blaze text-right mt-1">{gradingErr}</p>
                        )}
                      </div>
                    ))}
                  {showSelfRow && selfInfo && (
                    <div className="flex items-center gap-3">
                      <span className="text-stone">Самооценка</span>
                      <span className="ml-auto text-ink text-right">
                        {selfInfo.count}{' '}
                        {plural(selfInfo.count, ['навык', 'навыка', 'навыков'])}
                        {selfInfo.last && (
                          <span className="text-stone"> · {formatDate(selfInfo.last)}</span>
                        )}
                      </span>
                    </div>
                  )}
                  {/* График роста + последняя оценка. Над графиком — 20px
                      от строк (pt-2 к шагу 12px); без строк выше — вплотную
                      к заголовку. Точка одна — графика нет, подпись встаёт
                      обычной строкой. */}
                  {showTrend && (
                    <div className={hasTrendChart ? 'pt-2 first:pt-0' : undefined}>
                      <TrendSparkline points={trendPoints} height={110} />
                      <div className={`flex items-baseline gap-2.5 ${hasTrendChart ? 'mt-4' : ''}`}>
                        <span className="font-medium">
                          {lastA?.effectiveGrade
                            ? GRADE_NAMES[lastA.effectiveGrade] ?? lastA.effectiveGrade
                            : '—'}
                        </span>
                        <span className="text-stone tabular-nums">
                          {lastA?.totalXp ?? 0} XP
                        </span>
                        {lastDelta !== null && lastDelta !== 0 && (
                          <span
                            className={`font-medium tabular-nums ${
                              lastDelta > 0 ? 'text-emerald' : 'text-blaze'
                            }`}
                          >
                            {lastDelta > 0 ? '+' : ''}
                            {lastDelta}
                          </span>
                        )}
                        <span className="ml-auto text-stone tabular-nums">
                          {formatDate(lastA?.publishedAt ?? null)}
                        </span>
                      </div>
                    </div>
                  )}
                </PopupSection>
              </>
            )}

            {/* Заметки по дизайнеру — приватные (admin/lead), с удалением */}
            {showNotes && (
              <>
                {(hasTeam || hasGrading) && <SectionDivider />}
                <PopupSection title="Заметки">
                  <div className="space-y-2.5">
                    {notes.map((n) => (
                      <div
                        key={n.id}
                        className="bg-canvas border border-cloud rounded-card p-3.5 relative group"
                      >
                        {(meRole === 'admin' || n.authorId === meId) && (
                          <button
                            type="button"
                            onClick={() => deleteNote(n.id)}
                            className="absolute top-2 right-2 w-6 h-6 rounded-pill
                                       flex items-center justify-center text-ash
                                       hover:text-blaze hover:bg-blaze/10
                                       opacity-0 group-hover:opacity-100 transition-all"
                            aria-label="Удалить заметку"
                          >
                            ×
                          </button>
                        )}
                        <div className="whitespace-pre-wrap leading-relaxed pr-6">{n.text}</div>
                        <div className="text-xs text-stone mt-1.5">
                          {n.author.fullName} · {formatDate(n.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                </PopupSection>
              </>
            )}

            {/* 360-опросы (лид/стардиз): график eNPS + список циклов.
                Хронология — по дате из строки периода (importedAt врёт для
                исторических импортов). */}
            {showLeadReviews && history && (() => {
              const sorted = [...history.leadReviews].sort((a, b) => {
                const da =
                  parsePeriodDate(a.period)?.getTime() ??
                  new Date(a.importedAt).getTime();
                const db =
                  parsePeriodDate(b.period)?.getTime() ??
                  new Date(b.importedAt).getTime();
                return db - da; // свежие сверху
              });
              const points = [...sorted]
                .reverse()
                .map((r) => r.enps)
                .filter((v): v is number => v !== null);
              return (
                <>
                  {(hasTeam || hasGrading || showNotes) && <SectionDivider />}
                  <div className="mb-5">
                    <TrendSparkline points={points} height={110} deltaDigits={1} />
                  </div>
                  <div className="space-y-1">
                    {sorted.slice(0, 3).map((r) => {
                      const d = parsePeriodDate(r.period);
                      return (
                        <a
                          key={r.id}
                          href={`/admin/lead-reviews/${r.id}`}
                          className="flex items-baseline gap-2.5 py-1.5 px-2 -mx-2 rounded-card hover:bg-canvas/60 transition-colors"
                        >
                          {r.enps !== null && (
                            <span className="font-medium tabular-nums shrink-0">
                              {r.enps.toFixed(1)}{' '}
                              <span className="text-stone font-normal">eNPS</span>
                            </span>
                          )}
                          <span className="text-stone shrink-0">
                            {r.responseCount} {pluralResp(r.responseCount)}
                          </span>
                          <span className="ml-auto text-stone tabular-nums shrink-0">
                            {d ? formatDate(d.toISOString()) : r.period}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>

          </div>

          {/* ---------- Действия: текстом + меню «⋯» (закреплены) ---------- */}
          <div className="px-4 py-3.5 border-t border-cloud flex items-center gap-0.5 shrink-0">
            {canOpenPortrait && (
              <a
                href={`/lead/portrait?id=${user.id}`}
                className="text-sm font-medium px-3.5 py-2 rounded-pill hover:bg-ink/5 transition-colors"
              >
                Портрет
              </a>
            )}
            {canOpenLeadReview && (
              <a
                href={`/admin/lead-reviews?userId=${user.id}`}
                className="text-sm font-medium px-3.5 py-2 rounded-pill hover:bg-ink/5 transition-colors"
              >
                Портрет
              </a>
            )}
            {canAssess && (
              <a
                href={`/lead/assess?id=${user.id}`}
                className="text-sm font-medium px-3.5 py-2 rounded-pill hover:bg-ink/5 transition-colors"
              >
                Оценить
              </a>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => onEdit(user)}
                className="text-sm font-medium px-3.5 py-2 rounded-pill hover:bg-ink/5 transition-colors"
              >
                Изменить
              </button>
            )}
            {hasMenu && (
              /* Меню — по ховеру (грейс на уход), клик тоже работает */
              <span
                className={`ml-auto ${menuOnlySalary ? 'salary-sensitive' : ''}`}
                onMouseEnter={menuEnter}
                onMouseLeave={menuLeave}
              >
                <button
                  ref={menuBtnRef}
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="w-9 h-9 rounded-pill flex items-center justify-center
                             text-stone hover:text-ink hover:bg-ink/5 transition-colors text-lg tracking-widest"
                  aria-label="Ещё действия"
                  aria-expanded={menuOpen}
                >
                  ⋯
                </button>
              </span>
            )}
          </div>
        </div>

        {/* Меню «⋯» — редкие/опасные действия не на виду (стрим-safe) */}
        {menuOpen && (
          <div
            ref={menuRef}
            onMouseEnter={menuEnter}
            onMouseLeave={menuLeave}
            className="absolute right-3 bottom-[58px] w-max z-20 card p-1.5 shadow-soft-lg animate-scale-in"
          >
            {canPlan && (
              <button
                type="button"
                onClick={startPlan}
                className="salary-sensitive block w-full whitespace-nowrap text-left px-3 py-2 rounded-[10px] text-sm text-ink hover:bg-canvas transition-colors"
              >
                {hasPlan ? 'Изменить пересмотр' : 'Запланировать пересмотр'}
              </button>
            )}
            {canPlan && hasPlan && (
              <button
                type="button"
                onClick={clearPlan}
                className="salary-sensitive block w-full whitespace-nowrap text-left px-3 py-2 rounded-[10px] text-sm text-ink hover:bg-canvas transition-colors"
              >
                Снять пересмотр
              </button>
            )}
            {canAddBonus && (
              <button
                type="button"
                onClick={startBonus}
                className="salary-sensitive block w-full whitespace-nowrap text-left px-3 py-2 rounded-[10px] text-sm text-ink hover:bg-canvas transition-colors"
              >
                Добавить премию
              </button>
            )}
            {canImpersonate && (
              <button
                type="button"
                onClick={() =>
                  signIn('impersonate', {
                    targetUserId: String(user.id),
                    callbackUrl: '/',
                  })
                }
                className="block w-full whitespace-nowrap text-left px-3 py-2 rounded-[10px] text-sm text-ink hover:bg-canvas transition-colors"
              >
                Войти как {user.fullName.split(' ')[0]}
              </button>
            )}
            {canImportLeadReview && (
              <a
                href={`/admin/lead-reviews/new?userId=${user.id}`}
                className="block px-3 py-2 rounded-[10px] text-sm text-ink hover:bg-canvas transition-colors"
              >
                Импорт опроса
              </a>
            )}
            {canDeactivate &&
              (!deactivateArmed ? (
                <button
                  type="button"
                  onClick={armDeactivate}
                  className="block w-full whitespace-nowrap text-left px-3 py-2 rounded-[10px] text-sm text-blaze hover:bg-canvas transition-colors"
                >
                  Деактивировать
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDeactivate}
                  className="block w-full whitespace-nowrap text-left px-3 py-2 rounded-[10px] text-sm font-medium text-white bg-blaze hover:brightness-95 transition-all"
                >
                  Точно деактивировать?
                </button>
              ))}
            {canHardDelete &&
              (!deleteArmed ? (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteArmed(true);
                    setTimeout(() => setDeleteArmed(false), 5000);
                  }}
                  className="block w-full whitespace-nowrap text-left px-3 py-2 rounded-[10px] text-sm text-blaze hover:bg-canvas transition-colors"
                >
                  Удалить
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleHardDelete}
                  className="block w-full whitespace-nowrap text-left px-3 py-2 rounded-[10px] text-sm font-medium text-white bg-blaze hover:brightness-95 transition-all"
                >
                  Точно удалить навсегда?
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Секция поп-апа: моно-заголовок (как у «Заметок»), под ним через 12px —
 * строки с шагом 12px. Заголовок — h3: имя в hero — h2.
 */
function PopupSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="label-mono text-stone mb-3">{title}</h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** Линия между секциями: по 20px воздуха сверху и снизу, по ширине строк. */
function SectionDivider() {
  return <div aria-hidden className="my-5 border-t border-cloud" />;
}

/**
 * Спарклайн динамики XP по циклам оценки (Phase 15). Лёгкий SVG, без chart.js.
 * `assessments` приходят DESC (свежие сверху) — разворачиваем в хронологию.
 * Рисуем только при ≥2 точках. preserveAspectRatio=none + non-scaling-stroke:
 * линия тянется на всю ширину карточки, но остаётся ровной 1.75px (не толстеет).
 */
function TrendSparkline({
  points,
  label,
  unit = '',
  height = 36,
  deltaDigits = 0,
}: {
  /** Хронологический ряд значений (старые → новые). */
  points: number[];
  label?: string;
  unit?: string;
  height?: number;
  deltaDigits?: number;
}) {
  const gid = useId();
  if (points.length < 2) return null;

  const W = 300;
  const H = height;
  const pad = 4;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points.map((v, i) => ({
    x: pad + (i / (points.length - 1)) * (W - pad * 2),
    y: H - pad - ((v - min) / range) * (H - pad * 2),
  }));
  // Сглаженная кривая (Catmull-Rom → кубические Безье) — вместо ломаной
  let line = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i - 1] ?? coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    line += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  const area = `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${H} L ${coords[0].x.toFixed(1)} ${H} Z`;
  const totalDelta = points[points.length - 1] - points[0];

  return (
    <div className="mb-2">
      {label && (
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="label-mono text-stone">{label}</span>
        {totalDelta !== 0 && (
          <span
            className={`label-mono ${totalDelta > 0 ? 'text-emerald' : 'text-blaze'}`}
          >
            {totalDelta > 0 ? '+' : ''}
            {totalDelta.toFixed(deltaDigits)}
            {unit}
          </span>
        )}
      </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        className="block"
        aria-hidden="true"
      >
        <defs>
          {/* Заливка тает к низу — глубина вместо плоского пятна */}
          <linearGradient id={`tsg-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgb(var(--c-lime))" stopOpacity="0.22" />
            <stop offset="1" stopColor="rgb(var(--c-lime))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#tsg-${gid})`} />
        {/* Мягкий глоу под основной линией */}
        <path
          d={line}
          fill="none"
          stroke="rgb(var(--c-lime) / 0.22)"
          strokeWidth={6}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* последняя точка + пульс — «ты здесь» */}
        <circle
          cx={coords[coords.length - 1].x}
          cy={coords[coords.length - 1].y}
          r={3.5}
          fill="rgb(var(--c-lime))"
        />
        <circle
          cx={coords[coords.length - 1].x}
          cy={coords[coords.length - 1].y}
          fill="none"
          stroke="rgb(var(--c-lime) / 0.35)"
        >
          <animate attributeName="r" values="5;12;5" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.7;0;0.7" dur="2.4s" repeatCount="indefinite" />
        </circle>
        <path
          d={line}
          fill="none"
          stroke="rgb(var(--c-lime))"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

// «13 мая 2026» из строки периода → Date (хронология графика/списка).
const RU_MONTHS: Record<string, number> = {
  'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3, 'мая': 4, 'июня': 5,
  'июля': 6, 'августа': 7, 'сентября': 8, 'октября': 9, 'ноября': 10,
  'декабря': 11,
};
function parsePeriodDate(period: string): Date | null {
  const m = period.trim().match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
  if (!m) return null;
  const mon = RU_MONTHS[m[2].toLowerCase()];
  if (mon === undefined) return null;
  return new Date(Date.UTC(parseInt(m[3], 10), mon, parseInt(m[1], 10)));
}

function pluralResp(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'респондентов';
  if (mod10 === 1) return 'респондент';
  if (mod10 >= 2 && mod10 <= 4) return 'респондента';
  return 'респондентов';
}
