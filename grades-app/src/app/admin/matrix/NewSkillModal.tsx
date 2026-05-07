'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Build = { id: number; code: string; name: string };
type Group = {
  id: number;
  name: string;
  taxonomyCode: string;
  taxonomyName: string;
};

const buildColor = (code: string) =>
  code === 'creator' ? '#ade900' : code === 'visioner' ? '#7c3aed' : '#0ea5e9';

export default function NewSkillModal({
  builds,
  groups,
  onClose,
}: {
  builds: Build[];
  groups: Group[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'CORE' | 'SEC'>('CORE');
  const [maxMastery, setMaxMastery] = useState('3');
  const [groupId, setGroupId] = useState<string>('');
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
          groupId: parseInt(groupId, 10),
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
      className="fixed inset-0 bg-graphite/40 z-50 flex items-start justify-center pt-12 pb-12 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white border border-cloud rounded-card shadow-soft-lg w-[680px] max-w-full mx-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 pt-7 pb-3 flex items-baseline justify-between">
          <h2 className="font-display text-2xl tracking-tight">Новый навык</h2>
          <button
            onClick={onClose}
            className="text-stone hover:text-ink text-xl"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        <div className="px-8 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="text-xs uppercase tracking-widest text-stone block mb-1.5">
              Название
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="например: Анимация интерфейсов"
              className="w-full bg-canvas border border-cloud rounded px-3 py-2 text-sm focus:outline-none focus:border-lime"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs uppercase tracking-widest text-stone block mb-1.5">
              Описание
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="курсивная подсказка к скиллу"
              rows={2}
              className="w-full bg-canvas border border-cloud rounded px-3 py-2 text-sm focus:outline-none focus:border-lime"
            />
          </div>

          {/* Group + Type + maxMastery */}
          <div className="grid grid-cols-[1fr_140px_140px] gap-3">
            <div>
              <label className="text-xs uppercase tracking-widest text-stone block mb-1.5">
                Группа
              </label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full bg-canvas border border-cloud rounded px-3 py-2 text-sm focus:outline-none focus:border-lime"
              >
                <option value="">Выбери группу…</option>
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
              <label className="text-xs uppercase tracking-widest text-stone block mb-1.5">
                Тип
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'CORE' | 'SEC')}
                className="w-full bg-canvas border border-cloud rounded px-3 py-2 text-sm focus:outline-none focus:border-lime"
              >
                <option value="CORE">CORE</option>
                <option value="SEC">SEC</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-stone block mb-1.5">
                Уровней
              </label>
              <input
                type="number"
                min={1}
                max={5}
                value={maxMastery}
                onChange={(e) => setMax(e.target.value)}
                className="w-full bg-canvas border border-cloud rounded px-3 py-2 text-sm focus:outline-none focus:border-lime"
              />
            </div>
          </div>

          {/* Weights */}
          <div>
            <label className="text-xs uppercase tracking-widest text-stone block mb-1.5">
              Вес для каждого билда
            </label>
            <div className="grid grid-cols-3 gap-3">
              {builds.map((b) => (
                <div
                  key={b.id}
                  className="bg-canvas border border-cloud rounded p-3 flex items-center gap-3"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: buildColor(b.code) }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-stone">{b.name}</div>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={weights[b.id] ?? '0'}
                      onChange={(e) =>
                        setWeights((w) => ({ ...w, [b.id]: e.target.value }))
                      }
                      className="font-display text-xl bg-transparent border-b border-cloud focus:border-lime focus:outline-none w-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mastery titles */}
          <div>
            <label className="text-xs uppercase tracking-widest text-stone block mb-1.5">
              Названия уровней мастерства (опционально)
            </label>
            <p className="text-xs text-ash mb-2">
              Можешь оставить пустыми — заполнить тексты критериев потом, в редакторе
              скилла.
            </p>
            <div className="space-y-1.5">
              {masteryTitles.map((title, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-stone w-16 shrink-0">
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
                    className="flex-1 bg-canvas border border-cloud rounded px-2 py-1 text-sm focus:outline-none focus:border-lime"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-8 py-5 border-t border-cloud flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="text-sm text-stone hover:text-ink"
          >
            Отмена
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="bg-lime border border-lime rounded-pill px-5 py-2 text-sm font-medium hover:brightness-95 disabled:opacity-50"
          >
            {saving ? 'Создаю…' : 'Создать навык'}
          </button>
        </div>
      </div>
    </div>
  );
}
