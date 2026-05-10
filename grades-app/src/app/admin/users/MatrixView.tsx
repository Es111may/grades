'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';

type Build = { id: number; code: string; name: string };
type UserRow = {
  id: number;
  fullName: string;
  role: string;
  build: Build | null;
  active: boolean;
};

type Level = 'low' | 'mid' | 'high';
type Placement = {
  userId: number;
  potentialLevel: Level;
  performanceLevel: Level;
};

type CellMeta = {
  potential: Level;
  performance: Level;
  title: string;
  highlighted: boolean;
};

const CELLS: CellMeta[] = [
  { potential: 'high', performance: 'low', title: 'Проблемные гении', highlighted: true },
  { potential: 'high', performance: 'mid', title: 'Высокий потенциал', highlighted: false },
  { potential: 'high', performance: 'high', title: 'Звёзды', highlighted: false },
  { potential: 'mid', performance: 'low', title: 'Зона особого внимания', highlighted: false },
  { potential: 'mid', performance: 'mid', title: 'Основа команды', highlighted: true },
  { potential: 'mid', performance: 'high', title: 'Высокая производительность', highlighted: false },
  { potential: 'low', performance: 'low', title: 'Ошибка подбора', highlighted: false },
  { potential: 'low', performance: 'mid', title: 'Зона особого внимания', highlighted: false },
  { potential: 'low', performance: 'high', title: 'Рабочие лошадки', highlighted: true },
];

const UNASSIGNED_ID = 'unassigned';
const cellId = (potential: Level, performance: Level) => `cell-${potential}-${performance}`;
const parseCellId = (id: string): { potential: Level; performance: Level } | null => {
  const m = id.match(/^cell-(low|mid|high)-(low|mid|high)$/);
  if (!m) return null;
  return { potential: m[1] as Level, performance: m[2] as Level };
};

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const buildColor = (code: string) =>
  code === 'creator' ? '#00ca48' : code === 'visioner' ? '#7c3aed' : '#0ea5e9';

function UserCard({ user, ghosting = false }: { user: UserRow; ghosting?: boolean }) {
  return (
    <div
      className={`bg-snow border border-cloud rounded-[10px] px-2.5 py-1.5 shadow-soft flex items-center gap-2 ${
        ghosting ? 'opacity-30' : ''
      }`}
    >
      <div className="w-6 h-6 rounded-pill bg-cloud flex items-center justify-center text-[10px] font-semibold tracking-tight shrink-0">
        {initials(user.fullName)}
      </div>
      <span className="text-xs font-medium leading-tight truncate flex-1">{user.fullName}</span>
      {user.build && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: buildColor(user.build.code) }}
          title={user.build.name}
        />
      )}
    </div>
  );
}

function DraggableUser({ user, ghosting }: { user: UserRow; ghosting: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `user-${user.id}`,
    data: { userId: user.id },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-30' : ''}`}
    >
      <UserCard user={user} ghosting={ghosting && !isDragging} />
    </div>
  );
}

function MatrixCell({
  meta,
  users,
  saving,
}: {
  meta: CellMeta;
  users: UserRow[];
  saving: Set<number>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId(meta.potential, meta.performance) });
  return (
    <div
      ref={setNodeRef}
      className={`relative flex flex-col rounded-[14px] border transition-all duration-150 min-h-[180px] p-3 ${
        isOver
          ? 'border-sky ring-2 ring-sky bg-sky/5'
          : meta.highlighted
            ? 'border-cloud bg-cloud/40'
            : 'border-cloud bg-snow'
      }`}
    >
      <div className="text-[10px] uppercase tracking-widest font-semibold text-stone mb-2 leading-tight">
        {meta.title}
      </div>
      <div className="flex flex-col gap-1.5 flex-1">
        {users.map((u) => (
          <DraggableUser key={u.id} user={u} ghosting={saving.has(u.id)} />
        ))}
      </div>
    </div>
  );
}

function UnassignedZone({
  users,
  saving,
}: {
  users: UserRow[];
  saving: Set<number>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: UNASSIGNED_ID });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-[14px] border transition-all duration-150 p-3 w-[240px] shrink-0 self-start min-h-[200px] ${
        isOver ? 'border-sky ring-2 ring-sky bg-sky/5' : 'border-cloud bg-snow'
      }`}
    >
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-[11px] uppercase tracking-widest font-semibold text-stone">
          Не размещены
        </span>
        <span className="text-xs text-ash font-medium tabular-nums">{users.length}</span>
      </div>
      <div className="flex flex-col gap-1.5 flex-1">
        {users.map((u) => (
          <DraggableUser key={u.id} user={u} ghosting={saving.has(u.id)} />
        ))}
        {users.length === 0 && (
          <div className="text-xs text-ash italic text-center py-3">все размещены</div>
        )}
      </div>
    </div>
  );
}

function AboutAccordion() {
  const [open, setOpen] = useState(false);
  return (
    <div className="card mb-5 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-canvas/60 transition-colors"
      >
        <span className="text-sm font-semibold text-ink">О матрице 9-Box</span>
        <span
          className={`text-stone text-xs transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 text-sm text-graphite leading-relaxed space-y-4 border-t border-cloud">
          <p>
            <strong>Матрица потенциала 9-Box</strong> — инструмент для оценки сотрудников
            по двум осям: текущим достижениям и будущему потенциалу. Помогает увидеть,
            на каких уровнях развития находятся люди и какие направления роста для них
            наиболее перспективны.
          </p>

          <div>
            <div className="font-semibold text-ink mb-2">Структура</div>
            <p className="mb-2">9 клеток образованы двумя осями:</p>
            <div className="space-y-2 pl-1">
              <div>
                <div className="font-medium">Ось «Потенциал» — способность расти и развиваться</div>
                <ul className="list-disc list-inside text-stone mt-1 space-y-0.5">
                  <li>Низкий — не проявляет значительного потенциала для роста</li>
                  <li>Средний — потенциал есть, но требует обучения или опыта</li>
                  <li>Высокий — значительный потенциал для роста и продвижения</li>
                </ul>
              </div>
              <div>
                <div className="font-medium">Ось «Производительность» — результаты работы здесь и сейчас</div>
                <ul className="list-disc list-inside text-stone mt-1 space-y-0.5">
                  <li>Низкий — результаты ниже ожидаемых</li>
                  <li>Средний — результаты соответствуют ожиданиям</li>
                  <li>Высокий — результаты превышают ожидания</li>
                </ul>
              </div>
            </div>
          </div>

          <div>
            <div className="font-semibold text-ink mb-2">Как использовать</div>
            <ul className="space-y-1.5">
              <li>
                <span className="font-medium">Звёзды</span> (высокий потенциал + высокая
                производительность): на них ставка для лидерства и карьерного роста.
              </li>
              <li>
                <span className="font-medium">Ошибка подбора</span> (низкие оба): требуется
                пересмотр должности или плана обучения.
              </li>
              <li>
                <span className="font-medium">Основа команды</span> (средние оба): уровень
                удовлетворительного выполнения с возможностью дальнейшего роста.
              </li>
            </ul>
          </div>

          <div>
            <div className="font-semibold text-ink mb-2">Зачем это нужно</div>
            <ul className="space-y-1.5">
              <li>
                <span className="font-medium">Ясность в оценке.</span> Чёткое разделение
                по группам — кто требует внимания, а кто готов к новым вызовам.
              </li>
              <li>
                <span className="font-medium">Планирование развития.</span> Помогает
                выстраивать карьерный рост, обучение и наставничество.
              </li>
              <li>
                <span className="font-medium">Управление талантами.</span> Помогает
                выделить ключевых людей для важных задач.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MatrixView({ users }: { users: UserRow[] }) {
  const eligible = useMemo(
    () => users.filter((u) => (u.role === 'designer' || u.role === 'stardiz') && u.active),
    [users],
  );

  const [placements, setPlacements] = useState<Map<number, { potential: Level; performance: Level }>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [activeUserId, setActiveUserId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/team-matrix')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: Placement[]) => {
        if (cancelled) return;
        const m = new Map<number, { potential: Level; performance: Level }>();
        for (const p of data) {
          m.set(p.userId, { potential: p.potentialLevel, performance: p.performanceLevel });
        }
        setPlacements(m);
      })
      .catch(() => {
        /* fallback: пустые размещения */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const usersByCell = useMemo(() => {
    const map = new Map<string, UserRow[]>();
    const unassigned: UserRow[] = [];
    for (const u of eligible) {
      const p = placements.get(u.id);
      if (!p) {
        unassigned.push(u);
        continue;
      }
      const key = cellId(p.potential, p.performance);
      const arr = map.get(key) ?? [];
      arr.push(u);
      map.set(key, arr);
    }
    return { map, unassigned };
  }, [eligible, placements]);

  const activeUser = activeUserId !== null ? eligible.find((u) => u.id === activeUserId) : null;

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith('user-')) {
      setActiveUserId(parseInt(id.slice(5), 10));
    }
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveUserId(null);
    const activeId = String(e.active.id);
    if (!activeId.startsWith('user-') || !e.over) return;
    const userId = parseInt(activeId.slice(5), 10);
    const overId = String(e.over.id);

    const prev = placements.get(userId) ?? null;

    let next: { potential: Level; performance: Level } | null = null;
    if (overId === UNASSIGNED_ID) {
      next = null;
    } else {
      const parsed = parseCellId(overId);
      if (!parsed) return;
      next = parsed;
    }

    // ничего не меняется
    if (
      (prev === null && next === null) ||
      (prev !== null &&
        next !== null &&
        prev.potential === next.potential &&
        prev.performance === next.performance)
    ) {
      return;
    }

    // optimistic update
    setPlacements((curr) => {
      const m = new Map(curr);
      if (next === null) m.delete(userId);
      else m.set(userId, next);
      return m;
    });
    setSaving((s) => new Set(s).add(userId));

    try {
      const res =
        next === null
          ? await fetch(`/api/team-matrix/${userId}`, { method: 'DELETE' })
          : await fetch(`/api/team-matrix/${userId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                potentialLevel: next.potential,
                performanceLevel: next.performance,
              }),
            });
      if (!res.ok) {
        // rollback
        setPlacements((curr) => {
          const m = new Map(curr);
          if (prev === null) m.delete(userId);
          else m.set(userId, prev);
          return m;
        });
        const j = await res.json().catch(() => ({}));
        alert(`Не удалось сохранить: ${j.error ?? res.statusText}`);
      }
    } catch {
      setPlacements((curr) => {
        const m = new Map(curr);
        if (prev === null) m.delete(userId);
        else m.set(userId, prev);
        return m;
      });
      alert('Ошибка сети — изменение не сохранилось');
    } finally {
      setSaving((s) => {
        const n = new Set(s);
        n.delete(userId);
        return n;
      });
    }
  }

  if (loading) {
    return (
      <>
        <AboutAccordion />
        <div className="flex gap-5 items-start">
          <div className="w-[240px] h-[400px] rounded-[14px] bg-cloud/40 animate-pulse shrink-0" />
          <div className="flex-1 grid grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-[180px] rounded-[14px] bg-cloud/40 animate-pulse" />
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <AboutAccordion />
      <div className="flex gap-5 items-stretch">
        <UnassignedZone users={usersByCell.unassigned} saving={saving} />

        {/* Контейнер матрицы с осями */}
        <div className="flex-1 flex gap-2.5">
          {/* Y-ось: Потенциал */}
          <div className="flex flex-col items-center justify-center w-7 shrink-0">
            <div className="text-[10px] uppercase tracking-widest text-stone font-semibold whitespace-nowrap"
                 style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
              Потенциал ↑
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-2">
            {/* 3x3 grid: строки сверху вниз = high, mid, low */}
            <div className="grid grid-cols-3 gap-3 flex-1">
              {CELLS.map((meta) => (
                <MatrixCell
                  key={cellId(meta.potential, meta.performance)}
                  meta={meta}
                  users={usersByCell.map.get(cellId(meta.potential, meta.performance)) ?? []}
                  saving={saving}
                />
              ))}
            </div>
            {/* X-ось: Производительность */}
            <div className="text-center text-[10px] uppercase tracking-widest text-stone font-semibold pt-1">
              Производительность →
            </div>
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeUser ? (
          <div className="rotate-2 shadow-soft-md">
            <UserCard user={activeUser} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
