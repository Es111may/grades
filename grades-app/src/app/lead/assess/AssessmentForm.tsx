'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GRADE_NAMES, GRADE_ORDER, BUILD_NAMES } from '@/lib/types';
import type { BuildCode, GradeCode } from '@/lib/types';
import Avatar from '@/components/Avatar';
import { CheckIcon, FlagIcon } from '@/components/icons';
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

// Phase 14: самооценка дизайнера — референс для лида
type SelfInfo = { level: number; comment: string | null; updatedAt: string };
type EvidenceInfo = {
  id: number;
  url: string;
  title: string;
  description: string | null;
  createdAt: string;
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
  existingFlags,
  initialLeadComment,
  maxXp,
  selfBySkill = {},
  evidencesBySkill = {},
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
  existingFlags: Record<number, boolean>;
  initialLeadComment: string;
  maxXp: number;
  /** Phase 14: самооценка по skillId (пусто, если дизайнер не ставил). */
  selfBySkill?: Record<number, SelfInfo>;
  /** Phase 14: ссылки-подтверждения по skillId. */
  evidencesBySkill?: Record<number, EvidenceInfo[]>;
}) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<number, number>>(existingScores);
  const [flags, setFlags] = useState<Record<number, boolean>>(existingFlags);
  // «Тронутые» в этой сессии навыки — visual hint «я уже сюда заходил».
  // Хранится в sessionStorage: переживает reload вкладки, но не закрытие.
  // В БД не сохраняем — это сугубо рабочая память для текущего захода.
  const [touched, setTouched] = useState<Set<number>>(() => new Set());
  const touchedKey = `assess-touched-${assessmentId}`;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(touchedKey);
      if (raw) setTouched(new Set(JSON.parse(raw) as number[]));
    } catch {
      // sessionStorage может быть недоступен — fallback на пустой Set
    }
  }, [touchedKey]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(touchedKey, JSON.stringify(Array.from(touched)));
    } catch {
      // игнор — non-critical
    }
  }, [touched, touchedKey]);
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(assessmentStatus === 'published');
  const saveTimeout = useRef<NodeJS.Timeout | null>(null);
  // Очередь изменений по скиллам: и `masteryLevel`, и `flagged` идут одним
  // batch'ем. Каждое поле опционально — серверная сторона upsert'ит только
  // переданные поля.
  const pendingScores = useRef<
    { skillId: number; masteryLevel?: number; flagged?: boolean }[]
  >([]);

  // Мнение лида/стардиза — markdown-текст, автосейв с debounce 800мс,
  // отдельным запросом (не смешиваем с очередью scores).
  const [leadComment, setLeadComment] = useState<string>(initialLeadComment);
  const leadCommentTimeout = useRef<NodeJS.Timeout | null>(null);
  const leadCommentDirty = useRef(false);

  // Auto-save scores. Раньше тут стояла «огневая забывалка»: статус
  // переходил в «сохранено» даже когда API упал. Теперь — обязательная
  // проверка res.ok; при ошибке кладём пачку обратно в очередь, чтобы
  // следующий клик попробовал её снова, и показываем статус «не сохранилось».
  const doSave = useCallback(async () => {
    if (pendingScores.current.length === 0 || published) return;
    setSaveStatus('saving');
    const toSave = [...pendingScores.current];
    pendingScores.current = [];
    try {
      const res = await fetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId, scores: toSave }),
      });
      if (!res.ok) {
        pendingScores.current.unshift(...toSave);
        const j = await res.json().catch(() => ({}));
        // eslint-disable-next-line no-console
        console.error('[assess] save failed:', res.status, j);
        setSaveStatus('error');
        return;
      }
      setSaveStatus('saved');
      setTimeout(
        () => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)),
        1500,
      );
    } catch (e) {
      pendingScores.current.unshift(...toSave);
      // eslint-disable-next-line no-console
      console.error('[assess] save network error:', e);
      setSaveStatus('error');
    }
  }, [assessmentId, published]);

  // Auto-save leadComment отдельно — он не смешивается с очередью scores.
  // Та же защита от тихих 500: при не-ok сбрасываем dirty=true, чтобы
  // следующий тик автосейва попробовал ещё раз.
  const saveLeadComment = useCallback(async () => {
    if (!leadCommentDirty.current || published) return;
    leadCommentDirty.current = false;
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId, leadComment }),
      });
      if (!res.ok) {
        leadCommentDirty.current = true;
        // eslint-disable-next-line no-console
        console.error('[assess] leadComment save failed:', res.status);
        setSaveStatus('error');
        return;
      }
      setSaveStatus('saved');
      setTimeout(
        () => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)),
        1500,
      );
    } catch (e) {
      leadCommentDirty.current = true;
      // eslint-disable-next-line no-console
      console.error('[assess] leadComment network error:', e);
      setSaveStatus('error');
    }
  }, [assessmentId, leadComment, published]);

  function handleLeadCommentChange(next: string) {
    if (published) return;
    setLeadComment(next);
    leadCommentDirty.current = true;
    if (leadCommentTimeout.current) clearTimeout(leadCommentTimeout.current);
    leadCommentTimeout.current = setTimeout(saveLeadComment, 800);
  }

  function markTouched(skillId: number) {
    setTouched((prev) => {
      if (prev.has(skillId)) return prev;
      const next = new Set(prev);
      next.add(skillId);
      return next;
    });
  }

  function setMastery(skillId: number, level: number) {
    if (published) return;
    setScores((prev) => ({ ...prev, [skillId]: level }));
    pendingScores.current.push({ skillId, masteryLevel: level });
    markTouched(skillId);

    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(doSave, 800);
  }

  function toggleFlag(skillId: number) {
    if (published) return;
    setFlags((prev) => {
      const next = !prev[skillId];
      const out = { ...prev };
      if (next) out[skillId] = true;
      else delete out[skillId];
      pendingScores.current.push({ skillId, flagged: next });
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(doSave, 500);
      return out;
    });
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
    // Сначала добиваем все pending-правки. Если автосейв провалился —
    // pendingScores не очищается. В этом случае публиковать с неактуальными
    // scores нельзя (юзер потеряет последние клики), поэтому показываем
    // ошибку и возвращаем управление.
    if (pendingScores.current.length > 0) {
      await doSave();
      if (pendingScores.current.length > 0) {
        alert(
          'Не удалось сохранить последние правки оценок — публикация отменена. ' +
            'Проверь интернет и нажми «Опубликовать» ещё раз.',
        );
        return;
      }
    }
    // То же для leadComment — иначе свежий текст «мнения лида» не попадёт.
    if (leadCommentDirty.current) {
      await saveLeadComment();
      if (leadCommentDirty.current) {
        alert(
          'Не удалось сохранить «Мнение лида» — публикация отменена. ' +
            'Попробуй ещё раз.',
        );
        return;
      }
    }

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
    <div className="max-w-[1240px] mx-auto px-8 pt-8 pb-16">
      {/* Breadcrumb + header */}
      <div className="text-xs text-stone mb-3">
        <a href="/admin/users" className="hover:text-ink transition-colors">
          Команда
        </a>
        <span className="text-ash mx-1.5">/</span>
        <span>{designer.fullName}</span>
      </div>
      <div className="flex items-end justify-between gap-8 mb-6 animate-fade-up">
        <div className="flex items-center gap-4 min-w-0">
          <Avatar
            name={designer.fullName}
            avatarUrl={designer.avatarUrl}
            size={64}
          />
          <div className="min-w-0">
            <h1 className="font-display text-4xl font-medium tracking-tight mb-2">
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
            {saveStatus === 'error' ? (
              <span className="text-xs text-blaze font-medium">
                не сохранилось — обнови страницу
              </span>
            ) : (
              <span
                className={`text-xs text-stone transition-opacity ${
                  saveStatus === 'saved' ? 'opacity-100' : 'opacity-0'
                }`}
              >
                сохранено
              </span>
            )}
            {!discardArmed ? (
              <button
                type="button"
                onClick={armDiscard}
                className="btn-ghost-danger"
              >
                Удалить черновик
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDiscard}
                className="btn-danger"
              >
                Точно удалить?
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
                const taxFlagged = taxSkills.filter(
                  (s) => flags[s.id],
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
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <span className="text-sm group-hover:text-ink transition-colors min-w-0 truncate">
                        {tax.taxName}
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {taxFlagged > 0 && (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] text-blaze font-medium tabular-nums"
                            title="Помечено к возврату"
                          >
                            <FlagIcon className="w-3 h-3" />
                            {taxFlagged}
                          </span>
                        )}
                        <span className="text-[11px] text-ash font-medium tabular-nums">
                          {taxFilled}/{taxSkills.length}
                        </span>
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
              <span className="font-display text-3xl font-medium tabular-nums">
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
                  <div className="text-base font-medium text-ink">
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
                        flagged={!!flags[skill.id]}
                        touched={touched.has(skill.id)}
                        onSetLevel={(lvl) => setMastery(skill.id, lvl)}
                        onToggleFlag={() => toggleFlag(skill.id)}
                        disabled={published}
                        self={selfBySkill[skill.id] ?? null}
                        evidences={evidencesBySkill[skill.id] ?? []}
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
                  <div className="text-base font-medium text-ink leading-tight">
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

            {/* Дубль кнопок публикации/отмены в конце формы — после
                длинной прокрутки удобнее иметь действия под рукой,
                не возвращаясь в шапку. */}
            {!published && (
              <div className="flex items-center justify-end gap-3 pt-2">
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
                    Удалить черновик
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleDiscard}
                    className="btn-danger"
                  >
                    Точно удалить?
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
        </main>

        {/* RIGHT: live calc */}
        <aside className="col-span-3">
          <div className="sticky top-20 space-y-3">
            <div className="card p-6">
              <div className="text-[11px]  text-stone mb-1.5">
                Прогноз грейда
              </div>
              <div className="font-display text-4xl font-medium tracking-tight mb-2">
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
                <span className="font-display text-3xl font-medium tabular-nums">
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
  flagged,
  touched,
  onSetLevel,
  onToggleFlag,
  disabled,
  self,
  evidences,
}: {
  skill: SkillData;
  currentLevel: number;
  flagged: boolean;
  touched: boolean;
  onSetLevel: (level: number) => void;
  onToggleFlag: () => void;
  disabled: boolean;
  /** Phase 14: самооценка дизайнера (null — не ставил). */
  self: SelfInfo | null;
  evidences: EvidenceInfo[];
}) {
  return (
    <article
      className={`px-6 py-5 border-b border-cloud last:border-b-0 transition-colors ${
        flagged ? 'bg-blaze/5' : ''
      }`}
    >
      {/* Header: чек-сессии · имя · CORE · вес · флаг */}
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        {touched && !disabled && (
          <span
            className="text-emerald shrink-0"
            title="Уровень изменён в этой сессии"
            aria-label="Изменено в этой сессии"
          >
            <CheckIcon className="w-3.5 h-3.5" />
          </span>
        )}
        <span className="font-medium text-sm">{skill.name}</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-pill tracking-wide font-medium ${
            skill.type === 'CORE' ? 'bg-ink text-snow' : 'bg-cloud/60 text-stone'
          }`}
        >
          {skill.type}
        </span>
        <span className="text-xs text-stone">{skill.weight} вес</span>
        {/* Phase 14: самооценка. Тон — по расхождению с ТЕКУЩИМ выбором
            лида: выше выбора — sunset («переоценка?»), ниже — sky
            («скромничает?»), совпадает/не выбрано — нейтральный glass. */}
        {self && (
          <span
            className={`chip shrink-0 ${
              currentLevel === 0
                ? 'bg-snow/60 border border-cloud/40 text-ink'
                : self.level > currentLevel
                  ? 'bg-sunset/10 border border-sunset/25 text-sunset'
                  : self.level < currentLevel
                    ? 'bg-sky/10 border border-sky/25 text-sky'
                    : 'bg-emerald/10 border border-emerald/25 text-emerald'
            }`}
            title={`Самооценка от ${formatSelfDate(self.updatedAt)}${
              self.comment ? ` — ${self.comment}` : ''
            }`}
          >
            Сам: {self.level}
          </span>
        )}
        {!disabled && (
          <button
            type="button"
            onClick={onToggleFlag}
            className={`ml-auto w-7 h-7 -mr-1 flex items-center justify-center rounded-pill transition-colors ${
              flagged
                ? 'text-blaze bg-blaze/10 hover:bg-blaze/20'
                : 'text-ash hover:text-blaze hover:bg-blaze/10'
            }`}
            title={
              flagged
                ? 'Снять пометку — навык не требует возврата'
                : 'Пометить, чтобы вернуться позже'
            }
            aria-label={flagged ? 'Снять пометку' : 'Пометить навык'}
          >
            <FlagIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Описание навыка */}
      {skill.description && (
        <div className="text-sm text-stone leading-relaxed mb-4">
          {skill.description}
        </div>
      )}

      {/* Phase 14: комментарий дизайнера к самооценке */}
      {self?.comment && (
        <div className="text-xs text-stone leading-relaxed mb-3">
          <span className="text-ash">Комментарий к самооценке:</span>{' '}
          {self.comment}
        </div>
      )}

      {/* Phase 14: ссылки-подтверждения дизайнера */}
      {evidences.length > 0 && <EvidenceDisclosure evidences={evidences} />}

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

/** Phase 14: раскрывашка «Подтверждения (N)» в карточке навыка. */
function EvidenceDisclosure({ evidences }: { evidences: EvidenceInfo[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs text-sky hover:underline"
      >
        Подтверждения ({evidences.length})
        <ChevronDownIcon
          className={`w-3 h-3 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {evidences.map((ev) => (
            <div key={ev.id} className="flex items-baseline gap-2 text-xs min-w-0">
              <a
                href={ev.url}
                target="_blank"
                rel="noreferrer"
                className="text-sky hover:underline truncate"
                title={ev.url}
              >
                {ev.title}
              </a>
              {ev.description && (
                <span className="text-stone truncate">— {ev.description}</span>
              )}
              <span className="text-ash whitespace-nowrap ml-auto shrink-0">
                {formatSelfDate(ev.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** «11 июля 2026» для дат самооценки/подтверждений. */
function formatSelfDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
