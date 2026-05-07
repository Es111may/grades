'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import NewSkillModal from './NewSkillModal';

type Group = {
  id: number;
  name: string;
  taxonomyCode: string;
  taxonomyName: string;
};
type Taxonomy = { id: number; code: string; name: string };

type Build = { id: number; code: string; name: string };
type Skill = {
  id: number;
  name: string;
  description: string;
  type: string;
  maxMasteryLevel: number;
  active: boolean;
  taxonomyCode: string;
  taxonomyName: string;
  groupName: string;
  weights: Record<number, number>;
};

const TAXONOMY_ORDER = ['UI', 'UX', 'PRD', 'IND', 'RES'];

const buildColor = (code: string) =>
  code === 'creator' ? '#ade900' : code === 'visioner' ? '#7c3aed' : '#0ea5e9';

export default function MatrixClient({
  builds,
  skills,
  matrixNumber,
  groups,
  taxonomies,
}: {
  builds: Build[];
  skills: Skill[];
  matrixNumber: number;
  groups: Group[];
  taxonomies: Taxonomy[];
}) {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return skills.filter((s) => {
      if (!showArchived && !s.active) return false;
      if (showArchived && s.active) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.groupName.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [skills, showArchived, search]);

  // Group filtered → tax → group
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, Skill[]>>();
    for (const s of filtered) {
      if (!map.has(s.taxonomyCode)) map.set(s.taxonomyCode, new Map());
      const taxMap = map.get(s.taxonomyCode)!;
      if (!taxMap.has(s.groupName)) taxMap.set(s.groupName, []);
      taxMap.get(s.groupName)!.push(s);
    }
    return map;
  }, [filtered]);

  // Build totals — сумма весов по билду (sanity-check: должно быть осмысленно)
  const buildTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    const active = skills.filter((s) => s.active);
    for (const b of builds) {
      totals[b.id] = active.reduce((sum, s) => sum + (s.weights[b.id] ?? 0), 0);
    }
    return totals;
  }, [skills, builds]);

  async function saveRow(skillId: number, payload: any) {
    setSavingId(skillId);
    try {
      const res = await fetch(`/api/skills/${skillId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Ошибка: ${j.error ?? 'не сохранилось'}`);
        return false;
      }
      router.refresh();
      return true;
    } catch (e) {
      alert(`Ошибка: ${(e as Error).message}`);
      return false;
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="max-w-[1400px] mx-auto px-8 pt-12 pb-16">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-stone mb-2">
          Матрица скиллов · версия {matrixNumber}
        </div>
        <h1 className="font-display text-5xl font-light tracking-tight mb-3">Скиллы</h1>
        <p className="text-stone leading-relaxed max-w-2xl">
          {skills.filter((s) => s.active).length} активных навыков · {skills.length} всего.
          Редактируй имя и веса для каждого билда. Изменения применяются к будущим оценкам;
          уже опубликованные используют свой снапшот.
        </p>
      </div>

      {/* Build totals */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {builds.map((b) => (
          <div
            key={b.id}
            className="bg-white border border-cloud rounded-card px-5 py-4 shadow-soft"
          >
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-stone mb-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: buildColor(b.code) }}
              />
              {b.name}
            </div>
            <div className="font-display text-2xl">
              {buildTotals[b.id]?.toFixed(0) ?? 0} <span className="text-sm text-stone">сумма весов</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию / группе…"
          className="flex-1 bg-white border border-cloud rounded-pill px-5 py-2.5 text-sm focus:outline-none focus:border-stone"
        />
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={`text-xs px-4 py-2.5 rounded-pill border ${
            showArchived
              ? 'bg-canvas border-ash text-ink'
              : 'bg-white border-cloud text-stone'
          }`}
        >
          {showArchived ? 'Архивные' : 'Активные'}
        </button>
        <button
          onClick={() => setShowNewModal(true)}
          className="text-xs px-4 py-2.5 rounded-pill bg-lime border border-lime font-medium hover:brightness-95"
        >
          + Новый навык
        </button>
      </div>

      {showNewModal && (
        <NewSkillModal
          builds={builds}
          groups={groups}
          taxonomies={taxonomies}
          onClose={() => setShowNewModal(false)}
        />
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-cloud rounded-card p-10 text-center shadow-soft">
          <p className="text-stone">Ничего не найдено.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {TAXONOMY_ORDER.filter((c) => grouped.has(c)).map((code) => {
            const taxMap = grouped.get(code)!;
            const taxName =
              filtered.find((s) => s.taxonomyCode === code)?.taxonomyName ?? code;
            return (
              <div key={code}>
                <h2 className="font-display text-2xl tracking-tight mb-4">{taxName}</h2>
                <div className="space-y-4">
                  {Array.from(taxMap.entries()).map(([groupName, skills]) => (
                    <div
                      key={groupName}
                      className="bg-white border border-cloud rounded-card shadow-soft overflow-hidden"
                    >
                      <div className="px-6 py-3 border-b border-cloud bg-canvas">
                        <div className="text-xs uppercase tracking-widest text-stone">
                          {groupName}
                        </div>
                      </div>
                      <table className="w-full">
                        <thead>
                          <tr className="text-xs uppercase tracking-widest text-stone border-b border-cloud">
                            <th className="text-left px-6 py-2 font-medium w-[40%]">Навык</th>
                            <th className="text-center px-3 py-2 font-medium w-16">Тип</th>
                            <th className="text-center px-3 py-2 font-medium w-12">Max</th>
                            {builds.map((b) => (
                              <th key={b.id} className="text-center px-3 py-2 font-medium">
                                <span className="flex items-center justify-center gap-1">
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ background: buildColor(b.code) }}
                                  />
                                  {b.name}
                                </span>
                              </th>
                            ))}
                            <th className="text-right px-6 py-2 font-medium w-32"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {skills.map((s) => (
                            <SkillRow
                              key={s.id}
                              skill={s}
                              builds={builds}
                              isEditing={editingId === s.id}
                              isSaving={savingId === s.id}
                              onEdit={() => setEditingId(s.id)}
                              onCancel={() => setEditingId(null)}
                              onSave={async (payload) => {
                                const ok = await saveRow(s.id, payload);
                                if (ok) setEditingId(null);
                              }}
                              onToggleActive={() =>
                                saveRow(s.id, { active: !s.active })
                              }
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function SkillRow({
  skill,
  builds,
  isEditing,
  isSaving,
  onEdit,
  onCancel,
  onSave,
  onToggleActive,
}: {
  skill: Skill;
  builds: Build[];
  isEditing: boolean;
  isSaving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (payload: any) => void;
  onToggleActive: () => void;
}) {
  const [name, setName] = useState(skill.name);
  const [type, setType] = useState(skill.type);
  const [weights, setWeights] = useState<Record<number, string>>(() => {
    const w: Record<number, string> = {};
    for (const b of builds) w[b.id] = String(skill.weights[b.id] ?? 0);
    return w;
  });

  function reset() {
    setName(skill.name);
    setType(skill.type);
    const w: Record<number, string> = {};
    for (const b of builds) w[b.id] = String(skill.weights[b.id] ?? 0);
    setWeights(w);
    onCancel();
  }

  function submit() {
    const numericWeights: Record<string, number> = {};
    for (const [k, v] of Object.entries(weights)) {
      const n = parseFloat(v);
      numericWeights[k] = isNaN(n) ? 0 : n;
    }
    onSave({ name: name.trim(), type, weights: numericWeights });
  }

  if (!isEditing) {
    return (
      <tr className={`border-b border-cloud last:border-0 ${!skill.active ? 'opacity-50' : ''}`}>
        <td className="px-6 py-3">
          <div className="text-sm">{skill.name}</div>
        </td>
        <td className="text-center px-3 py-3">
          <span
            className={`text-xs px-2 py-0.5 rounded-pill ${
              skill.type === 'CORE'
                ? 'bg-lime-light text-graphite border border-lime/30'
                : 'bg-canvas text-stone border border-cloud'
            }`}
          >
            {skill.type}
          </span>
        </td>
        <td className="text-center px-3 py-3 text-sm text-stone">{skill.maxMasteryLevel}</td>
        {builds.map((b) => (
          <td key={b.id} className="text-center px-3 py-3 text-sm">
            {skill.weights[b.id] ?? 0}
          </td>
        ))}
        <td className="text-right px-6 py-3">
          <button onClick={onEdit} className="text-xs text-stone hover:text-ink mr-3">
            Изменить
          </button>
          <button
            onClick={onToggleActive}
            disabled={isSaving}
            className="text-xs text-stone hover:text-sunset disabled:opacity-50"
            title={skill.active ? 'Архивировать' : 'Восстановить'}
          >
            {skill.active ? 'Архив' : 'Восст.'}
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-cloud last:border-0 bg-canvas">
      <td className="px-6 py-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-white border border-cloud rounded px-3 py-1.5 text-sm focus:outline-none focus:border-stone"
        />
      </td>
      <td className="text-center px-3 py-3">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="bg-white border border-cloud rounded px-2 py-1 text-xs"
        >
          <option value="CORE">CORE</option>
          <option value="SEC">SEC</option>
        </select>
      </td>
      <td className="text-center px-3 py-3 text-sm text-stone">{skill.maxMasteryLevel}</td>
      {builds.map((b) => (
        <td key={b.id} className="text-center px-3 py-3">
          <input
            type="number"
            step="0.5"
            min="0"
            value={weights[b.id] ?? ''}
            onChange={(e) => setWeights((w) => ({ ...w, [b.id]: e.target.value }))}
            className="w-16 bg-white border border-cloud rounded px-2 py-1 text-sm text-center focus:outline-none focus:border-stone"
          />
        </td>
      ))}
      <td className="text-right px-6 py-3">
        <button
          onClick={submit}
          disabled={isSaving}
          className="text-xs bg-lime border border-lime rounded-pill px-3 py-1 mr-2 hover:brightness-95 disabled:opacity-50"
        >
          {isSaving ? '…' : 'Сохранить'}
        </button>
        <button
          onClick={reset}
          disabled={isSaving}
          className="text-xs text-stone hover:text-ink"
        >
          Отмена
        </button>
      </td>
    </tr>
  );
}
