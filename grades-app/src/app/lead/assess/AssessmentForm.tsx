'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GRADE_NAMES, GRADE_ORDER, BUILD_NAMES } from '@/lib/types';
import type { BuildCode, GradeCode } from '@/lib/types';
import Avatar from '@/components/Avatar';
import { ChevronDownIcon } from '@/components/icons';

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
    avatarUrl: string | null;
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

    let calculatedGrade: GradeCode = 'junior';
    for (const g of sortedDesc) {
      if (g.code === 'junior') continue;
      if (total < g.threshold) continue;
      const gatesPassed = g.gates.every(
        (gate) => (scoreMap.get(gate.skillId) ?? 0) >= gate.requiredMastery,
      );
      if (!gatesPassed) continue;
      calculatedGrade = g.code;
      break;
    }

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
      // Сразу ведём на портрет — там лид видит свежий грейд и кнопку «Новая оценка».
      router.push(`/lead/portrait?id=${designer.id}`);
      router.refresh();
      return;
    }
    setPublishing(false);
  }

  async function handleDiscard() {
    if (published) return;
    if (!confirm('Удалить черновик? Все оценки будут потеряны.')) return;
    await fetch(`/api/assessments/${assessmentId}`, { method: 'DELETE' });
    router.push('/admin/users');
  }

  // cycle хранится в БД как YYYY-MM, но в UI больше не показываем —
  // оценки теперь ad-hoc, ориентир — дата публикации.

  return (
    <div className="max-w-[1400px] mx-auto px-8 pt-8 pb-16">
      {/* Breadcrumb + header */}
      <div className="text-xs text-stone mb-3">
        <a href="/admin/users" className="hover:text-ink transition-colors">
          Команда
        </a>
        <span className="text-ash mx-1.5">/</span>
        <span>{designer.fullName}</span>
      </div>
      <div className="flex items-end justify-between gap-8 mb-6">
        <div className="flex items-center gap-4 min-w-0">
          <Avatar
            name={designer.fullName}
            avatarUrl={designer.avatarUrl}
            size={64}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h1 className="font-display text-4xl font-semibold tracking-tight">
                {designer.fullName}
              </h1>
              {published ? (
                <span className="chip-accent">Опубликовано</span>
              ) : (
                <span className="chip-warn">Черновик</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-sm text-stone">
              <span className="chip-build">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background:
                      designer.buildCode === 'creator'
                        ? '#00ca48'
                        : designer.buildCode === 'visioner'
                          ? '#7c3aed'
                          : '#0ea5e9',
                  }}
                />
                {designer.buildName}
              </span>
              <span className="text-ash">·</span>
              <span>{designer.department ?? '—'}</span>
            </div>
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
            <button onClick={handleDiscard} className="btn-secondary btn-sm">
              Отменить черновик
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing || calc.filled === 0}
              className="btn-accent"
            >
              {publishing ? 'Публикую…' : 'Опубликовать'}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* LEFT NAV */}
        <aside className="col-span-3">
          <div className="sticky top-20 card p-5">
            <div className="text-[11px]  text-stone mb-4">
              Скиллы
            </div>
            <div className="space-y-3">
              {grouped.map((tax) => {
                const taxSkills = tax.groups.flatMap((g) => g.skills);
                const taxFilled = taxSkills.filter(
                  (s) => (scores[s.id] ?? 0) > 0,
                ).length;
                const pct = Math.round(
                  (taxFilled / Math.max(1, taxSkills.length)) * 100,
                );
                return (
                  <a
                    key={tax.taxCode}
                    href={`#group-${tax.taxCode}`}
                    className="block group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm group-hover:text-ink transition-colors">
                        {tax.taxName}
                      </span>
                      <span className="text-[11px] text-ash font-medium tabular-nums">
                        {taxFilled}/{taxSkills.length}
                      </span>
                    </div>
                    <div className="h-1 bg-cloud rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </a>
                );
              })}
            </div>
            <hr className="border-cloud my-5" />
            <hr className="border-cloud my-4" />
            <div className="text-[11px]  text-stone mb-2">
              Заполнено
            </div>
            <div className="flex items-baseline gap-1.5 mb-2">
              <span className="font-display text-3xl font-semibold tabular-nums">
                {calc.filled}
              </span>
              <span className="text-sm text-stone">из {skills.length}</span>
            </div>
            <div className="h-1 bg-cloud rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald rounded-full transition-all"
                style={{
                  width: `${Math.round((calc.filled / Math.max(1, skills.length)) * 100)}%`,
                }}
              />
            </div>
          </div>
        </aside>

        {/* CENTER: skill cards */}
        <main className="col-span-6">
          <div className="space-y-5">
            {grouped.map((tax) => (
              <section
                key={tax.taxCode}
                id={`group-${tax.taxCode}`}
                className="card overflow-hidden"
              >
                <div className="px-6 py-3.5 border-b border-cloud bg-canvas/60">
                  <div className="text-base font-semibold text-ink">
                    {tax.taxName}
                  </div>
                </div>
                {tax.groups.map((group, gIdx) => (
                  <div
                    key={group.name}
                    className={gIdx > 0 ? 'border-t border-cloud' : ''}
                  >
                    <div className="px-6 pt-5 pb-2 text-sm font-medium text-stone">
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
          <div className="sticky top-20 space-y-3">
            <div className="card p-6">
              <div className="text-[11px]  text-stone mb-1.5">
                Прогноз грейда
              </div>
              <div className="font-display text-4xl font-semibold tracking-tight mb-2">
                {GRADE_NAMES[calc.effectiveGrade]}
              </div>
              {calc.nextGrade && (
                <div className="text-xs text-stone mb-5 leading-relaxed">
                  До «{GRADE_NAMES[calc.nextGrade.code]}» — ещё{' '}
                  <strong className="text-ink">{calc.nextGrade.xpNeeded} XP</strong>
                  {calc.nextGrade.failedGates.length > 0 &&
                    ` и ${calc.nextGrade.failedGates.length} гейт${calc.nextGrade.failedGates.length === 1 ? '' : 'ов'}`}
                </div>
              )}
              {!calc.nextGrade && calc.calculatedGrade === 'senior' && (
                <div className="text-xs text-stone mb-5">
                  Достигнут потолок грейдов
                </div>
              )}
              <hr className="border-cloud mb-4" />
              <div className="flex items-baseline gap-1.5 mb-2">
                <span className="font-display text-3xl font-semibold tabular-nums">
                  {calc.total}
                </span>
                <span className="text-sm text-stone">из {maxXp} XP</span>
              </div>
              <div className="h-1 bg-cloud rounded-full overflow-hidden mb-5">
                <div
                  className="h-full bg-emerald rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (calc.total / Math.max(1, maxXp)) * 100)}%`,
                  }}
                />
              </div>
              <div className="space-y-1.5 text-sm">
                {TAXONOMY_ORDER.map((t) => (
                  <div key={t} className="flex justify-between">
                    <span className="text-stone">{t}</span>
                    <span className="font-medium tabular-nums">
                      {calc.byTax[t] ?? 0}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Gates for next grade */}
            {calc.nextGrade && calc.nextGrade.failedGates.length > 0 && (
              <div className="card p-5">
                <div className="text-[11px]  text-stone mb-3">
                  Гейты на «{GRADE_NAMES[calc.nextGrade.code]}»
                </div>
                <ul className="space-y-1.5 text-sm">
                  {calc.nextGrade.failedGates.map((g) => (
                    <li
                      key={g.skillId}
                      className="flex items-start justify-between gap-3"
                    >
                      <span className="text-stone leading-snug truncate">
                        {skillNameMap.get(g.skillId) ?? `#${g.skillId}`}
                      </span>
                      <span className="text-xs text-ash font-medium shrink-0">
                        ≥{g.requiredMastery}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {designer.gradeFloor && (
              <div className="bg-lime-light/60 border border-lime/30 rounded-card p-4">
                <div className="text-[11px]  text-graphite mb-1.5">
                  Зафиксированный грейд
                </div>
                <div className="text-xs text-graphite leading-relaxed">
                  Не опускается ниже{' '}
                  <strong>{GRADE_NAMES[designer.gradeFloor]}</strong>.
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
    <article className="px-6 py-4 border-b border-cloud last:border-b-0">
      <div className="flex items-start justify-between gap-6 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="font-medium text-sm">{skill.name}</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-pill tracking-wide font-medium ${
                skill.type === 'CORE'
                  ? 'bg-ink text-snow'
                  : 'bg-cloud/60 text-stone'
              }`}
            >
              {skill.type}
            </span>
            <span className="text-xs text-stone">вес {skill.weight}</span>
          </div>
          {skill.description && (
            <div className="text-xs text-stone leading-relaxed">
              {skill.description}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-[11px]  text-stone mb-0.5">XP</div>
          <div className="font-display text-2xl font-semibold leading-none tabular-nums">
            {xp}
          </div>
        </div>
      </div>

      {/* Mastery buttons — равной ширины, текст truncate */}
      <div className="flex items-stretch gap-1.5 mt-3 flex-wrap">
        <button
          onClick={() => !disabled && onSetLevel(0)}
          disabled={disabled}
          className={`flex-1 min-w-[120px] max-w-[200px] h-8 px-3 rounded-pill text-xs border transition-colors flex items-center justify-center ${
            currentLevel === 0
              ? 'bg-ink text-snow border-ink'
              : 'bg-snow text-stone border-cloud hover:border-ash'
          } ${disabled ? 'cursor-default' : ''}`}
        >
          Не оценено
        </button>
        {skill.levels.map((lvl) => (
          <button
            key={lvl.level}
            onClick={() => !disabled && onSetLevel(lvl.level)}
            title={lvl.title}
            disabled={disabled}
            className={`flex-1 min-w-[120px] max-w-[200px] h-8 px-3 rounded-pill text-xs border transition-colors flex items-center justify-center gap-1.5 ${
              currentLevel === lvl.level
                ? 'bg-ink text-snow border-ink'
                : 'bg-snow text-stone border-cloud hover:border-ash hover:text-ink'
            } ${disabled ? 'cursor-default' : ''}`}
          >
            <span className="font-semibold shrink-0">{lvl.level}</span>
            <span className="truncate">{lvl.title}</span>
          </button>
        ))}
      </div>

      {/* Criteria details */}
      <details
        className="mt-3 group"
        open={expanded}
        onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}
      >
        <summary className="text-xs text-stone hover:text-ink inline-flex items-center gap-1 cursor-pointer select-none">
          <ChevronDownIcon className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
          Критерии по уровням
        </summary>
        <div className="mt-3 space-y-2">
          {skill.levels.map((lvl) => (
            <div
              key={lvl.level}
              className={`p-3 rounded-card border transition-colors ${
                currentLevel === lvl.level
                  ? 'bg-lime-light border-lime/40'
                  : 'bg-canvas border-transparent'
              }`}
            >
              <div className="font-medium text-sm mb-1 flex items-center gap-2">
                <span
                  className={`text-sm leading-none tabular-nums font-semibold ${
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
