'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Avatar from '@/components/Avatar';
import { ChevronDownIcon } from '@/components/icons';

type Build = { id: number; code: string; name: string };
type Lead = { id: number; fullName: string };
type UserRow = {
  id: number;
  email: string;
  fullName: string;
  role: string;
  build: Build | null;
  department: string | null;
  leadId: number | null;
  lead: Lead | null;
  active: boolean;
  effectiveGrade?: string | null;
  gradeFloor: string | null;
  avatarUrl?: string | null;
};

type GroupBy = 'department' | 'lead' | 'grade';

const GRADE_LABELS: Record<string, string> = {
  junior: 'Джун',
  junior_plus: 'Джун+',
  premiddle: 'Пре-мидл',
  middle: 'Мидл',
  middle_plus: 'Мидл+',
  senior: 'Синьор',
};
const GRADE_ORDER = ['junior', 'junior_plus', 'premiddle', 'middle', 'middle_plus', 'senior'];

const ROLE_TONE: Record<string, string> = {
  admin: 'bg-sunset/15 text-sunset',
  lead: 'bg-lime-light text-graphite border border-lime/30',
  stardiz: 'bg-[#bf5af2]/15 text-[#bf5af2]',
  designer: 'bg-cloud/60 text-stone',
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'Админ',
  lead: 'Лид',
  stardiz: 'Стардиз',
  designer: 'Дизайнер',
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

export default function KanbanView({
  users,
  leads,
  groupBy,
  onCardClick,
}: {
  users: UserRow[];
  leads: Lead[];
  groupBy: GroupBy;
  onCardClick: (user: UserRow) => void;
}) {
  const router = useRouter();
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollBy(delta: number) {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  }

  const columns = useMemo(() => {
    if (groupBy === 'department') {
      const cols: Array<{ key: string; label: string; users: UserRow[] }> = [
        { key: 'Инхаус', label: 'Инхаус', users: [] },
        { key: 'Криэйт', label: 'Криэйт', users: [] },
        { key: 'Импрув', label: 'Импрув', users: [] },
        { key: '__none', label: 'Без отдела', users: [] },
      ];
      const byKey = new Map(cols.map((c) => [c.key, c]));
      for (const u of users) {
        const k = u.department && byKey.has(u.department) ? u.department : '__none';
        byKey.get(k)!.users.push(u);
      }
      return cols;
    }

    if (groupBy === 'lead') {
      // Артуш Манукян — всегда последним лидом, перед «Без лида» (Pavel).
      const orderedLeads = [...leads].sort((a, b) => {
        const aArtush = a.fullName.startsWith('Артуш');
        const bArtush = b.fullName.startsWith('Артуш');
        if (aArtush !== bArtush) return aArtush ? 1 : -1;
        return 0; // остальные — в исходном (алфавитном) порядке
      });
      const cols: Array<{ key: string; label: string; users: UserRow[] }> =
        orderedLeads.map((l) => ({ key: String(l.id), label: l.fullName, users: [] }));
      cols.push({ key: '__none', label: 'Без лида', users: [] });
      const byKey = new Map(cols.map((c) => [c.key, c]));
      for (const u of users) {
        // Канбан-«Лиды» показываем только дизайнеров (у других нет лида)
        if (u.role !== 'designer') continue;
        const k = u.leadId && byKey.has(String(u.leadId)) ? String(u.leadId) : '__none';
        byKey.get(k)!.users.push(u);
      }
      return cols;
    }

    // grade
    const cols: Array<{ key: string; label: string; users: UserRow[] }> = GRADE_ORDER.map(
      (code) => ({ key: code, label: GRADE_LABELS[code], users: [] }),
    );
    cols.push({ key: '__none', label: 'Без оценки', users: [] });
    const byKey = new Map(cols.map((c) => [c.key, c]));
    for (const u of users) {
      if (u.role !== 'designer') continue;
      const grade = u.effectiveGrade ?? u.gradeFloor;
      const k = grade && byKey.has(grade) ? grade : '__none';
      byKey.get(k)!.users.push(u);
    }
    return cols;
  }, [users, leads, groupBy]);

  const canDrop = groupBy === 'department' || groupBy === 'lead';

  async function handleDrop(columnKey: string) {
    if (!canDrop || dragId === null) return;
    const user = users.find((u) => u.id === dragId);
    if (!user) {
      setDragId(null);
      setDropTarget(null);
      return;
    }

    let payload: Record<string, unknown> | null = null;
    if (groupBy === 'department') {
      const newDept = columnKey === '__none' ? null : columnKey;
      if (user.department === newDept) {
        setDragId(null);
        setDropTarget(null);
        return;
      }
      payload = { department: newDept };
    } else if (groupBy === 'lead') {
      if (user.role !== 'designer') {
        setDragId(null);
        setDropTarget(null);
        return;
      }
      const newLeadId =
        columnKey === '__none' ? null : Number.isFinite(Number(columnKey)) ? Number(columnKey) : null;
      if (user.leadId === newLeadId) {
        setDragId(null);
        setDropTarget(null);
        return;
      }
      payload = { leadId: newLeadId };
    }

    if (!payload) return;
    setMoving(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Ошибка: ${j.error ?? 'не сохранилось'}`);
        return;
      }
      router.refresh();
    } finally {
      setMoving(false);
      setDragId(null);
      setDropTarget(null);
    }
  }

  return (
    <div>
      <div ref={scrollRef} className="overflow-x-auto pb-2 -mx-2 px-2 scroll-smooth">
        <div className="flex gap-3 min-w-max">
        {columns.map((col) => (
          <div
            key={col.key}
            onDragOver={(e) => {
              if (!canDrop) return;
              e.preventDefault();
              setDropTarget(col.key);
            }}
            onDragLeave={() => {
              if (dropTarget === col.key) setDropTarget(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(col.key);
            }}
            className={`w-[280px] shrink-0 rounded-card transition-all duration-150 ${
              canDrop && dropTarget === col.key
                ? 'bg-sky/10 ring-2 ring-sky'
                : 'bg-cloud/40'
            }`}
          >
            <div className="px-3.5 pt-3 pb-2 flex items-baseline justify-between">
              <span className="text-[11px]  font-medium text-stone">
                {col.label}
              </span>
              <span className="text-xs text-ash font-medium">{col.users.length}</span>
            </div>
            <div className="px-2 pb-2 space-y-1.5 min-h-[60px]">
              {col.users.map((u) => (
                <div
                  key={u.id}
                  draggable={canDrop && !moving}
                  onDragStart={() => setDragId(u.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setDropTarget(null);
                  }}
                  onClick={() => onCardClick(u)}
                  className={`bg-snow border border-cloud rounded-[10px] px-3 py-2.5 shadow-soft hover:shadow-soft-md transition-all duration-150 ${
                    !u.active ? 'opacity-50' : ''
                  } ${dragId === u.id ? 'opacity-40' : ''}`}
                  style={{ cursor: canDrop ? 'grab' : 'pointer' }}
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar name={u.fullName} avatarUrl={u.avatarUrl} size={28} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate leading-tight">
                        {u.fullName}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] mt-1 flex-wrap">
                        <span
                          className={`px-1.5 py-0.5 rounded-pill font-medium ${ROLE_TONE[u.role] ?? ROLE_TONE.designer}`}
                        >
                          {ROLE_LABEL[u.role] ?? u.role}
                        </span>
                        {u.build && (
                          <span className="chip-build">
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: buildColor(u.build.code) }}
                            />
                            {u.build.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {col.users.length === 0 && (
                <div className="text-xs text-ash italic px-2 py-3 text-center">Пусто</div>
              )}
            </div>
          </div>
        ))}
        </div>
      </div>

      {/* Scroll arrows под доской — для Windows-пользователей без trackpad-жестов */}
      <div className="flex items-center justify-between gap-3 mt-3 px-2">
        {!canDrop ? (
          <div className="text-xs text-ash italic">
            В этом виде drag-and-drop отключён — грейды не меняются вручную.
          </div>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={() => scrollBy(-340)}
            aria-label="Прокрутить влево"
            className="w-8 h-8 rounded-pill border border-cloud bg-snow text-stone hover:text-ink hover:border-ash flex items-center justify-center transition-colors"
          >
            <ChevronDownIcon className="w-4 h-4 rotate-90" />
          </button>
          <button
            onClick={() => scrollBy(340)}
            aria-label="Прокрутить вправо"
            className="w-8 h-8 rounded-pill border border-cloud bg-snow text-stone hover:text-ink hover:border-ash flex items-center justify-center transition-colors"
          >
            <ChevronDownIcon className="w-4 h-4 -rotate-90" />
          </button>
        </div>
      </div>
    </div>
  );
}
