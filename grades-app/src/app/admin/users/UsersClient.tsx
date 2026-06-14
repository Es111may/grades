'use client';

import { useState, useMemo } from 'react';
import UserModal from './UserModal';
import KanbanView from './KanbanView';
import MatrixView from './MatrixView';
import UserCard360 from './UserCard360';
import LeaderboardView from './LeaderboardView';

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
}: {
  initialUsers: UserRow[];
  builds: Build[];
  leads: Lead[];
  stardizes: Lead[];
  gradeThresholds: GradeThreshold[];
  meId: number | null;
  meRole: string;
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

  async function handleToggleActive(user: UserRow) {
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !user.active }),
    });
    if (res.ok) {
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    }
  }

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
    <main className="max-w-[1400px] mx-auto px-8 pt-10 pb-16">
      <div className="flex items-end justify-between mb-6 gap-4">
        <h1 className="font-display text-4xl font-medium tracking-tight">Команда</h1>
        {(meRole === 'admin' || meRole === 'lead') && (
          <button onClick={openNew} className="btn-accent">
            Добавить пользователя
          </button>
        )}
      </div>

      {/* Объединённый тулбар: scope + роль + view + поиск */}
      <div className="flex items-center gap-1.5 mb-5 flex-wrap">
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
              </button>
            ))}
          </div>
        )}

        <div className="segmented">
          {(['all', 'designer', 'stardiz', 'lead', 'admin'] as RoleFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setRoleFilter(f)}
              className={`segmented-item ${
                roleFilter === f ? 'segmented-item-active' : ''
              }`}
            >
              {f === 'all'
                ? 'Все'
                : f === 'designer'
                  ? 'Дизайнеры'
                  : f === 'stardiz'
                    ? 'Стардизы'
                    : f === 'lead'
                      ? 'Лиды'
                      : 'Админы'}
              <span
                className={`ml-1.5 ${
                  roleFilter === f ? 'text-stone' : 'text-ash'
                }`}
              >
                {counts[f]}
              </span>
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
              onClick={() => setView(key)}
              className={`segmented-item ${view === key ? 'segmented-item-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="ml-auto w-[280px]">
          <input
            type="text"
            placeholder="Поиск по имени или email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
          />
        </span>
      </div>

      {view === 'matrix' ? (
        <MatrixView users={filtered} />
      ) : view === 'leaderboard' ? (
        <LeaderboardView
          users={filtered}
          gradeThresholds={gradeThresholds}
          onRowClick={open360}
          onToggleActive={handleToggleActive}
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
