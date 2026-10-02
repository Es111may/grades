'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Avatar from '@/components/Avatar';
import { ChevronDownIcon } from '@/components/icons';
import { canChangeLead, canEditUser } from '@/lib/permissions';
import { genitiveFirstName } from '@/lib/names';
import { isCommentsLayerOpen, isFromCommentsLayer } from '@/lib/commentsLayer';

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
  lead: 'bg-lime/15 text-lime-dark',
  // Токен violet: в тёмной теме тот же #bf5af2. В светлой фиолетовый текст
  // на фиолетовой подложке — 3,4:1, мелкому тексту мало; текст основным
  // цветом, подложка остаётся фиолетовой (как у .chip-gold).
  stardiz: 'bg-violet/15 text-violet [html[data-theme=light]_&]:text-ink',
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

/** Отложенная передача человека другому лиду — ждёт подтверждения. */
type Handoff = { user: UserRow; newLeadId: number; leadName: string };

/** Нынешние отделы — колонки «Отделов» всегда, в этом порядке. */
const CURRENT_DEPARTMENTS = ['Инхаус', 'Криэйт', 'Импрув'] as const;

/**
 * Неактивные — в конец колонки, серыми (как в лидерборде). Внутри групп
 * порядок прежний: sort стабилен.
 */
function activeFirst<C extends { users: UserRow[] }>(cols: C[]): C[] {
  for (const c of cols) c.users.sort((a, b) => Number(b.active) - Number(a.active));
  return cols;
}

export default function KanbanView({
  users,
  leads,
  groupBy,
  meId,
  meRole,
  onCardClick,
  onMoved,
}: {
  users: UserRow[];
  leads: Lead[];
  groupBy: GroupBy;
  meId: number | null;
  meRole: string;
  onCardClick: (user: UserRow) => void;
  /** PATCH прошёл — строку из ответа сливаем в список (как после модалки). */
  onMoved: (updated: UserRow) => void;
}) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const me = meId !== null ? { id: meId, role: meRole } : null;

  function scrollBy(delta: number) {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  }

  const columns = useMemo(() => {
    if (groupBy === 'department') {
      // Прошлые отделы (Lite, Самолет, Ида.Бид — у ушедших из реестра HR,
      // Phase 23.6a) — своими колонками после нынешних: в «Без отдела» они
      // смешались бы с теми, кому отдел просто не поставили.
      const past = Array.from(
        new Set(
          users
            .map((u) => u.department)
            .filter((d): d is string => !!d && !(CURRENT_DEPARTMENTS as readonly string[]).includes(d)),
        ),
      ).sort((a, b) => a.localeCompare(b, 'ru'));
      const cols: Array<{ key: string; label: string; users: UserRow[] }> = [
        ...CURRENT_DEPARTMENTS.map((d) => ({ key: d, label: d, users: [] as UserRow[] })),
        ...past.map((d) => ({ key: d, label: d, users: [] as UserRow[] })),
        { key: '__none', label: 'Без отдела', users: [] },
      ];
      const byKey = new Map(cols.map((c) => [c.key, c]));
      for (const u of users) {
        const k = u.department && byKey.has(u.department) ? u.department : '__none';
        byKey.get(k)!.users.push(u);
      }
      return activeFirst(cols);
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
      return activeFirst(cols);
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
    return activeFirst(cols);
  }, [users, leads, groupBy]);

  const canDrop = groupBy === 'department' || groupBy === 'lead';

  // Тащить можно только тех, кого вправе править: админ — любого, лид —
  // своих дизайнеров и стардизов. Стардизу и чужие карточки — только клик.
  // Неактивных не тащим: ушедших по отделам и лидам не переносят, поправить
  // отдел можно в «Изменить».
  const canDrag = (u: UserRow) => canDrop && u.active && canEditUser(me, u);
  const dragged = dragId !== null ? users.find((u) => u.id === dragId) ?? null : null;

  // Колонка «Лиды» → id лида; «Без лида» → null.
  const leadIdOf = (columnKey: string): number | null =>
    columnKey === '__none' ? null : Number.isFinite(Number(columnKey)) ? Number(columnKey) : null;

  // Примет ли колонка карточку. В «Лидах» лиду — только колонка другого
  // лида (передача своего человека); «Без лида» — нет. Своя колонка — да,
  // бросок туда ничего не меняет.
  function accepts(columnKey: string): boolean {
    if (!canDrop || !dragged) return false;
    // Прошлые отделы — история: в них не переносят
    if (groupBy === 'department') {
      return columnKey === '__none' || (CURRENT_DEPARTMENTS as readonly string[]).includes(columnKey);
    }
    if (groupBy !== 'lead') return true;
    const newLeadId = leadIdOf(columnKey);
    return newLeadId === dragged.leadId || canChangeLead(me, dragged, newLeadId);
  }

  function resetDrag() {
    setDragId(null);
    setDropTarget(null);
  }

  async function move(user: UserRow, payload: Record<string, unknown>) {
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
      // Раньше тут был router.refresh(), но UsersClient держит список в
      // useState(initialUsers) и новые пропсы не подхватывает — карточка
      // оставалась в старой колонке до перезагрузки. Теперь ответ PATCH
      // сливается в список сразу.
      onMoved(await res.json());
    } finally {
      setMoving(false);
    }
  }

  async function handleDrop(columnKey: string) {
    const user = dragged;
    resetDrag();
    if (!user || !canDrag(user) || !accepts(columnKey)) return;

    if (groupBy === 'department') {
      const newDept = columnKey === '__none' ? null : columnKey;
      if (user.department === newDept) return;
      await move(user, { department: newDept });
    } else if (groupBy === 'lead') {
      if (user.role !== 'designer') return;
      const newLeadId = leadIdOf(columnKey);
      if (user.leadId === newLeadId) return;
      // Лид отдаёт своего человека — после этого не увидит его зарплату и
      // оценки. Необратимо для него самого, поэтому сначала спрашиваем.
      if (meRole !== 'admin' && newLeadId !== null) {
        setHandoff({
          user,
          newLeadId,
          leadName: leads.find((l) => l.id === newLeadId)?.fullName ?? '',
        });
        return;
      }
      await move(user, { leadId: newLeadId });
    }
  }

  return (
    <div data-comment-anchor="team-kanban">
      <div ref={scrollRef} className="overflow-x-auto pb-2 -mx-2 px-2 scroll-smooth">
        <div className="flex gap-3 min-w-max">
        {columns.map((col) => (
          <div
            key={col.key}
            onDragOver={(e) => {
              // Без preventDefault браузер не даст бросить — колонка, куда
              // нельзя, и не подсвечивается
              if (!accepts(col.key)) return;
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
              {/* Счётчик — только активные. Карточки деактивированных
                  продолжаем показывать (приглушённо), но в число они не
                  идут: Pavel — «везде показывать без учёта деактивированных». */}
              <span className="text-xs text-ash font-medium">
                {col.users.filter((u) => u.active).length}
              </span>
            </div>
            <div className="px-2 pb-2 space-y-1.5 min-h-[60px]">
              {col.users.map((u) => {
                const draggable = canDrag(u);
                return (
                  <div
                    key={u.id}
                    draggable={draggable && !moving}
                    // Чужие карточки не перетаскиваются вовсе — без обработчиков
                    onDragStart={draggable ? () => setDragId(u.id) : undefined}
                    onDragEnd={draggable ? resetDrag : undefined}
                    onClick={() => onCardClick(u)}
                    className={`bg-snow border border-cloud rounded-[10px] px-3 py-2.5 shadow-soft hover:shadow-soft-md transition-all duration-150 ${
                      draggable ? 'cursor-grab' : 'cursor-pointer'
                    } ${!u.active ? 'opacity-50' : ''} ${dragId === u.id ? 'opacity-40' : ''}`}
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
                );
              })}
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
        ) : meRole === 'lead' ? (
          <div className="text-xs text-ash italic">Перетащить можно только своих людей</div>
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

      {handoff && (
        <HandoffConfirm
          person={handoff.user.fullName}
          leadName={handoff.leadName}
          busy={moving}
          onCancel={() => setHandoff(null)}
          onConfirm={async () => {
            await move(handoff.user, { leadId: handoff.newLeadId });
            setHandoff(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Подтверждение передачи своего человека другому лиду. Не нативный
 * confirm() — он в некоторых браузерах не отрабатывал; оболочка — как у
 * поп-апа 360 (затемнение, snow, rounded-modal), кнопки btn-sm — как в
 * подтверждениях модалки «Изменить». Escape и клик по фону — отмена.
 */
function HandoffConfirm({
  person,
  leadName,
  busy,
  onCancel,
  onConfirm,
}: {
  person: string;
  leadName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const textId = useId();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Пока в слое комментариев что-то открыто, Escape — его, не отмена передачи
      if (e.key === 'Escape' && !busy && !isCommentsLayerOpen()) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[20vh]">
      <div
        className="absolute inset-0 bg-black/60 animate-fade-in"
        onClick={(e) => {
          if (!busy && !isFromCommentsLayer(e.nativeEvent)) onCancel();
        }}
        aria-hidden
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        className="relative w-full max-w-[420px] bg-snow rounded-modal shadow-soft-lg p-6 animate-scale-in"
      >
        <h2 id={titleId} className="font-display text-xl font-medium tracking-tight">
          Передать другому лиду?
        </h2>
        {/* Имя человека — подлежащим, лид — в родительном: без склонения
            ФИО фраза остаётся грамотной */}
        <p id={textId} className="text-sm text-stone mt-2 leading-relaxed">
          {person} перейдёт в команду {leadName ? genitiveFirstName(leadName) : 'другого лида'}.
          После передачи зарплата и оценки этого человека будут вам недоступны.
        </p>
        <div className="flex justify-end gap-2 mt-5">
          {/* Фокус — на отмене: передачу нельзя отыграть самому */}
          <button type="button" autoFocus onClick={onCancel} disabled={busy} className="btn-ghost btn-sm">
            Отмена
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="btn-primary btn-sm">
            {busy ? 'Передаю…' : 'Передать'}
          </button>
        </div>
      </div>
    </div>
  );
}
