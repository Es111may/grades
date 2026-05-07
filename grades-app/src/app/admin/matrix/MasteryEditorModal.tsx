'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Mastery = { level: number; title: string; criteria: string };

export default function MasteryEditorModal({
  skillId,
  skillName,
  initialLevels,
  onClose,
}: {
  skillId: number;
  skillName: string;
  initialLevels: Mastery[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [levels, setLevels] = useState<Mastery[]>(() =>
    initialLevels.length > 0
      ? [...initialLevels].sort((a, b) => a.level - b.level)
      : [{ level: 1, title: 'Уровень 1', criteria: '' }],
  );
  const [saving, setSaving] = useState(false);

  function updateLevel(idx: number, patch: Partial<Mastery>) {
    setLevels((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLevel() {
    if (levels.length >= 5) return;
    const nextLevel = (levels[levels.length - 1]?.level ?? 0) + 1;
    setLevels((prev) => [
      ...prev,
      { level: nextLevel, title: `Уровень ${nextLevel}`, criteria: '' },
    ]);
  }

  function removeLevel(idx: number) {
    if (levels.length <= 1) return;
    if (!confirm(`Удалить уровень ${levels[idx].level}?`)) return;
    setLevels((prev) =>
      prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, level: i + 1 })),
    );
  }

  async function save() {
    for (const l of levels) {
      if (!l.title.trim()) {
        alert(`Уровень ${l.level}: заполни название`);
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/skills/${skillId}/masteries`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          levels: levels.map((l) => ({
            level: l.level,
            title: l.title.trim(),
            criteria: l.criteria,
          })),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Ошибка: ${j.error ?? 'не сохранилось'}`);
        return;
      }
      router.refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-graphite/40 z-50 flex items-start justify-center pt-12 pb-12 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white border border-cloud rounded-card shadow-soft-lg w-[760px] max-w-full mx-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 pt-7 pb-3 flex items-baseline justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-stone mb-1">
              Уровни мастерства
            </div>
            <h2 className="font-display text-2xl tracking-tight">{skillName}</h2>
          </div>
          <button onClick={onClose} className="text-stone hover:text-ink text-xl">
            ✕
          </button>
        </div>

        <div className="px-8 py-5 space-y-4">
          {levels.map((l, idx) => (
            <div
              key={l.level}
              className="bg-canvas border border-cloud rounded-card p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="font-display text-lg">Уровень {l.level}</div>
                {levels.length > 1 && (
                  <button
                    onClick={() => removeLevel(idx)}
                    className="text-xs text-stone hover:text-sunset"
                    title="Удалить уровень"
                  >
                    ✕ удалить
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  value={l.title}
                  onChange={(e) => updateLevel(idx, { title: e.target.value })}
                  placeholder="Короткое название уровня"
                  className="w-full bg-white border border-cloud rounded px-3 py-2 text-sm focus:outline-none focus:border-lime"
                />
                <textarea
                  value={l.criteria}
                  onChange={(e) => updateLevel(idx, { criteria: e.target.value })}
                  placeholder="Критерии: что дизайнер умеет делать на этом уровне. Можно несколькими строками."
                  rows={4}
                  className="w-full bg-white border border-cloud rounded px-3 py-2 text-sm focus:outline-none focus:border-lime resize-y"
                />
              </div>
            </div>
          ))}

          {levels.length < 5 && (
            <button
              onClick={addLevel}
              className="text-xs text-stone hover:text-ink underline-offset-4 hover:underline"
            >
              + Добавить уровень
            </button>
          )}
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
            onClick={save}
            disabled={saving}
            className="bg-lime border border-lime rounded-pill px-5 py-2 text-sm font-medium hover:brightness-95 disabled:opacity-50"
          >
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
