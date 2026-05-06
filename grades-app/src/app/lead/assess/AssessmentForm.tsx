'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GRADE_NAMES, GRADE_ORDER, BUILD_NAMES } from '@/lib/types';
import type { BuildCode, GradeCode } from '@/lib/types';

type SkillData = {
  id: number;
  name: string;
  description: string;
  type: string;
  maxMasteryLevel: number;
  replaceableNote: string | null;
  weight: number;
  taxonomyCode: string;
  taxonomyName: string;
  groupName: string;
  levels: { level: number; title: string; criteria: string }[];
};

type GradeData = {
  code: GradeCode;
  name: string;
  threshold: number;
  gates: { skillId: number; requiredMastery: number }[];
};

const TAXONOMY_ORDER = ['UI', 'UX', 'PRD', 'IND', 'RES'];

export default function AssessmentForm({
  assessmentId,
  assessmentStatus,
  designer,
  cycle,
  skills,
  grades,
  existingScores,
  maxXp,
}: {
  assessmentId: number;
  assessmentStatus: string;
  designer: {
    id: number;
    fullName: string;
    buildCode: BuildCode;
    buildName: string;
    department: string | null;
    gradeFloor: GradeCode | null;
    hiredAt: string | null;
  };
  cycle: string;
  skills: SkillData[];
  grades: GradeData[];
  existingScores: Record<number, number>;
  maxXp: number;
}) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<number, number>>(existingScores);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(assessmentStatus === 'published');
  const saveTimeout = useRef<NodeJS.Timeout | null>(null);
  const pendingScores = useRef<{ skillId: number; masteryLevel: number }[]>([]);

  // Auto-save debounced
  const doSave = useCallback(async () => {
    if (pendingScores.current.length === 0 || published) return;
    setSaveStatus('saving');
    const toSave = [...pendingScores.current];
    pendingScores.current = [];

    await fetch('/api/assessments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assessmentId, scores: toSave }),
    });

    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 1500);
  }, [assessmentId, published]);

  function setMastery(skillId: number, level: number) {
    if (published) return;
    setScores((prev) => ({ ...prev, [skillId]: level }));
    pendingScores.current.push({ skillId, masteryLevel: level });

    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(doSave, 800);
  }

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      if (pendingScores.current.length > 0) doSave();
    };
  }, [doSave]);

  // Live calculation
  const calc = useMemo(() => {
    const byTax: Record<string, number> = {};
    let total = 0;
    let filled = 0;

    for (const skill of skills) {
      const mastery = scores[skill.id] ?? 0;
      const xp = mastery * skill.weight;
      total += xp;
      byTax[skill.taxonomyCode] = (byTax[skill.taxonomyCode] ?? 0) + xp;
      if (mastery > 0) filled++;
    }

    // Grade calculation
    const scoreMap = new Map<number, number>();
    for (const skill of skills) {
      scoreMap.set(skill.id, scores[skill.id] ?? 0);
    }

    const sortedDesc = [...grades].sort(
      (a, b) => GRADE_ORDER[b.code] - GRADE_ORDER[a.code],
    );
    const sortedAsc = [...grades].sort(
      (a, b) => GRADE_ORDER[a.code] - GRADE_ORDER[b.code],
    );

    let calculatedGrade: GradeCode = 'intern';
    for (const g of sortedDesc) {
      if (g.code === 'intern') continue;
      if (total < g.threshold) continue;
      const gatesPassed = g.gates.every(
        (gate) => (scoreMap.get(gate.skillId) ?? 0) >= gate.requiredMastery,
      );
      if (!gatesPassed) continue;
      calculatedGrade = g.code;
      break;
    }
    if (total <= 0) calculatedGrade = 'intern';

    let effectiveGrade = calculatedGrade;
    if (
      designer.gradeFloor &&
      GRADE_ORDER[designer.gradeFloor] > GRADE_ORDER[calculatedGrade]
    ) {
      effectiveGrade = designer.gradeFloor;
    }

    // Next grade
    let nextGrade: { code: GradeCode; xpNeeded: number; failedGates: { skillId: number; requiredMastery: number; current: number }[] } | null = null;
    for (const g of sortedAsc) {
      if (GRADE_ORDER[g.code] <= GRADE_ORDER[calculatedGrade]) continue;
      const xpNeeded = Math.max(0, g.threshold - total);
      const failedGates = g.gates
        .filter((gate) => (scoreMap.get(gate.skillId) ?? 0) < gate.requiredMastery)
        .map((gate) => ({
          skillId: gate.skillId,
          requiredMastery: gate.requiredMastery,
          current: scoreMap.get(gate.skillId) ?? 0,
        }));
      nextGrade = { code: g.code, xpNeeded, failedGates };
      break;
    }

    return { total, byTax, filled, calculatedGrade, effectiveGrade, nextGrade };
  }, [scores, skills, grades, designer.gradeFloor]);

  // Group skills by taxonomy → group
  const grouped = useMemo(() => {
    const result: {
      taxCode: string;
      taxName: string;
      groups: { name: string; skills: SkillData[] }[];
    }[] = [];

    const byTax = new Map<string, Map<string, SkillData[]>>();
    for (const s of skills) {
      if (!byTax.has(s.taxonomyCode)) byTax.set(s.taxonomyCode, new Map());
      const groups = byTax.get(s.taxonomyCode)!;
      if (!groups.has(s.groupName)) groups.set(s.groupName, []);
      groups.get(s.groupName)!.push(s);
    }

    for (const taxCode of TAXONOMY_ORDER) {
      const groups = byTax.get(taxCode);
      if (!groups) continue;
      const taxName = skills.find((s) => s.taxonomyCode === taxCode)?.taxonomyName ?? taxCode;
      result.push({
        taxCode,
        taxName,
        groups: Array.from(groups.entries()).map(([name, skills]) => ({
          name,
          skills,
        })),
      });
    }
    return result;
  }, [skills]);

  // Skill name map for gates
  const skillNameMap = useMemo(() => {
    const m = new Map<number, string>();
    skills.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [skills]);

  async function handlePublish() {
    if (published) return;
    // Save pending first
    if (pendingScores.current.length > 0) await doSave();

    setPublishing(true);
    const res = await fetch(`/api/assessments/${assessmentId}`, { method: 'POST' });
    if (res.ok) {
      setPublished(true);
      router.refresh();
    }
    setPublishing(false);
  }

  async function handleDiscard() {
    if (published) return;
    if (!confirm('Удалить черновик? Все оценки будут потеряны.')) return;
    await fetch(`/api/assessments/${assessmentId}`, { method: 'DELETE' });
    router.push('/lead');
  }

  // cycle хранится в БД как YYYY-MM, но в UI больше не показываем —
  // оценки теперь ad-hoc, ориентир — дата публикации.

  return (
    <div className="max-w-[1400px] mx-auto px-8 pt-10 pb-16">
      {/* Breadcrumb + header */}
      <div className="text-xs text-stone mb-3">
        <a href="/lead" className="hover:underline">
          Мои дизайнеры
        </a>{' '}
        <span className="text-ash mx-1.5">/</span> {designer.fullName}
      </div>
      <div className="flex items-end justify-between gap-8 mb-8">
        <div>
          <div className="text-xs uppercase tracking-widest text-stone mb-2">
            {published ? 'Опубликовано' : 'Черновик оценки'}
          </div>
          <h1 className="font-display text-5xl font-light tracking-tight mb-4">
            {designer.fullName}
          </h1>
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  background:
                    designer.buildCode === 'creator'
                      ? '#ade900'
                      : designer.buildCode === 'visioner'
                        ? '#7c3aed'
                        : '#0ea5e9',
                }}
              />
              {designer.buildName}
            </span>
            <span className="text-ash">·</span>
            <span className="text-stone">{designer.department ?? '—'}</span>
          </div>
        </div>
        {!published && (
          <div className="flex items-center gap-3">
            <span
              className={`text-xs text-stone transition-opacity ${
                saveStatus === 'saved' ? 'opacity-100' : 'opacity-0'
              }`}
            >
              сохранено
            </span>
            <button
              onClick={handleDiscard}
              className="px-4 py-2 text-sm text-stone hover:text-ink border border-cloud rounded-pill transition"
            >
              Отменить черновик
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing || calc.filled === 0}
              className="bg-lime border border-lime rounded-pill px-5 py-2 text-sm font-medium hover:brightness-95 transition disabled:opacity-50"
            >
              {publishing ? 'Публикую…' : 'Опубликовать'}
            </button>
          </div>
        )}
        {published && (
          <span className="px-4 py-2 rounded-pill text-sm font-medium bg-lime-light text-graphite border border-lime/30">
            ✓ Опубликовано
          </span>
        )}
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* LEFT NAV */}
        <aside className="col-span-3">
          <div className="sticky top-6 bg-white border border-cloud rounded-card p-6 shadow-soft">
            <div className="text-xs uppercase tracking-widest text-stone mb-4">
              Скиллы
            </div>
            <div className="space-y-3.5">
              {grouped.map((tax) => {
                const taxSkills = tax.groups.flatMap((g) => g.skills);
                const taxFilled = taxSkills.filter(
                  (s) => (scores[s.id] ?? 0) > 0,
                ).length;
                const pct = Math.round(
                  (taxFilled / Math.max(1, taxSkills.length)) * 100,
                );
                return (
                  <a key={tax.taxCode} href={`#group-${tax.taxCode}`} className="block">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm">{tax.taxName}</span>
                      <span className="text-xs text-stone font-mono">
                        {taxFilled}/{taxSkills.length}
                      </span>
                    </div>
                    <div className="h-1 bg-cloud rounded-full overflow-hidden">
                      <div
                        className="h-full bg-lime rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </a>
                );
              })}
            </div>
            <hr className="border-cloud my-5" />
            <div className="text-xs uppercase tracking-widest text-stone mb-2">
              Заполнено
            </div>
            <div className="flex items-baseline gap-1.5 mb-2">
              <span className="font-display text-3xl">{calc.filled}</span>
              <span className="text-sm text-stone">/ {skills.length}</span>
            </div>
            <div className="h-1 bg-cloud rounded-full overflow-hidden">
              <div
                className="h-full bg-lime rounded-full transition-all"
                style={{
                  width: `${Math.round((calc.filled / Math.max(1, skills.length)) * 100)}%`,
                }}
              />
            </div>
          </div>
        </aside>

        {/* CENTER: skill cards */}
        <main className="col-span-6">
          <div className="space-y-6">
            {grouped.map((tax) => (
              <section
                key={tax.taxCode}
                id={`group-${tax.taxCode}`}
                className="bg-white border border-cloud rounded-card overflow-hidden shadow-soft"
              >
                <div className="px-7 py-4 border-b border-cloud">
                  <div className="text-xs uppercase tracking-widest text-stone">
                    {tax.taxName}
                  </div>
                </div>
                {tax.groups.map((group) => (
                  <div key={group.name}>
                    <div className="px-7 pt-4 pb-2 text-xs font-medium text-stone bg-canvas">
                      {group.name}
                    </div>
                    {group.skills.map((skill) => (
                      <SkillCard
                        key={skill.id}
                        skill={skill}
                        currentLevel={scores[skill.id] ?? 0}
                        onSetLevel={(lvl) => setMastery(skill.id, lvl)}
                        disabled={published}
                      />
                    ))}
                  </div>
                ))}
              </section>
            ))}
          </div>
        </main>

        {/* RIGHT: live calc */}
        <aside className="col-span-3">
          <div className="sticky top-6 space-y-5">
            <div className="bg-white border border-cloud rounded-card p-6 shadow-soft">
              <div className="text-xs uppercase tracking-widest text-stone mb-2">
                Прогноз грейда
              </div>
              <div className="font-display text-5xl tracking-tight mb-2">
                {GRADE_NAMES[calc.effectiveGrade]}
              </div>
              {calc.nextGrade && (
                <div className="text-xs text-stone mb-5 leading-relaxed">
                  До «{GRADE_NAMES[calc.nextGrade.code]}» нужно ещё{' '}
                  {calc.nextGrade.xpNeeded} XP
                  {calc.nextGrade.failedGates.length > 0 &&
                    ` и ${calc.nextGrade.failedGates.length} гейтов`}
                </div>
              )}
              {!calc.nextGrade && calc.calculatedGrade === 'senior' && (
                <div className="text-xs text-stone mb-5">
                  Достигнут потолок грейдов
                </div>
              )}
              <hr className="border-cloud mb-4" />
              <div className="flex items-baseline gap-1.5 mb-2">
                <span className="font-display text-4xl">{calc.total}</span>
                <span className="text-sm text-stone">/ {maxXp} XP</span>
              </div>
              <div className="h-1 bg-cloud rounded-full overflow-hidden mb-5">
                <div
                  className="h-full bg-lime rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (calc.total / Math.max(1, maxXp)) * 100)}%`,
                  }}
                />
              </div>
              <div className="space-y-2 text-sm">
                {TAXONOMY_ORDER.map((t) => (
                  <div key={t} className="flex justify-between">
                    <span className="text-stone">{t}</span>
                    <span className="font-mono text-xs">{calc.byTax[t] ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Gates for next grade */}
            {calc.nextGrade && calc.nextGrade.failedGates.length > 0 && (
              <div className="bg-white border border-cloud rounded-card p-6 shadow-soft">
                <div className="text-xs uppercase tracking-widest text-stone mb-3">
                  Гейты на «{GRADE_NAMES[calc.nextGrade.code]}»
                </div>
                <div className="space-y-2.5 text-sm">
                  {calc.nextGrade.failedGates.map((g) => (
                    <div key={g.skillId} className="flex items-start gap-2">
                      <span className="text-stone mt-0.5 text-xs">○</span>
                      <span className="text-stone">
                        {skillNameMap.get(g.skillId) ?? `#${g.skillId}`}: уровень{' '}
                        {g.requiredMastery}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {designer.gradeFloor && (
              <div className="bg-canvas border border-cloud rounded-card p-5">
                <div className="text-xs uppercase tracking-widest text-ink mb-2">
                  Зафиксированный грейд
                </div>
                <div className="text-xs text-graphite leading-relaxed">
                  Грейд не может опуститься ниже{' '}
                  <strong>{GRADE_NAMES[designer.gradeFloor]}</strong>. Если расчёт по XP
                  даст более низкий грейд, в портрете будет показан этот.
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function SkillCard({
  skill,
  currentLevel,
  onSetLevel,
  disabled,
}: {
  skill: SkillData;
  currentLevel: number;
  onSetLevel: (level: number) => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(currentLevel > 0);
  const xp = currentLevel * skill.weight;

  return (
    <article className="px-7 py-5 border-b border-cloud last:border-b-0">
      <div className="flex items-start justify-between gap-6 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="font-medium text-base">{skill.name}</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-pill tracking-wide ${
                skill.type === 'CORE'
                  ? 'bg-ink text-white'
                  : 'bg-canvas text-stone border border-cloud'
              }`}
            >
              {skill.type}
            </span>
            <span className="text-xs text-stone">· вес {skill.weight}</span>
            <span className="text-xs text-stone">· max ур. {skill.maxMasteryLevel}</span>
          </div>
          <div className="text-xs text-stone italic leading-relaxed">
            {skill.description}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs uppercase tracking-widest text-stone mb-0.5">XP</div>
          <div className="font-display text-3xl leading-none">{xp}</div>
        </div>
      </div>

      {/* Mastery buttons */}
      <div className="flex items-center gap-1.5 mt-4 flex-wrap">
        <span className="text-xs text-stone mr-2">Мастерство:</span>
        <button
          onClick={() => !disabled && onSetLevel(0)}
          className={`px-2.5 py-1 rounded-pill text-xs border transition ${
            currentLevel === 0
              ? 'bg-ink text-white border-ink'
              : 'bg-white text-stone border-cloud hover:border-ash'
          } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
        >
          0 — не оценено
        </button>
        {skill.levels.map((lvl) => (
          <button
            key={lvl.level}
            onClick={() => !disabled && onSetLevel(lvl.level)}
            title={lvl.title}
            className={`px-2.5 py-1 rounded-pill text-xs border transition ${
              currentLevel === lvl.level
                ? 'bg-ink text-white border-ink'
                : 'bg-white text-stone border-cloud hover:border-ash'
            } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
          >
            {lvl.level} — {lvl.title.length > 20 ? lvl.title.slice(0, 20) + '…' : lvl.title}
          </button>
        ))}
      </div>

      {/* Criteria details */}
      <details
        className="mt-4"
        open={expanded}
        onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}
      >
        <summary className="text-xs text-stone hover:text-ink inline-flex items-center gap-1.5 cursor-pointer">
          <span className="text-[10px]">›</span>
          Критерии подтверждения по уровням
        </summary>
        <div className="mt-3 space-y-2.5">
          {skill.levels.map((lvl) => (
            <div
              key={lvl.level}
              className={`p-3 rounded-card ${
                currentLevel === lvl.level
                  ? 'bg-lime-light border border-lime/30'
                  : 'bg-canvas'
              }`}
            >
              <div className="font-medium text-sm mb-1.5 flex items-center gap-2.5">
                <span
                  className={`font-display text-lg leading-none ${
                    currentLevel === lvl.level ? 'text-ink' : 'text-ash'
                  }`}
                >
                  {lvl.level}
                </span>
                <span>{lvl.title}</span>
              </div>
              <div className="text-xs text-graphite leading-relaxed">
                {lvl.criteria}
              </div>
            </div>
          ))}
          {skill.replaceableNote && (
            <div className="bg-canvas border border-cloud rounded-card p-3 text-xs leading-relaxed text-graphite">
              {skill.replaceableNote}
            </div>
          )}
        </div>
      </details>
    </article>
  );
}
