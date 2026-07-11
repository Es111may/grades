'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDownIcon } from '@/components/icons';
import SearchInput from '@/components/SearchInput';
import UserModal from './UserModal';
import KanbanView from './KanbanView';
import MatrixView from './MatrixView';
import UserCard360 from './UserCard360';
import LeaderboardView from './LeaderboardView';
import TitleAurora from '@/components/TitleAurora';

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
};

/** Агрегаты команды для bento-строки лидерборда (концепт v4). */
export type TeamStats = {
  nipcPercent: number | null;
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

type RoleFilter = 'all' | 'designer' | 'stardiz' | 'lead' | 'admin';
type ScopeFilter = 'all' | 'mine';

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
  // Дефолт scope: лиды видят «Мои» (по PRD §11.2), остальные — «Все».
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>(meRole === 'lead' ? 'mine' : 'all');
  const [search, setSearch] = useState('');
  const [modalUser, setModalUser] = useState<UserRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [view, setView] = useState<ViewMode>('leaderboard');
  const [card360User, setCard360User] = useState<UserRow | null>(null);

  // Свитчер «Все/Мои» виден только админу и лиду. Стардиз и так видит
  // только своих (фильтр на сервере), дизайнеры сюда не попадают.
  const showScopeSwitcher = meRole === 'admin' || meRole === 'lead';
  // 9-Box доступен только admin/lead (нужны права на drag-n-drop в API).
  const showMatrixTab = meRole === 'admin' || meRole === 'lead';

  const filtered = useMemo(() => {
    let list = users;
    if (showScopeSwitcher && scopeFilter === 'mine' && meId !== null) {
      list = list.filter((u) => u.leadId === meId || u.stardizId === meId);
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
  }, [users, roleFilter, search, scopeFilter, showScopeSwitcher, meId]);

  // Счётчики ролей считаем с учётом scope (но без поиска и роле-фильтра),
  // чтобы цифры в чипах были согласованы с тем, что увидит пользователь.
  // Деактивированных в счётчики не включаем — Pavel: «у нас деактивирован
  // Ваня Перов, значит счётчик Все должен стать 26, а не 27».
  // Сами карточки деактивированных продолжаем показывать (с opacity-50
  // и в конце списка) — это уже логика отображения, отдельно от счётчиков.
  const counts = useMemo(() => {
    const scoped =
      showScopeSwitcher && scopeFilter === 'mine' && meId !== null
        ? users.filter((u) => u.leadId === meId || u.stardizId === meId)
        : users;
    const base = scoped.filter((u) => u.active);
    const c = { all: base.length, designer: 0, stardiz: 0, lead: 0, admin: 0 };
    base.forEach((u) => {
      if (u.role === 'designer') c.designer++;
      else if (u.role === 'stardiz') c.stardiz++;
      else if (u.role === 'lead') c.lead++;
      else if (u.role === 'admin') c.admin++;
    });
    return c;
  }, [users, scopeFilter, showScopeSwitcher, meId]);

  // Счётчик «Мои» — подопечные текущего пользователя (для сегмента скоупа).
  const mineCount = useMemo(
    () =>
      meId === null
        ? 0
        : users.filter(
            (u) => u.active && (u.leadId === meId || u.stardizId === meId),
          ).length,
    [users, meId],
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
    if (!(showScopeSwitcher && scopeFilter === 'mine' && meId !== null)) {
      return { stats: teamStats, nineBox, attention };
    }
    const mine = users.filter((u) => u.leadId === meId || u.stardizId === meId);
    return computeScopedStats(mine);
  }, [showScopeSwitcher, scopeFilter, meId, users, teamStats, nineBox, attention]);

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

  function handleSaved(saved: UserRow) {
    setUsers((prev) => {
      const idx = prev.findIndex((u) => u.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    setModalOpen(false);
  }

  function handleDeleted(id: number) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, active: false } : u)));
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
          <div className="segmented">
            {(['all', 'mine'] as ScopeFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setScopeFilter(s)}
                className={`segmented-item ${
                  scopeFilter === s ? 'segmented-item-active' : ''
                }`}
              >
                {s === 'all' ? 'Все' : 'Мои'}
                <span className="ml-1.5 text-ash text-xs">
                  {s === 'all' ? allActiveCount : mineCount}
                </span>
              </button>
            ))}
          </div>
        )}

        <RoleDropdown value={roleFilter} counts={counts} onChange={setRoleFilter} />

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
              onClick={() => setView(key)}
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
            className="btn-accent h-10 py-0 shadow-[0_0_24px_rgb(var(--lime-glow-rgb)_/_0.18)]
                       hover:-translate-y-px hover:shadow-[0_0_34px_rgb(var(--lime-glow-rgb)_/_0.3)]"
          >
            Добавить
          </button>
        )}
      </div>

      {/* key={view} — при переключении вкладки контейнер пересоздаётся, и
          новый контент плавно «въезжает» (fade-up). Лёгкий переход между
          представлениями вместо резкой подмены. */}
      <div key={view} className="animate-fade-up">
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
            onCardClick={(u) => open360(u as UserRow)}
          />
        )}
      </div>

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
              .filter((u) => u.role === 'designer' && u.active && u.compositeScore != null)
              .sort((a, b) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0));
            const i = ranked.findIndex((u) => u.id === card360User.id);
            return i >= 0 ? i + 1 : null;
          })()}
          meId={meId}
          meRole={meRole}
          onClose={() => setCard360User(null)}
          onEdit={handleEditFrom360}
          onDeactivated={(id) => {
            setUsers((prev) =>
              prev.map((u) => (u.id === id ? { ...u, active: false } : u)),
            );
            // Не закрываем popup — обновляем локальное состояние карточки,
            // чтобы Pavel видел результат (появляется чип «Неактивен»,
            // кнопки действий исчезают).
            setCard360User((curr) =>
              curr && curr.id === id ? { ...curr, active: false } : curr,
            );
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
 */
function computeScopedStats(list: UserRow[]): {
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

  const activeDesigners = list.filter((u) => u.role === 'designer' && u.active);
  const eligible = list.filter(
    (u) => (u.role === 'designer' || u.role === 'stardiz') && u.active,
  );

  // 9-Box подвыборки
  const nineBox: Record<string, number> = {};
  for (const u of eligible) {
    if (!u.nineBoxCell) continue;
    const key = `${u.nineBoxCell.potential}_${u.nineBoxCell.performance}`;
    nineBox[key] = (nineBox[key] ?? 0) + 1;
  }
  const nb = (k: string) => nineBox[k] ?? 0;
  const nipcNumerator =
    nb('high_high') + nb('high_mid') + nb('mid_high') - nb('mid_low') - nb('low_mid') - nb('low_low');
  const nipcPercent = eligible.length
    ? Math.round((nipcNumerator / eligible.length) * 100)
    : null;

  const onTimeValues = activeDesigners
    .filter((u) => u.onTimePercent != null && (u.onTimeTotalTasks ?? 0) >= 5)
    .map((u) => u.onTimePercent as number);
  const growthDeltas = activeDesigners
    .map((u) => u.growthDelta)
    .filter((x): x is number => x != null);
  const gradedCount = activeDesigners.filter((u) => u.totalXp != null).length;
  const draftCount = activeDesigners.filter((u) => u.hasDraft).length;
  const readyRows = activeDesigners
    .filter((u) => u.xpNeeded != null && (u.xpNeeded as number) <= 20)
    .sort((a, b) => (a.xpNeeded as number) - (b.xpNeeded as number));

  const stats: TeamStats = {
    nipcPercent,
    nipcTotal: eligible.length,
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
    totalDesigners: activeDesigners.length,
  };

  const attention: AttentionItem[] = [];
  const staleDrafts = activeDesigners
    .filter((u) => u.draftAgeDays != null && (u.draftAgeDays as number) > 7)
    .sort((a, b) => (b.draftAgeDays as number) - (a.draftAgeDays as number));
  if (staleDrafts.length > 0) {
    attention.push({
      tone: 'danger',
      title: `${staleDrafts.length} ${plural(staleDrafts.length, ['черновик', 'черновика', 'черновиков'])} без публикации`,
      detail: `старейший — ${staleDrafts[0].fullName.split(' ')[0]}, ${staleDrafts[0].draftAgeDays} дн.`,
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
                   px-4 h-10 text-[13px] text-ink hover:bg-ink/10 transition-colors"
      >
        <span className="text-stone font-normal">Роль:</span>
        {LABEL[value]}
        <span className="text-ash">{counts[value]}</span>
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
