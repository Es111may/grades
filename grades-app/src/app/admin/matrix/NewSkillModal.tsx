'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CloseIcon } from '@/components/icons';

type Build = { id: number; code: string; name: string };
type Group = {
  id: number;
  name: string;
  taxonomyCode: string;
  taxonomyName: string;
};
type Taxonomy = { id: number; code: string; name: string };

const NEW_GROUP_VALUE = '__new__';

const buildColor = (code: string) =>
  code === 'creator' ? '#00ca48' : code === 'visioner' ? '#7c3aed' : '#0ea5e9';

export default function NewSkillModal({
  builds,
  groups,
  taxonomies,
  onClose,
}: {
  builds: Build[];
  groups: Group[];
  taxonomies: Taxonomy[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'CORE' | 'SEC'>('CORE');
  const [maxMastery, setMaxMastery] = useState('3');
  const [groupId, setGroupId] = useState<string>('');
  const [newGroupTaxId, setNewGroupTaxId] = useState<string>('');
  const [newGroupName, setNewGroupName] = useState('');
  const isNewGroup = groupId === NEW_GROUP_VALUE;
  const [weights, setWeights] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {};
    for (const b of builds) m[b.id] = '0';
    return m;
  });
  const [masteryTitles, setMasteryTitles] = useState<string[]>(['', '', '']);
  const [saving, setSaving] = useState(false);

  function setMax(val: string) {
    setMaxMastery(val);
    const n = parseInt(val, 10);
    if (Number.isFinite(n) && n > 0) {
      setMasteryTitles((prev) => {
        const next = prev.slice(0, n);
        while (next.length < n) next.push('');
        return next;
      });
    }
  }

  async function submit() {
    const max = parseInt(maxMastery, 10);
    if (!name.trim() || !groupId || !max || max < 1) {
      alert('Заполни имя, группу и максимальный уровень мастерства');
      return;
    }

    let groupPayload: { groupId?: number; newGroup?: { taxonomyId: number; name: string } };
    if (isNewGroup) {
      if (!newGroupTaxId || !newGroupName.trim()) {
        alert('Для новой группы укажи таксономию и название');
        return;
      }
      groupPayload = {
        newGroup: {
          taxonomyId: parseInt(newGroupTaxId, 10),
          name: newGroupName.trim(),
        },
      };
    } else {
      groupPayload = { groupId: parseInt(groupId, 10) };
    }

    const weightsPayload: Record<string, number> = {};
    for (const [bidStr, val] of Object.entries(weights)) {
      const w = Number(val);
      if (!Number.isFinite(w) || w < 0) {
        alert(`Неверный вес для билда ${bidStr}`);
        return;
      }
      weightsPayload[bidStr] = w;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          type,
          maxMasteryLevel: max,
          ...groupPayload,
          weights: weightsPayload,
          masteryTitles,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Ошибка: ${j.error ?? 'не получилось создать'}`);
        return;
      }
      router.refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  // Group dropdown grouped by taxonomy
  const groupsByTax = new Map<string, Group[]>();
  for (const g of groups) {
    if (!groupsByTax.has(g.taxonomyCode)) groupsByTax.set(g.taxonomyCode, []);
    groupsByTax.get(g.taxonomyCode)!.push(g);
  }

  return (
    <div
      className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] z-50 flex items-start justify-center pt-12 pb-12 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-snow rounded-modal shadow-soft-lg w-[680px] max-w-full mx-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-7 pt-6 pb-3 flex items-baseline justify-between border-b border-cloud">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Новый навык
          </h2>
          <button
            onClick={onClose}
            className="text-stone hover:text-ink w-8 h-8 flex items-center justify-center rounded-pill hover:bg-cloud/50 transition-colors"
            aria-label="Закрыть"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-8 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="text-xs  text-stone block mb-1.5">
              Название
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="например: Анимация интерфейсов"
              className="input"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs  text-stone block mb-1.5">
              Описание
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="курсивная подсказка к скиллу"
              rows={2}
              className="input"
            />
          </div>

          {/* Group + Type + maxMastery */}
          <div className="grid grid-cols-[1fr_140px_140px] gap-3">
            <div>
              <label className="text-xs  text-stone block mb-1.5">
                Группа
              </label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="input"
              >
                <option value="">Выбери группу…</option>
                <option value={NEW_GROUP_VALUE}>+ Новая группа…</option>
                {Array.from(groupsByTax.entries()).map(([taxCode, list]) => (
                  <optgroup key={taxCode} label={taxCode}>
                    {list.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs  text-stone block mb-1.5">
                Тип
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'CORE' | 'SEC')}
                className="input"
              >
                <option value="CORE">CORE</option>
                <option value="SEC">SEC</option>
              </select>
            </div>
            <div>
              <label className="text-xs  text-stone block mb-1.5">
                Уровней
              </label>
              <input
                type="number"
                min={1}
                max={5}
                value={maxMastery}
                onChange={(e) => setMax(e.target.value)}
                className="input"
              />
            </div>
          </div>

          {/* New group inputs */}
          {isNewGroup && (
            <div className="bg-canvas border border-lime/40 rounded-card p-4 grid grid-cols-[160px_1fr] gap-3">
              <div>
                <label className="text-xs font-medium text-stone block mb-1.5">
                  Таксономия
                </label>
                <select
                  value={newGroupTaxId}
                  onChange={(e) => setNewGroupTaxId(e.target.value)}
                  className="input"
                >
                  <option value="">Выбери</option>
                  {taxonomies.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-stone block mb-1.5">
                  Имя новой группы
                </label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="например: Анимация"
                  className="input"
                />
              </div>
            </div>
          )}

          {/* Weights */}
          <div>
            <label className="text-xs font-medium text-stone block mb-2">
              Вес для каждого билда
            </label>
            <div className="grid grid-cols-3 gap-2">
              {builds.map((b) => (
                <div key={b.id} className="card px-3.5 py-3 flex items-center gap-3">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: buildColor(b.code) }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px]  text-stone">
                      {b.name}
                    </div>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={weights[b.id] ?? '0'}
                      onChange={(e) =>
                        setWeights((w) => ({ ...w, [b.id]: e.target.value }))
                      }
                      className="font-display text-xl font-semibold bg-transparent w-full
                                 border-b border-transparent hover:border-cloud
                                 focus:border-sky focus:outline-none transition-colors"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mastery titles */}
          <div>
            <label className="text-xs font-medium text-stone block mb-1">
              Названия уровней мастерства
              <span className="text-ash font-normal"> · опционально</span>
            </label>
            <p className="text-xs text-stone mb-3 leading-relaxed">
              Можно оставить пустыми — заполнишь тексты критериев потом, в редакторе скилла.
            </p>
            <div className="space-y-1.5">
              {masteryTitles.map((title, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs  text-stone w-20 shrink-0">
                    Уровень {i + 1}
                  </span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => {
                      const val = e.target.value;
                      setMasteryTitles((prev) => {
                        const next = [...prev];
                        next[i] = val;
                        return next;
                      });
                    }}
                    placeholder="например: Базовое освоение"
                    className="input input-sm flex-1"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-7 py-4 border-t border-cloud flex items-center justify-end gap-2 bg-canvas/40 rounded-b-modal">
          <button onClick={onClose} disabled={saving} className="btn-ghost btn-sm">
            Отмена
          </button>
          <button onClick={submit} disabled={saving} className="btn-accent btn-sm">
            {saving ? 'Создаю…' : 'Создать навык'}
          </button>
        </div>
      </div>
    </div>
  );
}
