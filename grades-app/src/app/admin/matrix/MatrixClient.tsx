'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import NewSkillModal from './NewSkillModal';
import SearchInput from '@/components/SearchInput';
import MasteryEditorModal from './MasteryEditorModal';

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
  masteries: { level: number; title: string; criteria: string }[];
};

const TAXONOMY_ORDER = ['UI', 'UX', 'PRD', 'IND', 'RES'];

const buildColor = (code: string) =>
  code === 'creator' ? '#00ca48' : code === 'visioner' ? '#7c3aed' : '#0ea5e9';

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
  const [editingMasteries, setEditingMasteries] = useState<Skill | null>(null);

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
    <main className="max-w-[1240px] mx-auto px-8 pt-[164px] pb-16">
      <div className="relative text-center mb-[164px] animate-fade-up title-halo">
        <h1 className="font-display text-[64px] leading-none font-medium tracking-[-0.035em]">
          Скиллы
        </h1>
        <button
          onClick={() => setShowNewModal(true)}
          className="btn-accent shadow-[0_0_24px_rgb(var(--lime-glow-rgb)_/_0.18)]
                     absolute right-0 top-1/2 -translate-y-1/2"
        >
          Новый навык
        </button>
      </div>

      {/* Build totals */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {builds.map((b) => (
          <div key={b.id} className="card px-5 py-4">
            <div className="flex items-center gap-2 text-[11px]  text-stone mb-1">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: buildColor(b.code) }}
              />
              {b.name}
            </div>
            <div className="font-display text-2xl font-medium tracking-tight">
              {buildTotals[b.id]?.toFixed(0) ?? 0}
              <span className="text-sm text-stone font-normal ml-1.5">сумма весов</span>
            </div>
          </div>
        ))}
      </div>

      {/* Тулбар: переключатель состояния + поиск */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="segmented">
          <button
            onClick={() => setShowArchived(false)}
            className={`segmented-item ${!showArchived ? 'segmented-item-active' : ''}`}
          >
            Активные
          </button>
          <button
            onClick={() => setShowArchived(true)}
            className={`segmented-item ${showArchived ? 'segmented-item-active' : ''}`}
          >
            Архивные
          </button>
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Поиск по названию или группе"
          className="flex-1 min-w-[220px]"
        />
      </div>

      {showNewModal && (
        <NewSkillModal
          builds={builds}
          groups={groups}
          taxonomies={taxonomies}
          onClose={() => setShowNewModal(false)}
        />
      )}
      {editingMasteries && (
        <MasteryEditorModal
          skillId={editingMasteries.id}
          skillName={editingMasteries.name}
          initialLevels={editingMasteries.masteries}
          onClose={() => setEditingMasteries(null)}
        />
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-snow border border-cloud rounded-card p-10 text-center shadow-soft">
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
                      className="bg-snow border border-cloud rounded-card shadow-soft overflow-hidden"
                    >
                      <div className="px-6 py-3 border-b border-cloud bg-canvas">
                        <div className="text-xs  text-stone">
                          {groupName}
                        </div>
                      </div>
                      <table className="w-full">
                        <thead>
                          <tr className="text-xs  text-stone border-b border-cloud">
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
                              onEditMasteries={() => setEditingMasteries(s)}
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
  onEditMasteries,
}: {
  skill: Skill;
  builds: Build[];
  isEditing: boolean;
  isSaving: boolean;
  onEdit: () => void;
  onEditMasteries: () => void;
  onCancel: () => void;
  onSave: (payload: any) => void;
  onToggleActive: () => void;
}) {
  const [name, setName] = useState(skill.name);
  const [description, setDescription] = useState(skill.description);
  const [type, setType] = useState(skill.type);
  const [weights, setWeights] = useState<Record<number, string>>(() => {
    const w: Record<number, string> = {};
    for (const b of builds) w[b.id] = String(skill.weights[b.id] ?? 0);
    return w;
  });

  function reset() {
    setName(skill.name);
    setDescription(skill.description);
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
    onSave({
      name: name.trim(),
      description: description.trim(),
      type,
      weights: numericWeights,
    });
  }

  if (!isEditing) {
    return (
      <tr className={`border-b border-cloud last:border-0 ${!skill.active ? 'opacity-50' : ''}`}>
        <td className="px-6 py-3">
          <div className="text-sm">{skill.name}</div>
          {skill.description && (
            <div className="text-xs text-stone italic mt-0.5 line-clamp-2">
              {skill.description}
            </div>
          )}
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
        <td className="text-right px-6 py-3 whitespace-nowrap">
          <button onClick={onEdit} className="btn-ghost btn-sm">
            Изменить
          </button>
          <button onClick={onEditMasteries} className="btn-ghost btn-sm ml-1">
            Уровни
          </button>
          <button
            onClick={onToggleActive}
            disabled={isSaving}
            className={
              skill.active
                ? 'btn-ghost-danger btn-sm ml-1'
                : 'btn-ghost btn-sm ml-1'
            }
            title={skill.active ? 'Архивировать' : 'Восстановить'}
          >
            {skill.active ? 'В архив' : 'Вернуть'}
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
          placeholder="Название"
          className="input input-sm"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Описание — курсивная подсказка"
          rows={2}
          className="input input-sm italic mt-1.5"
        />
      </td>
      <td className="text-center px-3 py-3">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="input input-sm w-auto"
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
            className="input input-sm w-20 text-center"
          />
        </td>
      ))}
      <td className="text-right px-6 py-3 whitespace-nowrap">
        <button onClick={submit} disabled={isSaving} className="btn-accent btn-sm">
          {isSaving ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button onClick={reset} disabled={isSaving} className="btn-ghost btn-sm ml-1">
          Отмена
        </button>
      </td>
    </tr>
  );
}
