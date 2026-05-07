'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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

export default function GradesClient({
  matrixNumber,
  builds,
  grades,
}: {
  matrixNumber: number;
  builds: Build[];
  grades: Grade[];
  skills: { id: number; name: string; taxonomyCode: string }[];
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

      <div className="space-y-3">
        {grades.map((g) => (
          <GradeRow key={g.id} grade={g} builds={builds} />
        ))}
      </div>
    </main>
  );
}

function GradeRow({ grade, builds }: { grade: Grade; builds: Build[] }) {
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

      {/* Gates summary */}
      {grade.gates.length > 0 && (
        <div className="mt-5 pt-5 border-t border-cloud">
          <div className="text-xs uppercase tracking-widest text-stone mb-3">
            Обязательные навыки (гейты)
          </div>
          <div className="grid grid-cols-3 gap-4">
            {builds.map((b) => {
              const list = gatesByBuild.get(b.id) ?? [];
              return (
                <div key={b.id}>
                  <div className="flex items-center gap-1.5 text-xs text-stone mb-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: buildColor(b.code) }}
                    />
                    {b.name}
                    <span className="text-ash">·</span>
                    <span>{list.length}</span>
                  </div>
                  {list.length === 0 ? (
                    <div className="text-xs text-ash italic">нет гейтов</div>
                  ) : (
                    <ul className="space-y-1">
                      {list.map((gate) => (
                        <li
                          key={gate.id}
                          className="text-xs text-stone flex items-center justify-between"
                        >
                          <span className="truncate">{gate.skillName}</span>
                          <span className="text-ash ml-2">≥{gate.requiredMastery}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          <div className="text-xs text-ash mt-3 italic">
            Управление гейтами появится в следующем апдейте.
          </div>
        </div>
      )}
    </div>
  );
}
