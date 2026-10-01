'use client';

import { useState, useMemo, useRef, useEffect, createContext, useContext } from 'react';
import dynamic from 'next/dynamic';
import { ChevronDownIcon } from '@/components/icons';
import SearchInput from '@/components/SearchInput';
import LeaderboardView from './LeaderboardView';
import TitleAurora from '@/components/TitleAurora';
import { KanbanSkeleton, MatrixSkeleton } from '@/components/Skeletons';
import {
  buildTeamOptions,
  countMentees,
  isMenteeOf,
  scopeOwnerId,
  type ScopeFilter,
  type TeamOption,
} from '@/lib/teamScope';
import { gradingPlanStatus } from '@/lib/gradingPlan';
import { isGradable, isGradingExempt } from '@/lib/employment';
import { canViewCompensation } from '@/lib/compPermissions';
import { canViewDismissalDate } from '@/lib/dismissal';
import { needsDismissalDate, todayMoscowDate } from '@/lib/userUpdate';
import type { PlannedRaiseRow } from '@/components/PlannedRaiseBadge';

// ─── Ленивые куски страницы ─────────────────────────────────────────────
// В First Load — только лидерборд (вид по умолчанию). Поп-апы 360 и
// «Изменить», канбан и 9-Box (с @dnd-kit) — отдельными чанками: их код
// докачивается в простое после загрузки, а если человек успел раньше —
// по намерению: ховер/фокус списка, кнопки «Добавить» или вкладки вида.

/** Высота прежнего вида на момент переключения вкладки. Её держит
 *  скелетон ленивого вида, пока едет код: страница не схлопывается и
 *  скролл не прыгает. undefined — переключений ещё не было. */
const PrevViewHeight = createContext<number | undefined>(undefined);

function KanbanLoading() {
  const minHeight = useContext(PrevViewHeight);
  return <KanbanSkeleton minHeight={minHeight} />;
}

function MatrixLoading() {
  const minHeight = useContext(PrevViewHeight);
  return <MatrixSkeleton minHeight={minHeight} />;
}

// Поп-апы до загрузки кода не рисуем вовсе — появляются сразу целиком.
const UserModal = dynamic(() => import('./UserModal'), { loading: () => null });
const UserCard360 = dynamic(() => import('./UserCard360'), { loading: () => null });
const KanbanView = dynamic(() => import('./KanbanView'), { loading: KanbanLoading });
const MatrixView = dynamic(() => import('./MatrixView'), { loading: MatrixLoading });

/** Загрузка кода заранее — один раз. Повторный import() webpack берёт из
 *  кэша; если сеть упала, флаг снимаем — следующий ховер попробует снова. */
function prefetchOnce(load: () => Promise<unknown>) {
  let started = false;
  return () => {
    if (started) return;
    started = true;
    load().catch(() => {
      started = false;
    });
  };
}
const prefetchUserModal = prefetchOnce(() => import('./UserModal'));
const prefetchCard360 = prefetchOnce(() => import('./UserCard360'));
const prefetchKanban = prefetchOnce(() => import('./KanbanView'));
const prefetchMatrix = prefetchOnce(() => import('./MatrixView'));

type Build = { id: number; code: string; name: string };
type Lead = { id: number; fullName: string };
export type UserRow = {
  id: number;
  email: string;
  fullName: string;
  role: string;
  buildId: number | null;
  build: Build | null;
  department: string | null;
  leadId: number | null;
  lead: Lead | null;
  stardizId: number | null;
  stardiz: Lead | null;
  hiredAt: string | null;
  active: boolean;
  gradeFloor: string | null;
  gradeFloorReason: string | null;
  /** Phase 23.4 — 'hourly' для почасовщика, иначе 'staff'. */
  employmentType?: string;
  /** Phase 23.4 — плановый пересмотр з/п. Сервер кладёт его только тем, кому
   *  можно видеть деньги (админ, лид по своим), и только невыполненный. */
  plannedRaise?: PlannedRaiseRow | null;
  /** Phase 23.4 — текущая зарплата, ₽. Есть только у админа; null — нет данных в HR. */
  salary?: number | null;
  /** Phase 23.4 — дата увольнения (деактивированные и почасовщики).
   *  Сервер кладёт её только админу и лиду. */
  dismissedAt?: string | null;
  /** Phase 23.4 — тип и причина увольнения. Только у админа (lib/dismissal). */
  dismissalType?: string | null;
  dismissalReason?: string | null;
  // Phase 23.2 — план грейдирования
  nextGradingAt?: string | null;
  nextGradingSetAt?: string | null;
  nextGradingSetBy?: { id: number; fullName: string } | null;
  avatarUrl?: string | null;
  effectiveGrade?: string | null;
  lastAssessedAt?: string | null;
  totalXp?: number | null;
  xpByTaxonomy?: Record<string, number> | null;
  // Phase 16: перформанс из ClickHouse + composite score для сортировки.
  /** Максимальный XP в матрице для билда дизайнера. Нужен для xpNorm. */
  maxXp?: number | null;
  /** % попадания в срок за 6 мес (jobs из collab+manage). null если данных нет. */
  onTimePercent?: number | null;
  /** Сколько задач в выборке за 6 мес — для проверки минимальной значимости. */
  onTimeTotalTasks?: number;
  /** Composite score 0..1 (0.6·xpNorm + 0.4·perfNorm). Пред-рассчитан на сервере. */
  compositeScore?: number | null;
  /** Есть незакрытый черновик оценки (для статус-чипа в лидерборде). */
  hasDraft?: boolean;
  // Поля для пересчёта bento-агрегатов под скоуп «Мои» на клиенте:
  /** Ячейка 9-Box (для NIPC и карты потенциала подвыборки). */
  nineBoxCell?: { potential: string; performance: string } | null;
  /** Прирост totalXp между двумя последними оценками (скорость роста). */
  growthDelta?: number | null;
  /** XP до следующего грейда из последней оценки (готовность к повышению). */
  xpNeeded?: number | null;
  /** Возраст самого свежего черновика в днях (сигнал «без движения»). */
  draftAgeDays?: number | null;
  /** Phase 14: самооценка обновлялась после последней published-оценки. */
  selfFresh?: boolean;
};

/** Агрегаты команды для bento-строки лидерборда (концепт v4). */
export type TeamStats = {
  nipcPercent: number | null;
  /** Изменение NIPC с начала оценочного цикла, п.п. (Phase 25).
   *  null — истории ещё нет или скоуп «Мои» (история только командная). */
  nipcDelta?: number | null;
  /** Знаменатель NIPC: активные дизайнеры + стардизы. */
  nipcTotal: number;
  nipcStars: number;
  nipcHpot: number;
  nipcHperf: number;
  nipcRisk: number;
  nineBoxPlaced: number;
  onTimeMedian: number | null;
  onTimeSample: number;
  /** Месячная динамика «в срок» команды (проценты, по возрастанию месяца). */
  onTimeSpark: number[];
  growthMedian: number | null;
  growthSample: number;
  readyCount: number;
  gradedCount: number;
  draftCount: number;
  totalDesigners: number;
};

/** Сигнал для ленты «Требует внимания». */
export type AttentionItem = {
  tone: 'danger' | 'warn' | 'info';
  title: string;
  detail: string;
};

export type GradeThreshold = {
  code: string;
  name: string;
  sortOrder: number;
  xpThresholds: Record<string, number>;
};

type ViewMode =
  | 'leaderboard'
  | 'kanban-dept'
  | 'kanban-lead'
  | 'kanban-grade'
  | 'matrix';

/** Код вида по вкладке заранее. Канбан один на три группировки. */
function prefetchView(key: ViewMode) {
  if (key === 'matrix') prefetchMatrix();
  else if (key !== 'leaderboard') prefetchKanban();
}

type RoleFilter = 'all' | 'designer' | 'stardiz' | 'lead' | 'admin';

/**
 * «Текущие · Все» (Phase 23.6a): с реестром из HR в Грейдах и все ушедшие —
 * под сотню неактивных карточек. По умолчанию «Текущие» — неактивных не
 * видно ни в одном виде; «Все» — они серыми в конце списка и колонок.
 * Выбор помнит браузер.
 */
type PresenceFilter = 'current' | 'all';
const PRESENCE_KEY = 'team-presence';
/**
 * Подиум топ-3 над таблицей временно скрыт (Pavel 29.09.2026): все — просто
 * строками списка. Код подиума в LeaderboardView не удалён — вернуть: true.
 */
const PODIUM_ENABLED = false;

// ScopeFilter, scopeOwnerId, isMenteeOf и buildTeamOptions живут в
// @/lib/teamScope — чистой библиотекой, покрытой тестами.

export default function UsersClient({
  initialUsers,
  builds,
  leads,
  stardizes,
  gradeThresholds,
  meId,
  meRole,
  teamStats,
  nineBox,
  attention,
}: {
  initialUsers: UserRow[];
  builds: Build[];
  leads: Lead[];
  stardizes: Lead[];
  gradeThresholds: GradeThreshold[];
  meId: number | null;
  meRole: string;
  teamStats: TeamStats;
  nineBox: Record<string, number>;
  attention: AttentionItem[];
}) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [presence, setPresence] = useState<PresenceFilter>('current');
  // Дефолт scope: лиды видят «Мои» (по PRD §11.2), остальные — «Все».
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>(meRole === 'lead' ? 'mine' : 'all');
  const [search, setSearch] = useState('');
  const [modalUser, setModalUser] = useState<UserRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [view, setView] = useState<ViewMode>('leaderboard');
  const [card360User, setCard360User] = useState<UserRow | null>(null);
  // Контейнер текущего вида и его высота на момент переключения — для
  // скелетона ленивого вида (см. PrevViewHeight)
  const viewRef = useRef<HTMLDivElement | null>(null);
  const [prevViewHeight, setPrevViewHeight] = useState<number | undefined>(undefined);

  function switchView(next: ViewMode) {
    if (next === view) return;
    setPrevViewHeight(viewRef.current?.offsetHeight);
    setView(next);
  }

  // Выбор «Текущие · Все» — из браузера после монтирования: сервер его не
  // знает, и первый кадр всегда «Текущие» (без расхождения гидрации).
  // Хранилище бывает недоступно (приватный режим) — тогда просто дефолт.
  useEffect(() => {
    try {
      if (localStorage.getItem(PRESENCE_KEY) === 'all') setPresence('all');
    } catch {
      // без хранилища — «Текущие»
    }
  }, []);

  function changePresence(next: PresenceFilter) {
    setPresence(next);
    try {
      localStorage.setItem(PRESENCE_KEY, next);
    } catch {
      // не запомнили — не страшно, выбор действует до перезагрузки
    }
  }

  // В простое после загрузки докачиваем код того, что этой роли доступно
  // (модалка и 9-Box — только админу и лиду). Клик не ждёт сети, а вкладка,
  // открытая до деплоя, не ловит ChunkLoadError: чанков старой сборки на
  // сервере после выкладки уже нет. First Load это не утяжеляет.
  useEffect(() => {
    const manage = meRole === 'admin' || meRole === 'lead';
    const run = () => {
      prefetchCard360();
      prefetchKanban();
      if (manage) {
        prefetchUserModal();
        prefetchMatrix();
      }
    };
    // Safari requestIdleCallback не умеет — там просто таймер
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(run, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(run, 1500);
    return () => clearTimeout(t);
  }, [meRole]);

  // Свитчер «Все/Мои» виден только админу и лиду. Стардиз и так видит
  // только своих (фильтр на сервере), дизайнеры сюда не попадают.
  const showScopeSwitcher = meRole === 'admin' || meRole === 'lead';
  // 9-Box доступен только admin/lead (нужны права на drag-n-drop в API).
  const showMatrixTab = meRole === 'admin' || meRole === 'lead';

  // id владельца выбранной команды (null = «Все»). Считаем один раз и
  // переиспользуем в списке, счётчиках ролей и bento-агрегатах.
  const ownerId = showScopeSwitcher ? scopeOwnerId(scopeFilter, meId) : null;

  const filtered = useMemo(() => {
    let list = presence === 'current' ? users.filter((u) => u.active) : users;
    if (ownerId !== null) {
      list = list.filter((u) => isMenteeOf(u, ownerId));
    }
    if (roleFilter !== 'all') {
      list = list.filter((u) => u.role === roleFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (u) =>
          u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      );
    }
    return list;
  }, [users, presence, roleFilter, search, ownerId]);

  // Счётчики ролей считаем с учётом scope (но без поиска и роле-фильтра),
  // чтобы цифры в чипах были согласованы с тем, что увидит пользователь.
  // Деактивированных в счётчики не включаем — Pavel: «у нас деактивирован
  // Ваня Перов, значит счётчик Все должен стать 26, а не 27».
  // Сами карточки деактивированных в «Все» показываем (с opacity-50 и в
  // конце списка) — это уже логика отображения, отдельно от счётчиков:
  // цифры не зависят от «Текущие · Все».
  const counts = useMemo(() => {
    const scoped =
      ownerId !== null ? users.filter((u) => isMenteeOf(u, ownerId)) : users;
    const base = scoped.filter((u) => u.active);
    const c = { all: base.length, designer: 0, stardiz: 0, lead: 0, admin: 0 };
    base.forEach((u) => {
      if (u.role === 'designer') c.designer++;
      else if (u.role === 'stardiz') c.stardiz++;
      else if (u.role === 'lead') c.lead++;
      else if (u.role === 'admin') c.admin++;
    });
    return c;
  }, [users, ownerId]);

  // Счётчик «Мои» — подопечные текущего пользователя (для пункта скоупа).
  const mineCount = useMemo(
    () => (meId === null ? 0 : countMentees(users, meId)),
    [users, meId],
  );

  // Команды лидов и стардизов для селектора скоупа.
  const teamOptions = useMemo(
    () => buildTeamOptions(users, meId, meRole),
    [users, meId, meRole],
  );

  // Счётчик «Все» для сегмента скоупа — ВСЕГДА полная команда, независимо
  // от текущего выбора (иначе при переключении на «Мои» цифра «Все»
  // ошибочно показывала бы размер подвыборки — Pavel).
  const allActiveCount = useMemo(
    () => users.filter((u) => u.active).length,
    [users],
  );

  // Bento-агрегаты под текущий скоуп: для «Все» — готовые серверные
  // (с точными медианами ClickHouse и спарклайном); для «Мои» —
  // пересчитываем по подвыборке подопечных на клиенте.
  const scoped = useMemo(() => {
    if (ownerId === null) {
      return { stats: teamStats, nineBox, attention };
    }
    return computeScopedStats(
      users.filter((u) => isMenteeOf(u, ownerId)),
      meRole === 'stardiz' ? meId : null,
    );
  }, [ownerId, users, teamStats, nineBox, attention, meRole, meId]);

  function openNew() {
    setModalUser(null);
    setIsNew(true);
    setModalOpen(true);
  }

  function openEdit(user: UserRow) {
    setModalUser(user);
    setIsNew(false);
    setModalOpen(true);
  }

  function open360(user: UserRow) {
    setCard360User(user);
  }

  function handleEditFrom360(user: UserRow) {
    setCard360User(null);
    openEdit(user);
  }

  // Тумблер «Активен» из лидерборда убран (Pavel, v0.41) — управление
  // активностью осталось в модалке редактирования и карточке 360.

  // Ответ PATCH/POST — в строку списка. Общий путь для модалки «Изменить»
  // и переноса карточки в канбане.
  function mergeRow(saved: UserRow) {
    const viewer = meId !== null ? { id: meId, role: meRole } : null;
    setUsers((prev) => {
      const idx = prev.findIndex((u) => u.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        // Сливаем, а не заменяем: API отдаёт только поля из базы, а грейд,
        // XP, место и «в срок» считаются на странице. При замене они
        // пропадали из строки до перезагрузки. Почасовщик и билд без грейдов
        // места не имеют — снимаем сразу, не дожидаясь пересчёта (Phase 23.4).
        const merged: UserRow = {
          ...prev[idx],
          ...saved,
          ...(isGradingExempt(saved) ? { compositeScore: null } : {}),
        };
        // Лид передал человека другому — деньги этого человека ему больше не
        // положены: бейдж пересмотра и ставку убираем сразу, а не после
        // перезагрузки (сервер их уже не пришлёт).
        next[idx] = canViewCompensation(viewer, merged)
          ? merged
          : { ...merged, plannedRaise: null, salary: undefined };
        return next;
      }
      return [...prev, saved];
    });
  }

  function handleSaved(saved: UserRow) {
    mergeRow(saved);
    setModalOpen(false);
  }

  // Деактивация сама ставит дату увольнения (сервер, lib/userUpdate): если
  // её нет или она раньше найма — сегодня по Москве. Ответ DELETE даты не
  // несёт — применяем то же правило, чтобы поп-ап показал её без
  // перезагрузки. Дата, которую вернул сервер (patch), главнее.
  function deactivate<T extends UserRow>(u: T, patch?: Partial<UserRow>): T {
    const seeDate = canViewDismissalDate({ role: meRole });
    const auto = needsDismissalDate({
      dismissedAt: u.dismissedAt ? new Date(u.dismissedAt) : null,
      hiredAt: u.hiredAt ? new Date(u.hiredAt) : null,
    })
      ? todayMoscowDate().toISOString()
      : u.dismissedAt ?? null;
    return {
      ...u,
      ...patch,
      active: false,
      // Как строка неактивного с сервера: без рейтинга и бейджа пересмотра
      compositeScore: null,
      plannedRaise: null,
      ...(seeDate ? { dismissedAt: patch?.dismissedAt ?? auto } : {}),
    };
  }

  function handleDeleted(id: number) {
    setUsers((prev) => prev.map((u) => (u.id === id && u.active ? deactivate(u) : u)));
    setModalOpen(false);
  }

  return (
    <main className="max-w-[1240px] mx-auto px-8 pt-[164px] pb-16">
      {/* Заголовок — по центру, крупно, с halo-сиянием позади */}
      <div className="text-center mb-[164px] animate-fade-up title-halo">
        <TitleAurora />
        <h1 className="font-display text-[64px] leading-none font-medium tracking-[-0.035em]">
          Команда
        </h1>
      </div>

      {/* Один ряд контролов: скоуп · роль (дропдаун) · вью · поиск · добавить */}
      <div
        className="flex items-center gap-1.5 mb-5 flex-wrap animate-fade-up"
        style={{ animationDelay: '70ms' }}
      >
        {showScopeSwitcher && (
          <ScopeDropdown
            value={scopeFilter}
            allCount={allActiveCount}
            mineCount={mineCount}
            teams={teamOptions}
            onChange={setScopeFilter}
          />
        )}

        <RoleDropdown value={roleFilter} counts={counts} onChange={setRoleFilter} />

        {/* Текущие · Все — рядом с фильтрами состава, до переключателя вида */}
        <div className="segmented" role="group" aria-label="Кого показывать">
          {([
            ['current', 'Текущие'],
            ['all', 'Все'],
          ] as Array<[PresenceFilter, string]>).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => changePresence(key)}
              aria-pressed={presence === key}
              title={key === 'current' ? 'Только работающие сейчас' : 'Вместе с ушедшими — серыми в конце'}
              className={`segmented-item ${presence === key ? 'segmented-item-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="segmented">
          {([
            ['leaderboard', 'Лидерборд'],
            ['kanban-dept', 'Отделы'],
            ['kanban-lead', 'Лиды'],
            ['kanban-grade', 'Уровни'],
            ...(showMatrixTab ? [['matrix', '9-Box']] : []),
          ] as Array<[ViewMode, string]>).map(([key, label]) => (
            <button
              key={key}
              onClick={() => switchView(key)}
              // Ховер/фокус вкладки — начинаем качать код вида до клика
              onPointerEnter={() => prefetchView(key)}
              onFocus={() => prefetchView(key)}
              className={`segmented-item ${view === key ? 'segmented-item-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Поиск — единый компонент, тянется на всю свободную ширину строки */}
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Поиск по имени или email"
          className="flex-1 min-w-[220px]"
        />
        {(meRole === 'admin' || meRole === 'lead') && (
          <button
            onClick={openNew}
            onPointerEnter={prefetchUserModal}
            onFocus={prefetchUserModal}
            className="btn-accent h-10 py-0 shadow-[0_0_24px_rgb(var(--lime-glow-rgb)_/_0.18)]
                       hover:-translate-y-px hover:shadow-[0_0_34px_rgb(var(--lime-glow-rgb)_/_0.3)]"
          >
            Добавить
          </button>
        )}
      </div>

      {/* key={view} — при переключении вкладки контейнер пересоздаётся, и
          новый контент плавно «въезжает» (fade-up). Лёгкий переход между
          представлениями вместо резкой подмены.
          Ховер/фокус списка — намерение открыть человека: подтягиваем код
          поп-апа 360, чтобы по клику он открылся без ожидания. */}
      <PrevViewHeight.Provider value={prevViewHeight}>
        <div
          key={view}
          ref={viewRef}
          className="animate-fade-up"
          onPointerOver={prefetchCard360}
          onFocus={prefetchCard360}
        >
          {view === 'matrix' ? (
            <MatrixView users={filtered} />
          ) : view === 'leaderboard' ? (
            <LeaderboardView
              users={filtered}
              gradeThresholds={gradeThresholds}
              onRowClick={open360}
              teamStats={scoped.stats}
              nineBox={scoped.nineBox}
              attention={scoped.attention}
              searching={search.trim().length > 0}
              showPodium={PODIUM_ENABLED && meRole !== 'stardiz'}
              showSalary={meRole === 'admin'}
              includeStardiz={meRole !== 'stardiz'}
            />
          ) : (
            <KanbanView
              users={filtered}
              leads={leads}
              groupBy={
                view === 'kanban-dept'
                  ? 'department'
                  : view === 'kanban-lead'
                    ? 'lead'
                    : 'grade'
              }
              meId={meId}
              meRole={meRole}
              onCardClick={(u) => open360(u as UserRow)}
              onMoved={(u) => mergeRow(u as UserRow)}
            />
          )}
        </div>
      </PrevViewHeight.Provider>

      {modalOpen && (
        <UserModal
          user={modalUser}
          isNew={isNew}
          builds={builds}
          leads={leads}
          stardizes={stardizes}
          meRole={meRole}
          meId={meId}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}

      {card360User && (
        <UserCard360
          user={card360User}
          rank={(() => {
            // Позиция в рейтинге — по composite среди активных дизайнеров
            // (та же сортировка, что подиум+таблица лидерборда)
            const ranked = users
              .filter(
                (u) =>
                  (u.role === 'designer' || (meRole !== 'stardiz' && u.role === 'stardiz')) &&
                  u.active &&
                  u.compositeScore != null,
              )
              .sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));
            const i = ranked.findIndex((u) => u.id === card360User.id);
            return i >= 0 ? i + 1 : null;
          })()}
          meId={meId}
          meRole={meRole}
          onClose={() => setCard360User(null)}
          onEdit={handleEditFrom360}
          onPlannedRaiseChange={(id, planned) => {
            // Бейдж на аватарке появляется и пропадает сразу, не закрывая попап
            const apply = <T extends { id: number }>(u: T) =>
              u.id === id ? { ...u, plannedRaise: planned } : u;
            setUsers((prev) => prev.map(apply));
            setCard360User((curr) => (curr ? apply(curr) : curr));
          }}
          onGradingChanged={(id, plan) => {
            // План из ответа сервера — и в список (иконка таймера), и в
            // открытую карточку: результат виден сразу, не закрывая попап.
            const apply = <T extends { id: number }>(u: T) =>
              u.id === id ? { ...u, ...plan } : u;
            setUsers((prev) => prev.map(apply));
            setCard360User((curr) => (curr ? apply(curr) : curr));
          }}
          onDeactivated={(id, patch) => {
            const off = (u: UserRow) => (u.id === id && u.active ? deactivate(u, patch) : u);
            setUsers((prev) => prev.map(off));
            // Не закрываем popup — обновляем локальное состояние карточки,
            // чтобы Pavel видел результат (появляется чип «Неактивен»,
            // кнопки действий исчезают).
            setCard360User((curr) => (curr ? off(curr) : curr));
          }}
        />
      )}
    </main>
  );
}

/**
 * Пересчёт bento-агрегатов под подвыборку «Мои» — зеркалит серверную
 * логику из page.tsx, но по полям, уже лежащим на UserRow. Спарклайн
 * «в срок» по месяцам для подвыборки не считаем (нет помесячных данных
 * на клиенте) — отдаём пустой, карточка просто прячет линию.
 *
 * hiddenTalentId — зритель-стардиз: он видит в списке и себя, но в 9-Box и
 * NIPC его нет — только подопечные (как isOwnHiddenTalent в page.tsx).
 */
function computeScopedStats(
  list: UserRow[],
  hiddenTalentId: number | null = null,
): {
  stats: TeamStats;
  nineBox: Record<string, number>;
  attention: AttentionItem[];
} {
  const median = (xs: number[]): number | null => {
    if (!xs.length) return null;
    const a = [...xs].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
  };
  const plural = (n: number, forms: [string, string, string]) => {
    const last = n % 10;
    const lastTwo = n % 100;
    if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
    if (last === 1) return forms[0];
    if (last >= 2 && last <= 4) return forms[1];
    return forms[2];
  };

  // Те же правила, что на сервере (page.tsx): «в срок» — по всем активным
  // дизайнерам, включая почасовщиков и билд без грейдов; грейдирование и
  // таланты — без них.
  const activeDesigners = list.filter((u) => u.role === 'designer' && u.active);
  const talentDesigners = activeDesigners.filter((u) => !isGradingExempt(u));
  const eligible = list.filter(isGradable);
  const nineBoxEligible = eligible.filter((u) => u.id !== hiddenTalentId);

  // 9-Box подвыборки
  const nineBox: Record<string, number> = {};
  for (const u of nineBoxEligible) {
    if (!u.nineBoxCell) continue;
    const key = `${u.nineBoxCell.potential}_${u.nineBoxCell.performance}`;
    nineBox[key] = (nineBox[key] ?? 0) + 1;
  }
  const nb = (k: string) => nineBox[k] ?? 0;
  const nipcNumerator =
    nb('high_high') + nb('high_mid') + nb('mid_high') - nb('mid_low') - nb('low_mid') - nb('low_low');
  const nipcPercent = nineBoxEligible.length
    ? Math.round((nipcNumerator / nineBoxEligible.length) * 100)
    : null;

  const onTimeValues = activeDesigners
    .filter((u) => u.onTimePercent != null && (u.onTimeTotalTasks ?? 0) >= 5)
    .map((u) => u.onTimePercent as number);
  const growthDeltas = talentDesigners
    .map((u) => u.growthDelta)
    .filter((x): x is number => x != null);
  const gradedCount = talentDesigners.filter((u) => u.totalXp != null).length;
  const draftCount = talentDesigners.filter((u) => u.hasDraft).length;
  const readyRows = talentDesigners
    .filter((u) => u.xpNeeded != null && (u.xpNeeded as number) <= 20)
    .sort((a, b) => (a.xpNeeded as number) - (b.xpNeeded as number));

  const stats: TeamStats = {
    nipcPercent,
    nipcDelta: null,
    nipcTotal: nineBoxEligible.length,
    nipcStars: nb('high_high'),
    nipcHpot: nb('high_mid'),
    nipcHperf: nb('mid_high'),
    nipcRisk: nb('mid_low') + nb('low_mid') + nb('low_low'),
    nineBoxPlaced: Object.values(nineBox).reduce((s, n) => s + n, 0),
    onTimeMedian: median(onTimeValues),
    onTimeSample: onTimeValues.length,
    onTimeSpark: [],
    growthMedian: median(growthDeltas),
    growthSample: growthDeltas.length,
    readyCount: readyRows.length,
    gradedCount,
    draftCount,
    totalDesigners: talentDesigners.length,
  };

  const attention: AttentionItem[] = [];
  const staleDrafts = talentDesigners
    .filter((u) => u.draftAgeDays != null && (u.draftAgeDays as number) > 7)
    .sort((a, b) => (b.draftAgeDays as number) - (a.draftAgeDays as number));
  if (staleDrafts.length > 0) {
    attention.push({
      tone: 'danger',
      title: `${staleDrafts.length} ${plural(staleDrafts.length, ['черновик', 'черновика', 'черновиков'])} без публикации`,
      detail: `Старейший — ${staleDrafts[0].fullName.split(' ')[0]}, ${staleDrafts[0].draftAgeDays} дн.`,
    });
  }
  activeDesigners
    .filter(
      (u) => u.onTimePercent != null && (u.onTimeTotalTasks ?? 0) >= 5 && (u.onTimePercent as number) < 70,
    )
    .sort((a, b) => (a.onTimePercent as number) - (b.onTimePercent as number))
    .slice(0, 2)
    .forEach((u) => {
      attention.push({
        tone: 'warn',
        title: `${u.fullName}: «в срок» ${Math.round(u.onTimePercent as number)}%`,
        detail: `${u.onTimeTotalTasks} задач · 6 мес`,
      });
    });
  const freshSelf = talentDesigners.filter((u) => u.selfFresh);
  if (freshSelf.length > 0) {
    const names = freshSelf.map((u) => u.fullName.split(' ')[0]);
    attention.push({
      tone: 'info',
      title: `${freshSelf.length} ${
        freshSelf.length === 1
          ? 'дизайнер обновил'
          : freshSelf.length < 5
            ? 'дизайнера обновили'
            : 'дизайнеров обновили'
      } самооценку`,
      detail: `${names.slice(0, 2).join(', ')}${
        names.length > 2 ? ` и ещё ${names.length - 2}` : ''
      } — после последней оценки`,
    });
  }
  // Phase 23.2: те же сигналы грейдирования, что считает сервер для «Все».
  // Без этого блока лид на своём скоупе «Мои» (его дефолт) не видел ни
  // просрочек, ни людей без даты — сигналы жили только в серверном фиде.
  const gradingStates = eligible.map((u) => ({
    u,
    st: gradingPlanStatus({
      nextGradingAt: u.nextGradingAt ?? null,
      nextGradingSetAt: u.nextGradingSetAt ?? null,
      lastPublishedAt: u.lastAssessedAt ?? null,
    }),
  }));
  const overdue = gradingStates
    .filter((r) => r.st.state === 'overdue')
    .sort((a, b) => (a.st.daysLeft ?? 0) - (b.st.daysLeft ?? 0));
  if (overdue.length > 0) {
    attention.push({
      tone: 'danger',
      title: `Грейдирование просрочено — ${overdue.length} ${plural(overdue.length, ['человек', 'человека', 'человек'])}`,
      detail: `Дольше всех — ${overdue[0].u.fullName.split(' ')[0]}, ${-(overdue[0].st.daysLeft ?? 0)} дн.`,
    });
  }
  const unplanned = gradingStates.filter((r) => r.st.state === 'none');
  if (unplanned.length > 0) {
    const names = unplanned.map((r) => r.u.fullName.split(' ')[0]);
    attention.push({
      tone: 'warn',
      title: `Без даты грейдирования — ${unplanned.length}`,
      detail: `${names.slice(0, 3).join(', ')}${
        names.length > 3 ? ` и ещё ${names.length - 3}` : ''
      }`,
    });
  }

  readyRows.slice(0, 2).forEach((u) => {
    attention.push({
      tone: 'info',
      title: `${u.fullName} — близко к повышению`,
      detail: `+${u.xpNeeded} XP до порога`,
    });
  });

  return { stats, nineBox, attention: attention.slice(0, 5) };
}

/**
 * Дропдаун фильтра по ролям (концепт v3: сегменты ролей схлопнуты).
 * Закрывается по клику вне и по выбору.
 */
/**
 * Селектор команды: «Все · Мои · Никиты · Саши · …». Заменил сегментированный
 * свитчер «Все/Мои» — Pavel: нужно смотреть команды лидов и стардизов, а в
 * сегменты столько пунктов не влезает. Стиль повторяет RoleDropdown, чтобы
 * ряд контролов читался одним набором.
 */
function ScopeDropdown({
  value,
  allCount,
  mineCount,
  teams,
  onChange,
}: {
  value: ScopeFilter;
  allCount: number;
  mineCount: number;
  teams: TeamOption[];
  onChange: (s: ScopeFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const base: TeamOption[] = [
    { scope: 'all', label: 'Все', fullName: 'Вся команда', role: '', count: allCount },
    ...(mineCount > 0
      ? [
          {
            scope: 'mine' as ScopeFilter,
            label: 'Мои',
            fullName: 'Мои подопечные',
            role: '',
            count: mineCount,
          },
        ]
      : []),
  ];
  const current = [...base, ...teams].find((o) => o.scope === value) ?? base[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 bg-ink/5 border border-ink/5 rounded-pill
                   px-4 h-10 text-[13px] font-normal leading-none text-stone
                   hover:text-ink hover:bg-ink/10 transition-colors"
      >
        <span className="text-stone font-normal">Команда:</span>
        {current.label}
        <span className="text-stone text-xs">{current.count}</span>
        <ChevronDownIcon
          className={`w-3 h-3 text-stone transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-30 card p-1.5 min-w-[220px] shadow-soft-lg animate-scale-in">
          {base.map((o) => (
            <ScopeOption
              key={o.scope}
              option={o}
              active={value === o.scope}
              onPick={() => {
                onChange(o.scope);
                setOpen(false);
              }}
            />
          ))}
          {teams.length > 0 && (
            <>
              {/* Разделитель: выше — вся команда и свои, ниже — чужие команды */}
              <div className="my-1.5 h-px bg-cloud/60" />
              {teams.map((o) => (
                <ScopeOption
                  key={o.scope}
                  option={o}
                  active={value === o.scope}
                  onPick={() => {
                    onChange(o.scope);
                    setOpen(false);
                  }}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ScopeOption({
  option,
  active,
  onPick,
}: {
  option: TeamOption;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      title={option.fullName}
      className={`w-full flex items-center justify-between gap-4 px-3 py-2 rounded-[10px]
                  text-xs transition-colors ${
                    active
                      ? 'bg-cloud/60 text-ink font-medium'
                      : 'text-stone hover:bg-canvas hover:text-ink'
                  }`}
    >
      <span className="flex items-center gap-1.5 min-w-0">
        <span className="truncate">{option.label}</span>
        {option.role === 'stardiz' && (
          <span className="text-[10px] text-ash shrink-0">Стардиз</span>
        )}
      </span>
      <span className="text-ash shrink-0">{option.count}</span>
    </button>
  );
}

function RoleDropdown({
  value,
  counts,
  onChange,
}: {
  value: RoleFilter;
  counts: { all: number; designer: number; stardiz: number; lead: number; admin: number };
  onChange: (r: RoleFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const LABEL: Record<RoleFilter, string> = {
    all: 'Все',
    designer: 'Дизайнеры',
    stardiz: 'Стардизы',
    lead: 'Лиды',
    admin: 'Админы',
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 bg-ink/5 border border-ink/5 rounded-pill
                   px-4 h-10 text-[13px] font-normal leading-none text-stone
                   hover:text-ink hover:bg-ink/10 transition-colors"
      >
        <span className="text-stone font-normal">Роль:</span>
        {LABEL[value]}
        {/* text-xs + stone — тот же тон, что пункты сегментов (ash на
            ауроре проваливался) */}
        <span className="text-stone text-xs">{counts[value]}</span>
        <ChevronDownIcon
          className={`w-3 h-3 text-stone transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-30 card p-1.5 min-w-[190px] shadow-soft-lg animate-scale-in">
          {(Object.keys(LABEL) as RoleFilter[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                onChange(r);
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-4 px-3 py-2 rounded-[10px]
                          text-xs transition-colors ${
                            value === r
                              ? 'bg-cloud/60 text-ink font-medium'
                              : 'text-stone hover:bg-canvas hover:text-ink'
                          }`}
            >
              {LABEL[r]}
              <span className="text-ash">{counts[r]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
