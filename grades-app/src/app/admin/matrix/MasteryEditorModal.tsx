'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CloseIcon } from '@/components/icons';

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
      className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] z-50 flex items-start justify-center pt-12 pb-12 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-snow rounded-modal shadow-soft-lg w-[760px] max-w-full mx-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-7 pt-6 pb-4 flex items-baseline justify-between border-b border-cloud">
          <div className="min-w-0">
            <div className="text-[11px]  text-stone mb-0.5">
              Уровни мастерства
            </div>
            <h2 className="font-display text-xl font-semibold tracking-tight truncate">
              {skillName}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="text-stone hover:text-ink w-8 h-8 flex items-center justify-center rounded-pill hover:bg-cloud/50 transition-colors shrink-0"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-7 py-5 space-y-3">
          {levels.map((l, idx) => (
            <div key={l.level} className="bg-canvas border border-cloud rounded-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-display text-sm font-semibold tracking-tight">
                  Уровень {l.level}
                </div>
                {levels.length > 1 && (
                  <button
                    onClick={() => removeLevel(idx)}
                    className="text-xs text-stone hover:text-blaze transition-colors"
                    title="Удалить уровень"
                  >
                    Удалить
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  value={l.title}
                  onChange={(e) => updateLevel(idx, { title: e.target.value })}
                  placeholder="Короткое название уровня"
                  className="input input-sm"
                />
                <textarea
                  value={l.criteria}
                  onChange={(e) => updateLevel(idx, { criteria: e.target.value })}
                  placeholder="Критерии: что дизайнер умеет на этом уровне"
                  rows={4}
                  className="input input-sm"
                />
              </div>
            </div>
          ))}

          {levels.length < 5 && (
            <button onClick={addLevel} className="btn-ghost btn-sm">
              + Добавить уровень
            </button>
          )}
        </div>

        <div className="px-7 py-4 border-t border-cloud flex items-center justify-end gap-2 bg-canvas/40 rounded-b-modal">
          <button onClick={onClose} disabled={saving} className="btn-ghost btn-sm">
            Отмена
          </button>
          <button onClick={save} disabled={saving} className="btn-accent btn-sm">
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
