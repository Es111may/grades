'use client';

import { useState, useMemo } from 'react';
import UserModal from './UserModal';
import KanbanView from './KanbanView';

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
  effectiveGrade: string | null;
};

type ViewMode = 'table' | 'kanban-dept' | 'kanban-lead' | 'kanban-grade';

type RoleFilter = 'all' | 'designer' | 'stardiz' | 'lead' | 'admin';

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
  meRole,
}: {
  initialUsers: UserRow[];
  builds: Build[];
  leads: Lead[];
  stardizes: Lead[];
  meRole: string;
}) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [search, setSearch] = useState('');
  const [modalUser, setModalUser] = useState<UserRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [view, setView] = useState<ViewMode>('table');

  const filtered = useMemo(() => {
    let list = users;
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
  }, [users, roleFilter, search]);

  const counts = useMemo(() => {
    const c = { all: users.length, designer: 0, stardiz: 0, lead: 0, admin: 0 };
    users.forEach((u) => {
      if (u.role === 'designer') c.designer++;
      else if (u.role === 'stardiz') c.stardiz++;
      else if (u.role === 'lead') c.lead++;
      else if (u.role === 'admin') c.admin++;
    });
    return c;
  }, [users]);

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
    <main className="max-w-[1400px] mx-auto px-8 pt-12 pb-16">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="text-xs uppercase tracking-widest text-stone mb-2">
            Пользователи системы
          </div>
          <h1 className="font-display text-5xl font-light tracking-tight mb-2">
            Команда
          </h1>
          <div className="text-sm text-stone">
            {counts.designer} дизайнеров · {counts.lead} лидов · {counts.admin} админов
          </div>
        </div>
        <button
          onClick={openNew}
          className="bg-lime border border-lime rounded-pill px-5 py-2.5 text-sm font-medium hover:brightness-95 transition"
        >
          + Добавить пользователя
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <span className="text-xs text-stone mr-1">Роль:</span>
        {(['all', 'designer', 'stardiz', 'lead', 'admin'] as RoleFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setRoleFilter(f)}
            className={`px-3.5 py-1.5 rounded-pill text-xs font-medium border transition ${
              roleFilter === f
                ? 'bg-ink text-white border-ink'
                : 'bg-white text-stone border-cloud hover:border-ash'
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
                    : 'Админы'}{' '}
            · {counts[f]}
          </button>
        ))}
        <span className="ml-auto">
          <input
            type="text"
            placeholder="Поиск по имени/email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[280px] px-4 py-2 text-sm border border-cloud rounded-card bg-white focus:outline-none focus:border-ash"
          />
        </span>
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-cloud" data-build="0.3.0">
        {(
          [
            ['table', 'Таблица'],
            ['kanban-dept', 'Канбан · Отделы'],
            ['kanban-lead', 'Канбан · Лиды'],
            ['kanban-grade', 'Канбан · Уровни'],
          ] as Array<[ViewMode, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`px-4 py-2 text-sm transition border-b-2 -mb-px ${
              view === key
                ? 'border-ink text-ink font-medium'
                : 'border-transparent text-stone hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'table' ? (
      /* Table */
      <div className="bg-white border border-cloud rounded-card overflow-hidden shadow-soft">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cloud">
              <th className="text-left py-3.5 px-6 font-normal text-xs uppercase tracking-widest text-stone">
                Имя
              </th>
              <th className="text-left py-3.5 px-4 font-normal text-xs uppercase tracking-widest text-stone">
                Роль
              </th>
              <th className="text-left py-3.5 px-4 font-normal text-xs uppercase tracking-widest text-stone">
                Билд
              </th>
              <th className="text-left py-3.5 px-4 font-normal text-xs uppercase tracking-widest text-stone">
                Отдел
              </th>
              <th className="text-left py-3.5 px-4 font-normal text-xs uppercase tracking-widest text-stone">
                Лид
              </th>
              <th className="text-left py-3.5 px-4 font-normal text-xs uppercase tracking-widest text-stone">
                Найм
              </th>
              <th className="text-center py-3.5 px-4 font-normal text-xs uppercase tracking-widest text-stone">
                Floor
              </th>
              <th className="text-center py-3.5 px-4 font-normal text-xs uppercase tracking-widest text-stone">
                Активен
              </th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-cloud">
            {filtered.map((u) => (
              <tr
                key={u.id}
                className={`hover:bg-canvas ${!u.active ? 'opacity-50' : ''}`}
              >
                <td className="py-3 px-6">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-pill bg-cloud flex items-center justify-center text-xs font-medium shrink-0">
                      {initials(u.fullName)}
                    </div>
                    <div>
                      <div className="font-medium">{u.fullName}</div>
                      <div className="text-xs text-stone">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4">{ROLE_LABELS[u.role] ?? u.role}</td>
                <td className="py-3 px-4">
                  {u.build ? (
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          background:
                            u.build.code === 'creator'
                              ? '#ade900'
                              : u.build.code === 'visioner'
                                ? '#7c3aed'
                                : '#0ea5e9',
                        }}
                      />
                      {u.build.name}
                    </span>
                  ) : (
                    <span className="text-stone">—</span>
                  )}
                </td>
                <td className="py-3 px-4">{u.department ?? '—'}</td>
                <td className="py-3 px-4">{u.lead?.fullName ?? '—'}</td>
                <td className="py-3 px-4 text-stone">{formatDate(u.hiredAt)}</td>
                <td className="py-3 px-4 text-center">
                  {u.gradeFloor ? (
                    <span className="inline-block px-2.5 py-0.5 rounded-pill text-xs font-medium bg-[#fff7e6] text-sunset border border-sunset/25">
                      {GRADE_LABELS[u.gradeFloor] ?? u.gradeFloor}
                    </span>
                  ) : (
                    <span className="text-stone">—</span>
                  )}
                </td>
                <td className="py-3 px-4 text-center">
                  <button
                    onClick={() => handleToggleActive(u)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${
                      u.active ? 'bg-lime' : 'bg-cloud'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        u.active ? 'left-[18px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </td>
                <td className="py-3 px-4 text-center">
                  <button
                    onClick={() => openEdit(u)}
                    className="px-3 py-1 rounded-pill text-xs border border-cloud hover:border-ash transition"
                  >
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
          onCardClick={(u) => openEdit(u as UserRow)}
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
    </main>
  );
}
