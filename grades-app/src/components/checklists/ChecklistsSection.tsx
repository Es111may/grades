'use client';

/**
 * Секция «ИПР» на портрете — список чек-листов + кнопка «+ Добавить чек-лист».
 *
 * Данные тянутся лениво при первом монтировании компонента: server-side
 * мог бы прокинуть их сразу, но это требовало бы менять все три портрет-page'а
 * (designer/page.tsx, lead/portrait/page.tsx, и lead-review). Ленивое
 * подтягивание проще и не блокирует первый рендер.
 *
 * Каждая карточка — `ChecklistCard`, см. рядом. Эта обёртка только:
 *   - дергает GET и хранит список
 *   - показывает «+ Добавить чек-лист» (если `canCreate`)
 *   - инлайн-редактор нового чек-листа: title + первый пункт
 */

import { useCallback, useEffect, useState } from 'react';
import { PlusIcon, CloseIcon } from '@/components/icons';
import ChecklistCard, { type Checklist } from './ChecklistCard';

export default function ChecklistsSection({
  ownerId,
  /** Мета о текущем пользователе — нужно для расчёта прав на клиенте.
   *  Совпадает с тем что есть в серверной checklistPermissions.ts. */
  me,
  /** Может ли me создавать чек-листы на портрете owner'а. Рассчитано
   *  на сервере и передано в портрет. */
  canCreate,
}: {
  ownerId: number;
  me: { id: number; role: 'admin' | 'lead' | 'stardiz' | 'designer' };
  canCreate: boolean;
}) {
  const [items, setItems] = useState<Checklist[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/users/${ownerId}/checklists`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { checklists: Checklist[] };
      setItems(data.checklists ?? []);
      setLoadError(null);
    } catch (err) {
      setLoadError(String(err));
      setItems([]);
    }
  }, [ownerId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // ============================================================
  // Inline-форма нового чек-листа
  // ============================================================
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newItems, setNewItems] = useState<string[]>(['']);
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setCreating(false);
    setNewTitle('');
    setNewItems(['']);
  }

  async function submitNew() {
    const title = newTitle.trim();
    if (!title) return;
    const items = newItems.map((s) => s.trim()).filter(Boolean);
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${ownerId}/checklists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          items: items.map((text) => ({ text })),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Не получилось создать чек-лист: ${j.error ?? res.statusText}`);
        return;
      }
      const { checklist } = (await res.json()) as { checklist: Checklist };
      setItems((prev) => [...(prev ?? []), checklist]);
      resetForm();
    } finally {
      setSaving(false);
    }
  }

  function updateLocally(updated: Checklist | null, id: number) {
    setItems((prev) => {
      if (!prev) return prev;
      if (updated === null) return prev.filter((c) => c.id !== id);
      return prev.map((c) => (c.id === id ? updated : c));
    });
  }

  // ============================================================
  // Render
  // ============================================================

  // Пока загрузка — рендерим минимальный скелет. Не пугаем пустотой.
  if (items === null) {
    return (
      <section className="card mb-6 overflow-hidden">
        <div className="px-6 py-4 border-b border-cloud bg-canvas/30 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink leading-tight">ИПР</h3>
        </div>
        <div className="px-6 py-5 text-sm text-stone italic">Загрузка…</div>
      </section>
    );
  }

  const hasAny = items.length > 0;

  return (
    <section className="card mb-6 overflow-hidden">
      <div className="px-6 py-4 border-b border-cloud bg-canvas/30 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-ink leading-tight">ИПР</h3>
        {canCreate && !creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="btn-ghost btn-sm shrink-0 inline-flex items-center gap-1.5"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Добавить чек-лист
          </button>
        )}
      </div>

      <div className="px-6 py-5 space-y-4">
        {loadError && (
          <div className="text-xs text-blaze">Ошибка загрузки: {loadError}</div>
        )}

        {!hasAny && !creating && (
          <div className="text-sm text-stone italic">
            {canCreate
              ? 'Чек-листов пока нет. Добавь первый — «Добавить чек-лист» наверху.'
              : 'Чек-листов пока нет.'}
          </div>
        )}

        {items.map((c) => (
          <ChecklistCard
            key={c.id}
            checklist={c}
            me={me}
            owner={{ id: ownerId }}
            onUpdated={(next) => updateLocally(next, c.id)}
            onDeleted={() => updateLocally(null, c.id)}
          />
        ))}

        {creating && (
          <div className="card-hover border-2 border-ink/10 rounded-card p-4 space-y-3">
            <input
              type="text"
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Заголовок чек-листа"
              className="input"
            />
            <div className="space-y-1.5">
              {newItems.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-4 h-4 border border-cloud rounded shrink-0" />
                  <input
                    type="text"
                    value={it}
                    onChange={(e) =>
                      setNewItems((prev) => {
                        const next = [...prev];
                        next[i] = e.target.value;
                        return next;
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        // На Enter — добавить следующий пункт, если есть текст
                        if (it.trim()) {
                          setNewItems((prev) => [...prev, '']);
                        }
                      }
                    }}
                    placeholder="Пункт"
                    className="input input-sm flex-1"
                  />
                  {newItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setNewItems((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      className="text-stone hover:text-blaze transition-colors p-1"
                      aria-label="Удалить пункт"
                    >
                      <CloseIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setNewItems((prev) => [...prev, ''])}
                className="text-xs text-stone hover:text-ink transition-colors mt-1 inline-flex items-center gap-1"
              >
                <PlusIcon className="w-3 h-3" />
                Ещё пункт
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={submitNew}
                disabled={saving || !newTitle.trim()}
                className="btn-accent btn-sm"
              >
                {saving ? 'Сохраняю…' : 'Создать'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="btn-ghost btn-sm"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
