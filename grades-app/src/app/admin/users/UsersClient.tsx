'use client';

import { useState, useMemo } from 'react';
import UserModal from './UserModal';
import KanbanView from './KanbanView';
import MatrixView from './MatrixView';
import UserCard360 from './UserCard360';

type Build = { id: number; code: string; name: string };
type Lead = { id: number; fullName: string };
type UserRow = {
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
  effectiveGrade?: string | null;
  lastAssessedAt?: string | null;
};

type ViewMode = 'table' | 'kanban-dept' | 'kanban-lead' | 'kanban-grade' | 'matrix';

type RoleFilter = 'all' | 'designer' | 'stardiz' | 'lead' | 'admin';
type ScopeFilter = 'all' | 'mine';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Админ',
  lead: 'Лид',
  stardiz: 'Стардиз',
  designer: 'Дизайнер',
};

const GRADE_LABELS: Record<string, string> = {
  junior: 'Джун',
  junior_plus: 'Джун+',
  premiddle: 'Пре-мидл',
  middle: 'Мидл',
  middle_plus: 'Мидл+',
  senior: 'Синьор',
};

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

export default function UsersClient({
  initialUsers,
  builds,
  leads,
  stardizes,
  meId,
  meRole,
}: {
  initialUsers: UserRow[];
  builds: Build[];
  leads: Lead[];
  stardizes: Lead[];
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
  const [view, setView] = useState<ViewMode>('table');
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
  const counts = useMemo(() => {
    const base =
      showScopeSwitcher && scopeFilter === 'mine' && meId !== null
        ? users.filter((u) => u.leadId === meId || u.stardizId === meId)
        : users;
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

  return (
    <main className="max-w-[1400px] mx-auto px-8 pt-10 pb-16">
      <div className="flex items-end justify-between mb-6 gap-4">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Команда</h1>
        {(meRole === 'admin' || meRole === 'lead') && (
          <button onClick={openNew} className="btn-accent">
            Добавить пользователя
          </button>
        )}
      </div>

      {/* Объединённый тулбар: scope + роль + view + поиск */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
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
          {(
            [
              ['table', 'Таблица'],
              ['kanban-dept', 'Отделы'],
              ['kanban-lead', 'Лиды'],
              ['kanban-grade', 'Уровни'],
              ...(showMatrixTab ? ([['matrix', '9-Box']] as Array<[ViewMode, string]>) : []),
            ] as Array<[ViewMode, string]>
          ).map(([key, label]) => (
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
      ) : view === 'table' ? (
      /* Table */
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-canvas border-b border-cloud">
              {['Имя', 'Роль', 'Билд', 'Отдел', 'Лид', 'Найм'].map((h) => (
                <th
                  key={h}
                  className="text-left py-2.5 px-4 font-medium text-[11px] uppercase tracking-widest text-stone"
                >
                  {h}
                </th>
              ))}
              <th className="text-center py-2.5 px-4 font-medium text-[11px] uppercase tracking-widest text-stone">
                Floor
              </th>
              <th className="text-center py-2.5 px-4 font-medium text-[11px] uppercase tracking-widest text-stone">
                Активен
              </th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody className="divide-y divide-cloud">
            {filtered.map((u) => (
              <tr
                key={u.id}
                className={`hover:bg-canvas/60 transition-colors ${
                  !u.active ? 'opacity-50' : ''
                }`}
              >
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-pill bg-cloud flex items-center justify-center text-[11px] font-semibold tracking-tight shrink-0">
                      {initials(u.fullName)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium leading-tight">{u.fullName}</div>
                      <div className="text-xs text-stone leading-tight mt-0.5">
                        {u.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 text-stone">{ROLE_LABELS[u.role] ?? u.role}</td>
                <td className="py-3 px-4">
                  {u.build ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-pill border border-cloud bg-canvas text-xs">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          background:
                            u.build.code === 'creator'
                              ? '#00ca48'
                              : u.build.code === 'visioner'
                                ? '#7c3aed'
                                : '#0ea5e9',
                        }}
                      />
                      {u.build.name}
                    </span>
                  ) : (
                    <span className="text-ash">—</span>
                  )}
                </td>
                <td className="py-3 px-4 text-stone">{u.department ?? '—'}</td>
                <td className="py-3 px-4 text-stone">{u.lead?.fullName ?? '—'}</td>
                <td className="py-3 px-4 text-stone">{formatDate(u.hiredAt)}</td>
                <td className="py-3 px-4 text-center">
                  {u.gradeFloor ? (
                    <span className="chip-warn">
                      {GRADE_LABELS[u.gradeFloor] ?? u.gradeFloor}
                    </span>
                  ) : (
                    <span className="text-ash">—</span>
                  )}
                </td>
                <td className="py-3 px-4 text-center">
                  <button
                    onClick={() => handleToggleActive(u)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${
                      u.active ? 'bg-emerald' : 'bg-cloud'
                    }`}
                    aria-label={u.active ? 'Деактивировать' : 'Активировать'}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        u.active ? 'left-[18px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </td>
                <td className="py-3 px-4 text-right">
                  <button onClick={() => open360(u)} className="btn-ghost btn-sm">
                    Открыть
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-stone">
                  Нет пользователей
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
      {view === 'table' && (
        <div className="mt-3 text-xs text-stone">
          Серая строка — деактивированный пользователь.
        </div>
      )}

      {modalOpen && (
        <UserModal
          user={modalUser}
          isNew={isNew}
          builds={builds}
          leads={leads}
          stardizes={stardizes}
          meRole={meRole}
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
            setCard360User(null);
          }}
        />
      )}
    </main>
  );
}
