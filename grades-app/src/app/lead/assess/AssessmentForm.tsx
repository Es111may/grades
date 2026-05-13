'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GRADE_NAMES, GRADE_ORDER, BUILD_NAMES } from '@/lib/types';
import type { BuildCode, GradeCode } from '@/lib/types';
import Avatar from '@/components/Avatar';
import { MarkdownTextarea } from '@/components/Markdown';

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
const TAXONOMY_COLOR: Record<string, string> = {
  UI: '#34c759',  // green
  UX: '#0ea5e9',  // sky blue
  PRD: '#ef4444', // red
  IND: '#7c3aed', // violet
  RES: '#f59e0b', // amber
};

export default function AssessmentForm({
  assessmentId,
  assessmentStatus,
  designer,
  cycle,
  skills,
  grades,
  existingScores,
  initialLeadComment,
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
  initialLeadComment: string;
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

  // Мнение лида/стардиза — markdown-текст, автосейв с debounce 800мс,
  // отдельным запросом (не смешиваем с очередью scores).
  const [leadComment, setLeadComment] = useState<string>(initialLeadComment);
  const leadCommentTimeout = useRef<NodeJS.Timeout | null>(null);
  const leadCommentDirty = useRef(false);

  // Auto-save scores
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

  // Auto-save leadComment отдельно — он не смешивается с очередью scores
  const saveLeadComment = useCallback(async () => {
    if (!leadCommentDirty.current || published) return;
    leadCommentDirty.current = false;
    setSaveStatus('saving');
    await fetch('/api/assessments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assessmentId, leadComment }),
    });
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 1500);
  }, [assessmentId, leadComment, published]);

  function handleLeadCommentChange(next: string) {
    if (published) return;
    setLeadComment(next);
    leadCommentDirty.current = true;
    if (leadCommentTimeout.current) clearTimeout(leadCommentTimeout.current);
    leadCommentTimeout.current = setTimeout(saveLeadComment, 800);
  }

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
      if (leadCommentTimeout.current) clearTimeout(leadCommentTimeout.current);
      if (pendingScores.current.length > 0) doSave();
      if (leadCommentDirty.current) saveLeadComment();
    };
  }, [doSave, saveLeadComment]);

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

  // Двухступенчатое подтверждение отмены черновика — вместо confirm(),
  // который в некоторых браузерах молча возвращает false.
  const [discardArmed, setDiscardArmed] = useState(false);

  function armDiscard() {
    setDiscardArmed(true);
    setTimeout(() => setDiscardArmed(false), 5000);
  }

  async function handleDiscard() {
    if (published) return;
    const res = await fetch(`/api/assessments/${assessmentId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Не получилось удалить черновик: ${j.error ?? res.statusText}`);
      setDiscardArmed(false);
      return;
    }
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
            <h1 className="font-display text-4xl font-semibold tracking-tight mb-2">
              {designer.fullName}
            </h1>
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* На странице оценки чип билда такой же по размеру, как роль
                  и статус — используем .chip-neutral, точку билда кладём
                  внутрь. В таблицах/канбане более компактный .chip-build из
                  globals.css. */}
              <span className="chip-neutral">
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
              {/* Чип `department` убран — дублирует buildName после
                  переименования билдов в названия отделов. */}
              {published ? (
                <span className="chip-accent">Опубликовано</span>
              ) : (
                <span className="chip-warn">Черновик</span>
              )}
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
            {!discardArmed ? (
              <button
                type="button"
                onClick={armDiscard}
                className="btn-ghost-danger"
              >
                Отменить черновик
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDiscard}
                className="btn-danger"
              >
                Точно отменить?
              </button>
            )}
            <button
              type="button"
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
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: TAXONOMY_COLOR[tax.taxCode] ?? '#34c759',
                        }}
                      />
                    </div>
                  </a>
                );
              })}
            </div>
            <hr className="border-cloud my-5" />
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

            {/* Мнение дизайн-лида / стардиза — markdown-блок. Авто-сейв при
                каждом изменении (debounce 800мс). После публикации текст
                становится read-only и показывается на портрете дизайнера. */}
            <section className="card overflow-hidden">
              <div className="px-6 py-3.5 border-b border-cloud bg-canvas/30 flex items-center gap-3">
                <span className="chip-build shrink-0">Лид</span>
                <div className="min-w-0">
                  <div className="text-base font-semibold text-ink leading-tight">
                    Мнение дизайн-лида / стардиза
                  </div>
                  <div className="text-xs text-stone mt-0.5">
                    Покажется дизайнеру на портрете. Markdown · ⌘B жирный · ⌘I курсив.
                  </div>
                </div>
              </div>
              <div className="px-6 py-5">
                {published ? (
                  leadComment ? (
                    <div className="text-sm leading-relaxed text-graphite whitespace-pre-line">
                      {leadComment}
                    </div>
                  ) : (
                    <div className="text-sm text-ash italic">
                      Лид не оставил мнения к этой оценке
                    </div>
                  )
                ) : (
                  <MarkdownTextarea
                    value={leadComment}
                    onChange={handleLeadCommentChange}
                    placeholder="Что важно зафиксировать про этого дизайнера: сильные стороны, зоны роста, наблюдения за цикл."
                    rows={8}
                  />
                )}
              </div>
            </section>
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

function MasteryOption({
  title,
  criteria,
  xp,
  selected,
  onClick,
  disabled,
}: {
  title: string;
  criteria: string | null;
  xp: number;
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-start gap-3 p-4 rounded-card border transition-colors text-left ${
        selected
          ? 'border-ink bg-canvas/60'
          : 'border-cloud hover:border-ash bg-snow'
      } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <span
        className={`shrink-0 w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center transition-colors ${
          selected ? 'border-ink' : 'border-ash'
        }`}
      >
        {selected && <span className="w-1.5 h-1.5 rounded-full bg-ink" />}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink leading-snug">{title}</div>
        {criteria && (
          <div className="text-xs text-stone leading-relaxed mt-1">{criteria}</div>
        )}
      </div>
      <div className="shrink-0 text-xs text-stone tabular-nums self-start mt-0.5">
        {xp}
      </div>
    </button>
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
  return (
    <article className="px-6 py-5 border-b border-cloud last:border-b-0">
      {/* Header: имя + CORE + вес */}
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className="font-medium text-sm">{skill.name}</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-pill tracking-wide font-medium ${
            skill.type === 'CORE' ? 'bg-ink text-snow' : 'bg-cloud/60 text-stone'
          }`}
        >
          {skill.type}
        </span>
        <span className="text-xs text-stone">{skill.weight} вес</span>
      </div>

      {/* Описание навыка */}
      {skill.description && (
        <div className="text-sm text-stone leading-relaxed mb-4">
          {skill.description}
        </div>
      )}

      {/* Уровни мастерства как вертикальный radio-список */}
      <div className="flex flex-col gap-2">
        <MasteryOption
          title="Не оценено"
          criteria={null}
          xp={0}
          selected={currentLevel === 0}
          onClick={() => !disabled && onSetLevel(0)}
          disabled={disabled}
        />
        {skill.levels.map((lvl) => (
          <MasteryOption
            key={lvl.level}
            title={lvl.title}
            criteria={lvl.criteria}
            xp={lvl.level * skill.weight}
            selected={currentLevel === lvl.level}
            onClick={() => !disabled && onSetLevel(lvl.level)}
            disabled={disabled}
          />
        ))}
      </div>

      {skill.replaceableNote && (
        <div className="bg-canvas border border-cloud rounded-card p-3 mt-3 text-xs leading-relaxed text-graphite">
          {skill.replaceableNote}
        </div>
      )}
    </article>
  );
}
