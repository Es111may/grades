'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import MigrateButton from './MigrateButton';

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
  code === 'creator' ? '#ade900' : code === 'visioner' ? '#7c3aed' : '#0ea5e9';

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
    <main className="max-w-[1200px] mx-auto px-8 pt-12 pb-16">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-stone mb-2">
          Грейды · матрица {matrixNumber}
        </div>
        <h1 className="font-display text-5xl font-light tracking-tight mb-3">Грейды</h1>
        <p className="text-stone leading-relaxed max-w-2xl">
          Пороги XP по билдам и обязательные навыки для каждого грейда. Изменения применяются
          к будущим оценкам — уже опубликованные используют свой снапшот.
        </p>
      </div>

      <MigrateButton />

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
    <div className="bg-white border border-cloud rounded-card p-6 shadow-soft">
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
            className="font-display text-xl tracking-tight bg-transparent border-b border-transparent hover:border-cloud focus:border-lime focus:outline-none w-full"
          />
          <div className="text-xs text-stone mt-1">code: {grade.code}</div>
        </div>

        {/* Thresholds per build */}
        <div className="grid grid-cols-3 gap-4">
          {builds.map((b) => (
            <div key={b.id}>
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-stone mb-1">
                <span
                  className="w-2 h-2 rounded-full"
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
                  className="font-display text-2xl bg-transparent border-b border-cloud focus:border-lime focus:outline-none w-20"
                />
                <span className="text-xs text-stone">XP</span>
              </div>
            </div>
          ))}
        </div>

        {/* Save */}
        <button
          onClick={save}
          disabled={!edited || saving}
          className="bg-lime border border-lime rounded-pill px-4 py-1.5 text-xs font-medium hover:brightness-95 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </div>

      {/* Gates editor */}
      <div className="mt-5 pt-5 border-t border-cloud">
        <div className="text-xs uppercase tracking-widest text-stone mb-3">
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
  const [newSkillId, setNewSkillId] = useState<string>('');
  const [newMastery, setNewMastery] = useState('1');

  const usedSkillIds = new Set(gates.map((g) => g.skillId));
  const availableSkills = skills.filter((s) => !usedSkillIds.has(s.id));

  async function addGate() {
    const skillId = parseInt(newSkillId, 10);
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
      setNewSkillId('');
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
      <div className="flex items-center gap-1.5 text-xs text-stone mb-3">
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: buildColor(build.code) }}
        />
        {build.name}
        <span className="text-ash">·</span>
        <span>{gates.length}</span>
      </div>

      {gates.length === 0 ? (
        <div className="text-xs text-ash italic mb-3">нет гейтов</div>
      ) : (
        <ul className="space-y-1.5 mb-3">
          {gates.map((gate) => (
            <li
              key={gate.id}
              className="text-xs text-stone flex items-center justify-between gap-2 py-1 border-b border-cloud last:border-0"
            >
              <span className="truncate flex-1">{gate.skillName}</span>
              <select
                value={gate.requiredMastery}
                onChange={(e) => changeMastery(gate.id, parseInt(e.target.value, 10))}
                className="bg-transparent text-xs border border-cloud rounded px-1.5 py-0.5"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    ≥{n}
                  </option>
                ))}
              </select>
              <button
                onClick={() => deleteGate(gate.id)}
                className="text-stone hover:text-sunset"
                title="Удалить"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-1.5">
        <select
          value={newSkillId}
          onChange={(e) => setNewSkillId(e.target.value)}
          className="flex-1 text-xs bg-canvas border border-cloud rounded px-2 py-1"
        >
          <option value="">+ навык…</option>
          {availableSkills.map((s) => (
            <option key={s.id} value={s.id}>
              {s.taxonomyCode} · {s.name}
            </option>
          ))}
        </select>
        <select
          value={newMastery}
          onChange={(e) => setNewMastery(e.target.value)}
          className="text-xs bg-canvas border border-cloud rounded px-1.5 py-1"
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
          className="text-xs bg-lime border border-lime rounded px-2 py-1 hover:brightness-95 disabled:opacity-30"
        >
          {adding ? '…' : '+'}
        </button>
      </div>
    </div>
  );
}
