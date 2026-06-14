'use client';

/**
 * Одна карточка чек-листа в стиле Telegram:
 *   - Заголовок (кликом — inline-edit для тех, у кого есть права)
 *   - Badge кто создал (роль + имя)
 *   - Список пунктов с чекбоксами
 *   - inline «+ Добавить пункт» (только для тех, у кого права на структуру)
 *   - меню «⋯» с «Удалить» (только структурное право)
 *
 * Права рассчитываются на клиенте теми же функциями, что на сервере
 * (см. src/lib/checklistPermissions.ts). Сервер проверит ещё раз —
 * клиент только прячет кнопки, чтобы не давать пустых надежд.
 */

import { useEffect, useRef, useState } from 'react';
import {
  canEditChecklist,
  type Role,
} from '@/lib/checklistPermissions';
import { PlusIcon, CloseIcon } from '@/components/icons';

export interface ChecklistItem {
  id: number;
  text: string;
  checked: boolean;
  sortOrder: number;
}

export interface Checklist {
  id: number;
  ownerId: number;
  createdById: number;
  createdByRole: string;
  title: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  items: ChecklistItem[];
  createdBy?: { id: number; fullName: string };
}

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Админ',
  lead: 'Лид',
  stardiz: 'Стардиз',
  designer: 'Дизайнер',
};

export default function ChecklistCard({
  checklist,
  me,
  owner,
  onUpdated,
  onDeleted,
}: {
  checklist: Checklist;
  me: { id: number; role: Role };
  owner: { id: number };
  onUpdated: (next: Checklist) => void;
  onDeleted: () => void;
}) {
  const canEdit = canEditChecklist(me, checklist);

  // Бейдж: «Я» если автор — сам зритель; иначе роль + имя.
  const badgeLabel = (() => {
    if (checklist.createdById === me.id) return 'Я';
    const role = ROLE_LABEL[checklist.createdByRole as Role] ?? checklist.createdByRole;
    const name = checklist.createdBy?.fullName;
    return name ? `${role}: ${name}` : role;
  })();

  // ============================================================
  // Inline-редактирование title
  // ============================================================
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(checklist.title);

  useEffect(() => {
    setTitleDraft(checklist.title);
  }, [checklist.title]);

  async function saveTitle() {
    const next = titleDraft.trim();
    if (!next || next === checklist.title) {
      setEditingTitle(false);
      setTitleDraft(checklist.title);
      return;
    }
    const res = await fetch(`/api/checklists/${checklist.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: next }),
    });
    if (res.ok) {
      const { checklist: fresh } = (await res.json()) as { checklist: Checklist };
      onUpdated(fresh);
    }
    setEditingTitle(false);
  }

  // ============================================================
  // Чекбоксы — мгновенное переключение `checked`
  // ============================================================
  // Локальная карта pendingUpdates — пока летит запрос, показываем UI
  // как уже изменённое (оптимистичный апдейт). На ошибку откатываем.
  const [pending, setPending] = useState<Record<number, boolean>>({});

  async function toggleChecked(itemId: number, next: boolean) {
    setPending((p) => ({ ...p, [itemId]: next }));
    const res = await fetch(`/api/checklist-items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked: next }),
    });
    if (res.ok) {
      // Применяем изменение в основном объекте.
      const updatedItems = checklist.items.map((it) =>
        it.id === itemId ? { ...it, checked: next } : it,
      );
      onUpdated({ ...checklist, items: updatedItems });
    } else {
      // Сервер отказал — снимаем pending, оставляем исходное состояние.
      console.warn('Не удалось переключить чек-бокс', itemId);
    }
    setPending((p) => {
      const { [itemId]: _, ...rest } = p;
      void _;
      return rest;
    });
  }

  // ============================================================
  // Inline «+ Добавить пункт»
  // ============================================================
  const [newItemText, setNewItemText] = useState('');
  const newItemRef = useRef<HTMLInputElement | null>(null);

  async function addItem() {
    const text = newItemText.trim();
    if (!text) return;
    // Отправим PATCH с полным набором items (существующие + новый).
    const items = [
      ...checklist.items.map((it) => ({
        id: it.id,
        text: it.text,
        checked: it.checked,
      })),
      { text },
    ];
    const res = await fetch(`/api/checklists/${checklist.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (res.ok) {
      const { checklist: fresh } = (await res.json()) as { checklist: Checklist };
      onUpdated(fresh);
      setNewItemText('');
      // Возвращаем фокус в инпут — чтобы можно было сразу добавить ещё.
      setTimeout(() => newItemRef.current?.focus(), 0);
    }
  }

  async function removeItem(itemId: number) {
    const items = checklist.items
      .filter((it) => it.id !== itemId)
      .map((it) => ({ id: it.id, text: it.text, checked: it.checked }));
    const res = await fetch(`/api/checklists/${checklist.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (res.ok) {
      const { checklist: fresh } = (await res.json()) as { checklist: Checklist };
      onUpdated(fresh);
    }
  }

  async function deleteChecklist() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      // авто-снимаем через 3 секунды
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    const res = await fetch(`/api/checklists/${checklist.id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      onDeleted();
    }
  }

  const [confirmDelete, setConfirmDelete] = useState(false);

  void owner; // зарезервировано на будущее (drag-and-drop между чек-листами)

  return (
    <div className="border border-cloud rounded-card p-4 bg-snow">
      {/* Header: title + badge + ⋯ */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              type="text"
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveTitle();
                }
                if (e.key === 'Escape') {
                  setEditingTitle(false);
                  setTitleDraft(checklist.title);
                }
              }}
              className="input"
            />
          ) : (
            <h4
              onClick={() => canEdit && setEditingTitle(true)}
              className={`text-sm font-medium text-ink leading-tight ${
                canEdit ? 'cursor-pointer hover:text-stone' : ''
              }`}
            >
              {checklist.title}
            </h4>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="chip-neutral text-[10px]">{badgeLabel}</span>
          {canEdit && (
            <button
              type="button"
              onClick={deleteChecklist}
              className={`btn-ghost btn-sm ${
                confirmDelete ? 'text-blaze' : 'text-stone hover:text-ink'
              }`}
              title={confirmDelete ? 'Точно удалить?' : 'Удалить чек-лист'}
            >
              {confirmDelete ? 'Точно?' : 'Удалить'}
            </button>
          )}
        </div>
      </div>

      {/* Items */}
      <ul className="space-y-1">
        {checklist.items.map((it) => {
          const checked = pending[it.id] ?? it.checked;
          return (
            <li key={it.id} className="flex items-center gap-2.5 group">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => toggleChecked(it.id, e.target.checked)}
                className="w-4 h-4 rounded border-cloud accent-ink focus:ring-ink/30 shrink-0"
              />
              <span
                className={`flex-1 text-sm ${
                  checked ? 'line-through text-ash' : 'text-ink'
                }`}
              >
                {it.text}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => removeItem(it.id)}
                  className="opacity-0 group-hover:opacity-100 text-stone hover:text-blaze transition-opacity p-1"
                  aria-label="Удалить пункт"
                >
                  <CloseIcon className="w-3 h-3" />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/* «+ Добавить пункт» — inline-input */}
      {canEdit && (
        <div className="flex items-center gap-2.5 mt-2">
          <PlusIcon className="w-3.5 h-3.5 text-stone shrink-0" />
          <input
            ref={newItemRef}
            type="text"
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder="Добавить пункт"
            className="flex-1 text-sm bg-transparent placeholder:text-stone outline-none border-b border-transparent focus:border-cloud transition-colors"
          />
        </div>
      )}
    </div>
  );
}
