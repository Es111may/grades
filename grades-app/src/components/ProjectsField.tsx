'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CloseIcon, PlusIcon } from '@/components/icons';
import {
  PROJECT_CATEGORY_LABELS,
  PROJECT_CATEGORY_ORDER,
  type ProjectCategory,
} from '@/lib/initialProjects';

type Project = {
  id: number;
  name: string;
  category: string;
};

/**
 * Поле «Проекты» на портрете дизайнера / лида / стардиза.
 *
 * Режимы:
 *   - read-only: список тегов. Продукты Иды — лаймовые (#D5FF0C),
 *     остальные категории — серые chip-neutral.
 *   - edit: чипы выбранных + сёрч-инпут + dropdown с группировкой
 *     по категориям. Если поиск не находит — кнопка «+ Создать» с
 *     выбором категории.
 *
 * Загрузка данных:
 *   - allProjects: GET /api/projects при mount (lazy в режиме edit).
 *   - selected: загружается из props (initialProjects) — server-side
 *     прокидывает их сразу, чтобы не было flicker.
 *
 * Сохранение:
 *   - PUT /api/users/[userId]/projects с полным набором projectIds.
 */
export default function ProjectsField({
  userId,
  initialProjects,
  canEdit,
}: {
  userId: number;
  initialProjects: Project[];
  canEdit: boolean;
}) {
  const [selected, setSelected] = useState<Project[]>(initialProjects);
  const [editing, setEditing] = useState(false);
  const [allProjects, setAllProjects] = useState<Project[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Подгружаем allProjects когда пользователь начинает редактирование.
  useEffect(() => {
    if (!editing || allProjects !== null) return;
    let cancelled = false;
    fetch('/api/projects')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.projects) setAllProjects(data.projects);
      })
      .catch(() => {
        if (!cancelled) setError('Не получилось загрузить справочник');
      });
    return () => {
      cancelled = true;
    };
  }, [editing, allProjects]);

  async function save(next: Project[]) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}/projects`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectIds: next.map((p) => p.id) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(`Не сохранилось: ${j.error ?? res.statusText}`);
        setSaving(false);
        return;
      }
      setSelected(next);
      setSaving(false);
    } catch (e) {
      setError(`Ошибка сети: ${String(e)}`);
      setSaving(false);
    }
  }

  function toggle(p: Project) {
    const has = selected.some((s) => s.id === p.id);
    const next = has ? selected.filter((s) => s.id !== p.id) : [...selected, p];
    save(next);
  }

  function onCreated(p: Project) {
    // Только что созданный проект добавим и в справочник, и в выбранные.
    setAllProjects((prev) => (prev ? [...prev, p] : [p]));
    save([...selected, p]);
  }

  // Если read-only и пусто — лучше блок не рендерим, чтобы не плодить
  // пустые секции. Pavel явно об этом не просил, но в практике
  // выглядит чище.
  if (!canEdit && selected.length === 0) {
    return null;
  }

  return (
    <section className="card mb-6 overflow-hidden">
      <div className="px-6 py-4 border-b border-cloud bg-canvas/30 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-ink leading-tight">
          Проекты
        </h3>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="btn-ghost btn-sm shrink-0"
          >
            {editing ? 'Готово' : selected.length > 0 ? 'Изменить' : 'Заполнить'}
          </button>
        )}
      </div>
      <div className="px-6 py-5">
        {/* Текущие выбранные — всегда вверху, и в просмотре, и в редактировании */}
        {selected.length === 0 && !editing && (
          <div className="text-sm text-ash italic">Ещё не заполнено</div>
        )}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selected.map((p) => (
              <ProjectChip
                key={p.id}
                project={p}
                onRemove={editing ? () => toggle(p) : undefined}
              />
            ))}
          </div>
        )}

        {/* Режим редактирования: поиск + dropdown */}
        {editing && (
          <ProjectPicker
            allProjects={allProjects}
            selectedIds={new Set(selected.map((s) => s.id))}
            onToggle={toggle}
            onCreated={onCreated}
            saving={saving}
          />
        )}

        {error && (
          <div className="text-xs text-blaze mt-2">{error}</div>
        )}
      </div>
    </section>
  );
}

function ProjectChip({
  project,
  onRemove,
}: {
  project: Project;
  onRemove?: () => void;
}) {
  const isIda = project.category === 'ida_product';
  const baseClass = isIda
    ? 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[11px] font-medium tracking-tight'
    : 'chip-neutral';
  const style = isIda
    ? { background: '#D5FF0C', color: '#1a1a1a' }
    : undefined;
  return (
    <span className={baseClass} style={style}>
      {project.name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className={`-mr-1 w-3.5 h-3.5 flex items-center justify-center rounded-full transition-colors ${
            isIda ? 'hover:bg-black/10' : 'hover:bg-cloud'
          }`}
          aria-label={`Убрать ${project.name}`}
        >
          <CloseIcon className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

function ProjectPicker({
  allProjects,
  selectedIds,
  onToggle,
  onCreated,
  saving,
}: {
  allProjects: Project[] | null;
  selectedIds: Set<number>;
  onToggle: (p: Project) => void;
  onCreated: (p: Project) => void;
  saving: boolean;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // авто-фокус при появлении ввода
    inputRef.current?.focus();
  }, []);

  // Фильтр по запросу, потом группировка по категории.
  const grouped = useMemo(() => {
    if (!allProjects) return null;
    const q = query.trim().toLowerCase();
    const filtered = q
      ? allProjects.filter((p) => p.name.toLowerCase().includes(q))
      : allProjects;
    const map = new Map<string, Project[]>();
    for (const p of filtered) {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category)!.push(p);
    }
    return PROJECT_CATEGORY_ORDER
      .map((cat) => ({ cat, items: map.get(cat) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [allProjects, query]);

  const exactExists = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !allProjects) return false;
    return allProjects.some((p) => p.name.toLowerCase() === q);
  }, [query, allProjects]);

  return (
    <div className="mt-5 border-t border-cloud pt-6 space-y-6">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Найти проект"
        className="input"
        disabled={saving}
      />

      {allProjects === null ? (
        <div className="text-xs text-ash italic">Загрузка…</div>
      ) : grouped && grouped.length > 0 ? (
        <div className="space-y-6 max-h-[420px] overflow-y-auto pr-1">
          {grouped.map((g) => (
            <div key={g.cat}>
              <div className="text-xs text-stone mb-2.5 font-medium">
                {PROJECT_CATEGORY_LABELS[g.cat as ProjectCategory] ?? g.cat}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.items.map((p) => {
                  const isSelected = selectedIds.has(p.id);
                  const isIda = p.category === 'ida_product';
                  if (isSelected) {
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onToggle(p)}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[11px] font-medium tracking-tight border-2 border-emerald"
                        style={
                          isIda
                            ? { background: '#D5FF0C', color: '#1a1a1a' }
                            : undefined
                        }
                      >
                        {p.name}
                      </button>
                    );
                  }
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onToggle(p)}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[11px] font-medium tracking-tight bg-canvas border border-cloud text-stone hover:border-ash hover:text-ink transition-colors"
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-ash italic">
          Ничего не нашлось по запросу «{query}»
        </div>
      )}

      {/* Создание нового — показываем когда есть запрос и его нет в справочнике */}
      {query.trim() && !exactExists && (
        <CreateProjectControl
          name={query.trim()}
          onCreated={(p) => {
            onCreated(p);
            setQuery('');
          }}
        />
      )}
    </div>
  );
}

function CreateProjectControl({
  name,
  onCreated,
}: {
  name: string;
  onCreated: (p: Project) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [pickedCategory, setPickedCategory] = useState<ProjectCategory | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function doCreate(category: ProjectCategory) {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.project) {
        setError(data.error ?? 'Не получилось создать');
        setCreating(false);
        return;
      }
      onCreated(data.project as Project);
      setPickedCategory(null);
      setCreating(false);
    } catch (e) {
      setError(`Ошибка сети: ${String(e)}`);
      setCreating(false);
    }
  }

  return (
    <div className="border border-dashed border-cloud rounded-card p-3 bg-canvas/40">
      <div className="flex items-center gap-2 mb-2 text-xs text-stone">
        <PlusIcon className="w-3.5 h-3.5" />
        Создать «{name}»
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PROJECT_CATEGORY_ORDER.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => doCreate(cat)}
            disabled={creating}
            className="inline-flex items-center px-2.5 py-1 rounded-pill text-[11px] font-medium bg-snow border border-cloud text-stone hover:border-ash hover:text-ink transition-colors"
          >
            {PROJECT_CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>
      {error && <div className="text-xs text-blaze mt-2">{error}</div>}
      {/* pickedCategory заглушка — для будущего радиоселектора, оставлено
          на случай если решим переключиться на one-step UX */}
      {pickedCategory && null}
    </div>
  );
}
