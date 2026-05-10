'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import SkillCombobox from './SkillCombobox';
import { PlusIcon, CloseIcon } from '@/components/icons';

type Build = { id: number; code: string; name: string };
type Gate = {
  id: number;
  buildId: number;
  buildCode: string;
  skillId: number;
  skillName: string;
  requiredMastery: number;
};
type Grade = {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  xpThresholds: Record<string, number>;
  gates: Gate[];
};

const buildColor = (code: string) =>
  code === 'creator' ? '#00ca48' : code === 'visioner' ? '#7c3aed' : '#0ea5e9';

type Skill = { id: number; name: string; taxonomyCode: string };

export default function GradesClient({
  matrixNumber,
  builds,
  grades,
  skills,
}: {
  matrixNumber: number;
  builds: Build[];
  grades: Grade[];
  skills: Skill[];
}) {
  return (
    <main className="max-w-[1400px] mx-auto px-8 pt-10 pb-16">
      <div className="mb-6">
        <h1 className="font-display text-4xl font-semibold tracking-tight mb-1.5">
          Грейды
        </h1>
        <p className="text-stone max-w-2xl">
          Пороги XP по билдам и обязательные навыки. Изменения применяются к будущим
          оценкам — опубликованные используют свой снапшот.
        </p>
      </div>

      <div className="space-y-3">
        {grades.map((g) => (
          <GradeRow key={g.id} grade={g} builds={builds} skills={skills} />
        ))}
      </div>
    </main>
  );
}

function GradeRow({
  grade,
  builds,
  skills,
}: {
  grade: Grade;
  builds: Build[];
  skills: Skill[];
}) {
  const router = useRouter();
  const [name, setName] = useState(grade.name);
  const [thresholds, setThresholds] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const b of builds) m[b.code] = String(grade.xpThresholds[b.code] ?? 0);
    return m;
  });
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState(false);

  function setThreshold(code: string, val: string) {
    setThresholds((t) => ({ ...t, [code]: val }));
    setEdited(true);
  }

  async function save() {
    const xpThresholds: Record<string, number> = {};
    for (const [code, val] of Object.entries(thresholds)) {
      const n = Number(val);
      if (!Number.isFinite(n) || n < 0) {
        alert(`Неверный порог для ${code}`);
        return;
      }
      xpThresholds[code] = Math.round(n);
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/grades/${grade.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, xpThresholds }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Ошибка: ${j.error ?? 'не сохранилось'}`);
        return;
      }
      setEdited(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  // Group gates by build
  const gatesByBuild = new Map<number, Gate[]>();
  for (const gate of grade.gates) {
    if (!gatesByBuild.has(gate.buildId)) gatesByBuild.set(gate.buildId, []);
    gatesByBuild.get(gate.buildId)!.push(gate);
  }

  return (
    <div className="card p-6">
      <div className="grid grid-cols-[200px_1fr_auto] gap-6 items-center">
        {/* Name */}
        <div>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setEdited(true);
            }}
            className="font-display text-xl font-semibold tracking-tight bg-transparent w-full
                       border-b border-transparent hover:border-cloud focus:border-sky
                       focus:outline-none transition-colors"
          />
          <div className="text-[11px] text-stone mt-1 font-mono">{grade.code}</div>
        </div>

        {/* Thresholds per build */}
        <div className="grid grid-cols-3 gap-4">
          {builds.map((b) => (
            <div key={b.id}>
              <div className="flex items-center gap-1.5 text-[11px]  text-stone mb-1">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: buildColor(b.code) }}
                />
                {b.name}
              </div>
              <div className="flex items-baseline gap-1.5">
                <input
                  type="number"
                  min={0}
                  value={thresholds[b.code] ?? ''}
                  onChange={(e) => setThreshold(b.code, e.target.value)}
                  className="font-display text-2xl font-semibold bg-transparent w-20
                             border-b border-cloud focus:border-sky focus:outline-none
                             transition-colors"
                />
                <span className="text-[11px]  text-stone">XP</span>
              </div>
            </div>
          ))}
        </div>

        {/* Save */}
        <button
          onClick={save}
          disabled={!edited || saving}
          className="btn-accent btn-sm"
        >
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </div>

      {/* Gates editor */}
      <div className="mt-5 pt-5 border-t border-cloud">
        <div className="text-xs  text-stone mb-3">
          Обязательные навыки (гейты)
        </div>
        <div className="grid grid-cols-3 gap-6">
          {builds.map((b) => {
            const list = gatesByBuild.get(b.id) ?? [];
            return (
              <GatesColumn
                key={b.id}
                gradeId={grade.id}
                build={b}
                gates={list}
                skills={skills}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GatesColumn({
  gradeId,
  build,
  gates,
  skills,
}: {
  gradeId: number;
  build: Build;
  gates: Gate[];
  skills: Skill[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [newSkillId, setNewSkillId] = useState<number | null>(null);
  const [newMastery, setNewMastery] = useState('1');

  const usedSkillIds = new Set(gates.map((g) => g.skillId));
  const availableSkills = skills.filter((s) => !usedSkillIds.has(s.id));

  async function addGate() {
    const skillId = newSkillId;
    const requiredMastery = parseInt(newMastery, 10);
    if (!skillId || !requiredMastery) {
      alert('Выбери навык и уровень');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/grades/${gradeId}/gates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildId: build.id, skillId, requiredMastery }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Ошибка: ${j.error ?? 'не добавилось'}`);
        return;
      }
      setNewSkillId(null);
      setNewMastery('1');
      router.refresh();
    } finally {
      setAdding(false);
    }
  }

  async function deleteGate(gateId: number) {
    if (!confirm('Удалить гейт?')) return;
    const res = await fetch(`/api/gates/${gateId}`, { method: 'DELETE' });
    if (!res.ok) {
      alert('Не удалось удалить');
      return;
    }
    router.refresh();
  }

  async function changeMastery(gateId: number, newVal: number) {
    const res = await fetch(`/api/gates/${gateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requiredMastery: newVal }),
    });
    if (!res.ok) {
      alert('Не удалось обновить');
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px]  text-stone mb-3">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: buildColor(build.code) }}
        />
        {build.name}
        <span className="text-ash">·</span>
        <span className="font-medium text-ink normal-case tracking-normal">
          {gates.length}
        </span>
      </div>

      {gates.length === 0 ? (
        <div className="text-xs text-ash italic mb-3">нет гейтов</div>
      ) : (
        <ul className="space-y-0.5 mb-3">
          {gates.map((gate) => (
            <li
              key={gate.id}
              className="text-xs flex items-center gap-2 py-1.5 px-2 -mx-2 rounded
                         hover:bg-canvas transition-colors group"
            >
              <span className="truncate flex-1 text-ink">{gate.skillName}</span>
              <select
                value={gate.requiredMastery}
                onChange={(e) => changeMastery(gate.id, parseInt(e.target.value, 10))}
                className="input input-sm w-auto text-[11px] py-0.5"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    ≥{n}
                  </option>
                ))}
              </select>
              <button
                onClick={() => deleteGate(gate.id)}
                className="text-ash hover:text-blaze opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center w-5 h-5"
                title="Удалить"
              >
                <CloseIcon className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-1.5">
        <SkillCombobox
          skills={availableSkills}
          value={newSkillId}
          onChange={setNewSkillId}
        />
        <select
          value={newMastery}
          onChange={(e) => setNewMastery(e.target.value)}
          className="input input-sm w-auto text-[11px]"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              ≥{n}
            </option>
          ))}
        </select>
        <button
          onClick={addGate}
          disabled={adding || !newSkillId}
          className="btn-accent btn-sm w-8 h-8 p-0 flex items-center justify-center"
          title="Добавить гейт"
        >
          {adding ? '…' : <PlusIcon className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
