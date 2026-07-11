'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';
import { GRADE_NAMES } from '@/lib/types';
import type { BuildCode, GradeCode } from '@/lib/types';
import Avatar from '@/components/Avatar';
import { ChevronDownIcon, InfoIcon } from '@/components/icons';
import { EditableMarkdownBlock } from '@/components/Markdown';
import ProjectsField from '@/components/ProjectsField';
import PerformanceDashboard from '@/components/performance/PerformanceDashboard';
import ChecklistsSection from '@/components/checklists/ChecklistsSection';
import SectionNav, { type SectionNavItem } from '@/components/SectionNav';
import type { Role } from '@/lib/checklistPermissions';
import { useTheme, CHART_AXIS } from '@/lib/theme';
import TitleAurora from '@/components/TitleAurora';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const TAXONOMY_ORDER = ['UI', 'UX', 'PRD', 'IND', 'RES'];
const TAXONOMY_COLOR: Record<string, string> = {
  UI: '#30d158',   // green
  UX: '#0ea5e9',   // sky blue
  PRD: '#ef4444',  // red
  IND: '#7c3aed',  // violet
  RES: '#f59e0b',  // amber
};

// Phase 14: самооценка + подтверждения (см. design-concepts/phase-14-…md)
type SelfEntry = { level: number; comment: string | null; updatedAt: string };
type EvidenceEntry = {
  id: number;
  url: string;
  title: string;
  description: string | null;
  createdAt: string;
};

export type PortraitData = {
  assessmentId: number;
  designer: {
    fullName: string;
    avatarUrl: string | null;
    buildCode: BuildCode | null;
    buildName: string;
    department: string | null;
    leadName: string | null;
    gradeFloor: GradeCode | null;
  };
  cycle: string;
  publishedAt: string | null;
  effectiveGrade: GradeCode;
  calculatedGrade: GradeCode;
  totalXp: number;
  maxXp: number;
  xpByTaxonomy: Record<string, number>;
  maxXpByTaxonomy: Record<string, number>;
  xpByGroup: Record<string, Record<string, { current: number; max: number }>>;
  nextGrade: {
    code: GradeCode;
    xpNeeded: number;
    failedGates: {
      skillId: number;
      skillName: string;
      requiredMastery: number;
      currentMastery: number;
    }[];
  } | null;
  skills: {
    id: number;
    name: string;
    type: string;
    description: string;
    taxonomyCode: string;
    taxonomyName: string;
    groupName: string;
    weight: number;
    masteryLevel: number;
    maxMasteryLevel: number;
    levelTitle: string | null;
    levels: { level: number; title: string; criteria: string }[];
  }[];
  /** Мнение дизайн-лида/стардиза, оставленное на форме оценки (markdown). */
  leadComment: string | null;
  /** Все опубликованные оценки этого дизайнера — для переключателя циклов. */
  siblings: {
    id: number;
    publishedAt: string | null;
    effectiveGrade: GradeCode | null;
    totalXp: number | null;
  }[];
};

export default function Portrait({
  data,
  actions,
  siblingHrefPrefix,
  canEditLeadComment = false,
  userId,
  initialProjects,
  canEditProjects = false,
  showPerformance = true,
  onTimePercent = null,
  onTimeTotalTasks = 0,
  meRole,
  meUserId,
  canCreateChecklists = false,
  nineBoxTitle = null,
  teamGrowthMedian = null,
}: {
  data: PortraitData;
  /** Кнопки-действия (mgmt): рендерятся по центру под чипами hero. */
  actions?: React.ReactNode;
  /** Префикс URL для переключателя циклов. К нему прицепляется id, чтобы
   *  получился готовый href. Сервер не умеет сериализовать функции в
   *  client-компоненты, поэтому передаём строку.
   *  Пример: `/designer?assessmentId=` → `/designer?assessmentId=42`. */
  siblingHrefPrefix: string;
  /** Может ли текущий пользователь редактировать «Мнение лида»: admin —
   *  всегда; lead, если он ведёт дизайнера; stardiz — если он лид или
   *  стардиз. Дизайнер на своём `/designer` его видит, но не правит. */
  canEditLeadComment?: boolean;
  /** Id владельца портрета — нужен для PUT /api/users/[id]/projects. */
  userId: number;
  /** Проекты, которые уже выбрал пользователь (server-side fetch). */
  initialProjects: { id: number; name: string; category: string }[];
  /** Может ли текущий пользователь редактировать список проектов
   *  (сам владелец или admin). */
  canEditProjects?: boolean;
  /** Если true — показываем блок «Перформанс» (детальный дашборд с задачами)
   *  и чип «В срок» в hero-карточке. На портрете лида (как сотрудника)
   *  передаём false: они не работают руками в трекерах. По умолчанию on. */
  showPerformance?: boolean;
  /** Текущий % попадания в срок за 6 мес (server-side подтянут из ClickHouse).
   *  null = нет данных / ClickHouse недоступен / у пользователя нет email. */
  onTimePercent?: number | null;
  /** Кол-во задач в выборке для onTimePercent — нужно для подписи под чипом. */
  onTimeTotalTasks?: number;
  /** Phase 17 — ИПР. Роль зрителя — нужно для расчёта прав на клиенте. */
  meRole?: Role;
  /** Phase 17 — id зрителя (не owner'а портрета). Нужно для бейджа
   *  «Я» когда зритель сам автор чек-листа. */
  meUserId?: number;
  /** Phase 17 — можно ли текущему пользователю создавать чек-листы
   *  на портрете owner'а. Рассчитано на сервере по
   *  `canCreateChecklistFor(me, target)`. */
  canCreateChecklists?: boolean;
  /** Редизайн v6: подпись позиции 9-Box («Звёзды» и т.п.). Сервер передаёт
   *  ТОЛЬКО когда зритель admin/lead — стардиз и дизайнер её не видят. */
  nineBoxTitle?: string | null;
  /** Медиана прироста XP за цикл по команде. Сервер передаёт только
   *  admin/lead/stardiz — для сравнения скорости роста с командой. */
  teamGrowthMedian?: number | null;
}) {
  const [rowHovered, setRowHovered] = useState(false);
  // Цвета осей радара зависят от темы (CSS до опций chart.js не дотягивается).
  const theme = useTheme();
  const axis = CHART_AXIS[theme];

  // Локальное состояние «Мнения лида» — нужно для оптимистичного
  // обновления карточки после сохранения. Иначе пришлось бы делать
  // router.refresh() и весь портрет перерисовывался бы.
  const [leadComment, setLeadComment] = useState<string>(data.leadComment ?? '');

  // Phase 14: самооценка и подтверждения. null = ещё не загружено или
  // нет прав (403) — UI просто не показывается. Правит только владелец.
  const isSelfOwner = meUserId === userId && meRole === 'designer';
  const [selfMap, setSelfMap] = useState<Record<number, SelfEntry> | null>(null);
  const [evidenceMap, setEvidenceMap] = useState<Record<number, EvidenceEntry[]>>({});
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/${userId}/self-assessment`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const sm: Record<number, SelfEntry> = {};
        for (const sa of d.selfAssessments) {
          sm[sa.skillId] = {
            level: sa.level,
            comment: sa.comment,
            updatedAt: sa.updatedAt,
          };
        }
        const em: Record<number, EvidenceEntry[]> = {};
        for (const ev of d.evidences) {
          (em[ev.skillId] ??= []).push(ev);
        }
        setSelfMap(sm);
        setEvidenceMap(em);
      })
      .catch(() => {
        // самооценка опциональна — портрет работает и без неё
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function setSelfLevel(skillId: number, level: number | null) {
    if (!isSelfOwner || !selfMap) return;
    if (level === null) {
      const res = await fetch(`/api/users/${userId}/self-assessment/${skillId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSelfMap((m) => {
          if (!m) return m;
          const next = { ...m };
          delete next[skillId];
          return next;
        });
      }
      return;
    }
    const res = await fetch(`/api/users/${userId}/self-assessment/${skillId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, comment: selfMap[skillId]?.comment ?? null }),
    });
    if (res.ok) {
      const sa = await res.json();
      setSelfMap((m) => (m ? { ...m, [skillId]: sa } : m));
    }
  }

  async function saveSelfComment(skillId: number, comment: string) {
    if (!isSelfOwner || !selfMap) return;
    const cur = selfMap[skillId];
    if (!cur) return;
    const trimmed = comment.trim();
    if ((cur.comment ?? '') === trimmed) return;
    const res = await fetch(`/api/users/${userId}/self-assessment/${skillId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: cur.level, comment: trimmed || null }),
    });
    if (res.ok) {
      const sa = await res.json();
      setSelfMap((m) => (m ? { ...m, [skillId]: sa } : m));
    }
  }

  async function addEvidence(
    skillId: number,
    payload: { url: string; title: string; description?: string },
  ): Promise<boolean> {
    if (!isSelfOwner) return false;
    const res = await fetch(`/api/users/${userId}/skill-evidence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillId, ...payload }),
    });
    if (!res.ok) return false;
    const ev = await res.json();
    setEvidenceMap((m) => ({ ...m, [skillId]: [ev, ...(m[skillId] ?? [])] }));
    return true;
  }

  async function removeEvidence(skillId: number, evidenceId: number) {
    if (!isSelfOwner) return;
    const res = await fetch(`/api/skill-evidence/${evidenceId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setEvidenceMap((m) => ({
        ...m,
        [skillId]: (m[skillId] ?? []).filter((e) => e.id !== evidenceId),
      }));
    }
  }

  // Список таксономий, по которым у дизайнера есть навыки — для меню
  // быстрой навигации внизу. Порядок фиксированный.
  const presentTaxonomies = useMemo(
    () => TAXONOMY_ORDER.filter((code) => data.skills.some((s) => s.taxonomyCode === code)),
    [data.skills],
  );

  // Pavel: на портретах ребят из билда Инхаус (`creator`) блок «Перформанс»
  // и якорь в нав-плашке прячем — у них нет данных в трекерах, дашборд
  // всегда пустой. Чип «В срок» в шапке уже сам решает не рисоваться
  // для `creator` (см. OnTimeChip).
  const showPerformanceForBuild =
    showPerformance && data.designer.buildCode !== 'creator';

  const navSections: SectionNavItem[] = useMemo(
    () => [
      { id: 'stats', label: 'Статистика' },
      // Проекты — сразу после статистики (Pavel: «в навигации после
      // Статистика»). Якорь добавляется только если есть что
      // показать или можно редактировать.
      ...(canEditProjects || initialProjects.length > 0
        ? [{ id: 'projects', label: 'Проекты' }]
        : []),
      // Перформанс показываем сразу после Проектов — это второй «человеческий»
      // блок, ещё до разбора по навыкам. Для Инхауса скрываем — данных нет.
      ...(showPerformanceForBuild ? [{ id: 'performance', label: 'Перформанс' }] : []),
      // «Выводы» — это блок «Мнение дизайн-лида / стардиза». Лейбл короткий,
      // как просил Pavel.
      { id: 'lead-comment', label: 'Выводы' },
      // ИПР рендерим только если мы (зритель) можем видеть портрет — для
      // того, кому показывают, это true (canCreateChecklists для дизайнера
      // = true, потому что себе можно). Если meRole не передан вовсе —
      // секцию не показываем (legacy-вызовы).
      ...(meRole ? [{ id: 'ipr', label: 'ИПР' }] : []),
      ...presentTaxonomies.map((code) => ({ id: `tax-${code}`, label: code })),
    ],
    [
      presentTaxonomies,
      canEditProjects,
      initialProjects.length,
      showPerformanceForBuild,
      meRole,
    ],
  );

  const xpProgress = data.maxXp > 0 ? Math.round((data.totalXp / data.maxXp) * 100) : 0;
  const isFloorActive =
    !!data.designer.gradeFloor && data.calculatedGrade !== data.effectiveGrade;

  // Хронология published-циклов (для дельты «+N за цикл» и графика роста).
  const sortedSibs = useMemo(
    () =>
      [...data.siblings]
        .filter((s) => s.publishedAt)
        .sort((a, b) => (a.publishedAt! < b.publishedAt! ? -1 : 1)),
    [data.siblings],
  );
  const cycleDelta = useMemo(() => {
    const idx = sortedSibs.findIndex((s) => s.id === data.assessmentId);
    if (idx <= 0) return null;
    const prev = sortedSibs[idx - 1].totalXp;
    return prev == null ? null : data.totalXp - prev;
  }, [sortedSibs, data.assessmentId, data.totalXp]);

  // Main radar — absolute XP per taxonomy, current + max overlay
  const labels = TAXONOMY_ORDER;
  const currentValues = TAXONOMY_ORDER.map((c) => data.xpByTaxonomy[c] ?? 0);
  const maxValues = TAXONOMY_ORDER.map((c) => data.maxXpByTaxonomy[c] ?? 0);

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Максимум',
        data: maxValues,
        // Светло-серая заливка под пунктиром, чтобы силуэт «потолка»
        // читался без необходимости упирать взгляд в линию.
        backgroundColor: 'rgba(110,110,115,0.18)',
        borderColor: '#6e6e73',
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointBackgroundColor: '#6e6e73',
        pointBorderColor: '#6e6e73',
        pointRadius: 2,
      },
      {
        label: `Текущий (${data.designer.fullName.split(' ')[0]})`,
        data: currentValues,
        backgroundColor: 'rgba(213,255,12,0.16)',
        borderColor: '#d5ff0c',
        borderWidth: 2,
        pointBackgroundColor: '#d5ff0c',
        pointBorderColor: '#d5ff0c',
        pointRadius: 4,
      },
    ],
  };

  const chartOptions = {
    scales: {
      r: {
        suggestedMin: 0,
        ticks: { color: axis.tick, backdropColor: 'transparent', font: { size: 10 } },
        grid: { color: axis.grid },
        angleLines: { color: axis.grid },
        pointLabels: {
          font: { size: 14, family: 'Onest', weight: 500 as const },
          color: axis.label,
        },
      },
    },
    plugins: { legend: { display: false } },
    maintainAspectRatio: false,
  };

  // Group skills by taxonomy → group
  const grouped = new Map<string, Map<string, typeof data.skills>>();
  for (const s of data.skills) {
    if (!grouped.has(s.taxonomyCode)) grouped.set(s.taxonomyCode, new Map());
    const taxMap = grouped.get(s.taxonomyCode)!;
    if (!taxMap.has(s.groupName)) taxMap.set(s.groupName, []);
    taxMap.get(s.groupName)!.push(s);
  }

  return (
    <main className="max-w-[1180px] mx-auto px-8 pt-[164px] pb-16">
      {/* Карточка-баннер временно скрыта — Pavel вернёт когда будут
          готовы upload картинки и зелёные полосы для лидов (PRD §11.16).
          Компонент остаётся в src/components/PortraitBanner.tsx. */}
      {/* <PortraitBanner
        fullName={data.designer.fullName}
        role="designer"
        grade={data.effectiveGrade}
        buildCode={data.designer.buildCode}
      /> */}

      {/* Hero по центру (концепт v6): аватар → имя → чипы. Грейд — первый
          белый чип, выбор цикла — дропдаун-чип в том же ряду. Дата публикации
          переехала в XP-плашку bento. */}
      <div className="mb-[164px] flex flex-col items-center text-center animate-fade-up title-halo">
        <TitleAurora />
        {/* Аватар без кольца (Pavel: обводки вокруг аватарок убраны везде),
            бейдж «N% XP» остаётся */}
        <Avatar
          name={data.designer.fullName}
          avatarUrl={data.designer.avatarUrl}
          size={96}
        />
        <h1 className="font-display text-[44px] leading-tight font-medium tracking-tight mt-6">
          {data.designer.fullName}
        </h1>
        <div className="flex items-center justify-center gap-1 flex-wrap mt-3.5">
          <span className="chip bg-ink text-snow">
            {GRADE_NAMES[data.effectiveGrade]}
          </span>
          {/* Позиция 9-Box — сервер передаёт только admin/lead */}
          {nineBoxTitle && (
            <span className="chip bg-lime text-black">{nineBoxTitle} · 9-Box</span>
          )}
          {data.designer.buildCode && (
            <span className="chip bg-snow/60 backdrop-blur-md border border-cloud/40 text-ink">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background:
                    data.designer.buildCode === 'creator'
                      ? '#00ca48'
                      : data.designer.buildCode === 'visioner'
                        ? '#7c3aed'
                        : '#0ea5e9',
                }}
              />
              {data.designer.buildName}
            </span>
          )}
          {data.designer.leadName && (
            <span className="chip bg-snow/60 backdrop-blur-md border border-cloud/40 text-ink">
              Лид: {data.designer.leadName}
            </span>
          )}
          {data.siblings.length > 1 ? (
            <CyclesSwitcher
              siblings={data.siblings}
              currentId={data.assessmentId}
              hrefPrefix={siblingHrefPrefix}
            />
          ) : (
            <span className="chip bg-snow/60 backdrop-blur-md border border-cloud/40 text-ink">
              {data.publishedAt ? formatPublishedDate(data.publishedAt) : 'Черновик'}
            </span>
          )}
        </div>
      </div>

      {/* === Статистика: grade-card, taxonomy-cards, radar, next-gate === */}
      <section id="stats" className="scroll-mt-24">

      {/* Действия — по центру, вплотную к карточкам bento (Pavel) */}
      {(actions || isSelfOwner) && (
        <div
          className="flex items-center justify-center gap-1 flex-wrap mb-5 animate-fade-up"
          style={{ animationDelay: '60ms' }}
        >
          {actions}
          {/* Phase 14: владельцу — быстрый переход к самооценке навыков */}
          {isSelfOwner && (
            <button
              type="button"
              onClick={scrollToSkills}
              title="Отметь уровни владения навыками и приложи ссылки-подтверждения — лид увидит их при грейдировании. На XP и грейд самооценка не влияет."
              className="inline-flex items-center rounded-pill px-4 h-9 text-sm text-ink
                         bg-snow/60 backdrop-blur-md border border-cloud/40
                         hover:bg-snow/80 transition-colors"
            >
              Добавить самооценку
            </button>
          )}
        </div>
      )}

      {/* Bento (концепт v6): XP · В срок · 9-Box (admin/lead) / Скорость
          роста (stardiz/designer) · Гейты. Заменяет прежнюю grade-карточку —
          сам грейд теперь чипом в hero. */}
      <div
        className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6 animate-fade-up"
        style={{ animationDelay: '80ms' }}
      >
        {/* XP: цифра, дельта за цикл, до следующего грейда, бар, дата публикации */}
        {/* Единая анатомия карточек (как bento «Команды»): label → крупное
            число 44px → описание → бар, прижатый к низу. */}
        <div className="card p-5 flex flex-col min-h-[188px]">
          <div className="label-mono text-stone">Общий XP</div>
          <div className="font-display text-[44px] leading-none font-medium tracking-tight mt-3">
            {data.totalXp}
            <span className="text-lg text-ash font-normal"> / {data.maxXp}</span>
          </div>
          <div className="text-xs text-stone mt-2">
            {cycleDelta !== null && (
              <span
                className={
                  cycleDelta >= 0 ? 'text-emerald font-medium' : 'text-blaze font-medium'
                }
              >
                {cycleDelta >= 0 ? '+' : ''}
                {cycleDelta} за цикл
              </span>
            )}
            {cycleDelta !== null && data.nextGrade && ' · '}
            {data.nextGrade && (
              <>
                до {GRADE_NAMES[data.nextGrade.code]} ещё{' '}
                <b className="text-ink font-medium">{data.nextGrade.xpNeeded} XP</b>
              </>
            )}
          </div>
          {isFloorActive && (
            <div className="text-[11px] text-sunset mt-1">
              Грейд зафиксирован — расчёт дал {GRADE_NAMES[data.calculatedGrade]}
            </div>
          )}
          <div className="h-1 bg-cloud rounded-full overflow-hidden mt-auto">
            <div
              className="h-full bg-emerald rounded-full transition-all"
              style={{ width: `${Math.min(xpProgress, 100)}%` }}
            />
          </div>
        </div>

        {/* В срок — та же анатомия: число, описание, бар в цвете зоны */}
        <div className="card p-5 flex flex-col min-h-[188px]">
          <div className="label-mono text-stone">В срок · 6 мес</div>
          {showPerformanceForBuild && onTimePercent !== null ? (
            <>
              <div className="font-display text-[44px] leading-none font-medium tracking-tight mt-3">
                {Math.round(onTimePercent)}%
              </div>
              <div className="text-xs text-stone mt-2">
                {onTimeTotalTasks} задач в выборке ·{' '}
                <span
                  className={
                    onTimePercent >= 85
                      ? 'text-emerald font-medium'
                      : onTimePercent >= 70
                        ? 'text-sunset font-medium'
                        : 'text-blaze font-medium'
                  }
                >
                  цель 85%{onTimePercent >= 85 ? ' — есть' : ''}
                </span>
              </div>
              <div className="h-1 bg-cloud rounded-full overflow-hidden mt-auto">
                <div
                  className={`h-full rounded-full ${
                    onTimePercent >= 85
                      ? 'bg-emerald'
                      : onTimePercent >= 70
                        ? 'bg-sunset'
                        : 'bg-blaze'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, Math.round(onTimePercent)))}%` }}
                />
              </div>
            </>
          ) : (
            <div className="text-sm text-ash mt-3">
              {data.designer.buildCode === 'creator'
                ? 'Инхаус — задачи не трекаются'
                : 'нет данных по задачам'}
            </div>
          )}
        </div>

        {/* 9-Box (только admin/lead) либо «Скорость роста» */}
        {nineBoxTitle ? (
          <div className="card p-5 flex flex-col min-h-[188px]">
            <div className="label-mono text-stone">Позиция · 9-Box</div>
            <div className="font-display text-2xl font-medium tracking-tight mt-3">
              {nineBoxTitle}
            </div>
            <div className="text-xs text-stone mt-2">только лид и админ</div>
          </div>
        ) : (
          <GrowthCell sibs={sortedSibs} />
        )}

        {/* Гейты следующего грейда */}
        <div className="card p-5 flex flex-col min-h-[188px]">
          <div className="label-mono text-stone">
            {data.nextGrade ? `Гейты до «${GRADE_NAMES[data.nextGrade.code]}»` : 'Гейты'}
          </div>
          {data.nextGrade ? (
            data.nextGrade.failedGates.length === 0 ? (
              <div className="text-sm text-emerald mt-3 font-medium">
                Все гейты пройдены
              </div>
            ) : (
              <div className="mt-3 space-y-2.5">
                {data.nextGrade.failedGates.slice(0, 2).map((g) => (
                  <div key={g.skillId} className="text-xs">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-stone truncate">{g.skillName}</span>
                      <span className="text-ash whitespace-nowrap">
                        {g.currentMastery} → {g.requiredMastery}
                      </span>
                    </div>
                    <div className="h-1 bg-cloud rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sunset rounded-full"
                        style={{
                          width: `${Math.round((g.currentMastery / g.requiredMastery) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
                {data.nextGrade.failedGates.length > 2 && (
                  <div className="text-[11px] text-ash">
                    + ещё {data.nextGrade.failedGates.length - 2} в разборе навыков ниже
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="text-sm text-ash mt-3">Максимальный грейд</div>
          )}
        </div>
      </div>

      {/* Taxonomy progress cards (hovering anywhere reveals the full group breakdown row) */}
      <div
        onMouseEnter={() => setRowHovered(true)}
        onMouseLeave={() => setRowHovered(false)}
        className="mb-3 animate-fade-up"
        style={{ animationDelay: '140ms' }}
      >
        <div className="grid grid-cols-5 gap-3">
          {TAXONOMY_ORDER.map((code) => {
            const got = data.xpByTaxonomy[code] ?? 0;
            const max = data.maxXpByTaxonomy[code] ?? 0;
            const pct = max > 0 ? Math.round((got / max) * 100) : 0;
            const color = TAXONOMY_COLOR[code];
            return (
              <div
                key={code}
                className={`bg-snow border rounded-card px-5 py-4 transition-all duration-200 ${
                  rowHovered
                    ? 'border-ash shadow-soft-md'
                    : 'border-cloud shadow-soft'
                }`}
              >
                <div className="label-mono text-stone mb-1.5">
                  {code}
                </div>
                <div className="font-display text-2xl font-medium tabular-nums mb-2">
                  {got}
                  <span className="text-sm text-stone font-normal ml-1">из {max}</span>
                </div>
                <div className="h-1 bg-cloud rounded-full overflow-hidden mb-1">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      background: color,
                    }}
                  />
                </div>
                <div className="text-xs text-stone tabular-nums">{pct}%</div>
              </div>
            );
          })}
        </div>

        {/* Hover strip — group breakdown for ALL taxonomies */}
        <div
          className={`overflow-hidden transition-all duration-200 ease-apple-out ${
            rowHovered ? 'max-h-[400px] mt-3' : 'max-h-0 mt-0'
          }`}
        >
          <div className="card p-5">
            <div className="text-[11px]  text-stone mb-4">
              Группы внутри — % от максимума
            </div>
            <div className="grid grid-cols-5 gap-4">
              {TAXONOMY_ORDER.map((code) => (
                <div key={code}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: TAXONOMY_COLOR[code] }}
                    />
                    <span className="label-mono text-stone">
                      {code}
                    </span>
                  </div>
                  {data.xpByGroup[code] ? (
                    <GroupBreakdown
                      groups={data.xpByGroup[code]}
                      color={TAXONOMY_COLOR[code]}
                      compact
                    />
                  ) : (
                    <div className="text-xs text-ash italic">нет данных</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Профиль навыков + динамика роста (концепт v6, duo) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-8">
        <div className="card p-6">
          <div className="text-base font-medium">Профиль навыков</div>
          <div className="text-xs text-stone mt-0.5 mb-4">
            текущий уровень против потолка билда
          </div>
          <div className="flex items-center gap-5 mb-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-lime" />
              <span className="text-ink font-medium">
                {data.designer.fullName.split(' ')[0]}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm border border-dashed border-ash bg-ash/20" />
              <span className="text-stone">Максимум ({data.designer.buildName})</span>
            </span>
          </div>
          <div style={{ height: 320 }}>
            <Radar data={chartData} options={chartOptions} />
          </div>
        </div>
        <GrowthPanel
          sibs={sortedSibs}
          currentId={data.assessmentId}
          firstName={data.designer.fullName.split(' ')[0]}
          teamGrowthMedian={teamGrowthMedian}
        />
      </div>

      {/* Отдельная карточка «До грейда» упразднена (v6): XP-плашка и ячейка
          «Гейты» в bento покрывают её содержимое. */}

      </section>
      {/* /Статистика */}

      {/* Проекты — справочник М:N. Pavel: «над "Мнение лида"». */}
      <section id="projects" className="scroll-mt-24">
        <ProjectsField
          userId={userId}
          initialProjects={initialProjects}
          canEdit={canEditProjects}
        />
      </section>

      {/* Мой перформанс — данные из ClickHouse (collab + manage tracker).
          Лениво подтягивается на клиенте: server-side тянуть запрос нет
          смысла, он тяжёлый и блокировал бы рендер всего портрета.
          Для Инхауса (`creator`) — скрываем целиком, у них нет трекаемых
          задач, дашборд всегда был бы пустым. */}
      {showPerformanceForBuild && (
        <section id="performance" className="scroll-mt-24">
          <PerformanceDashboard userId={userId} />
        </section>
      )}

      {/* Мнение дизайн-лида / стардиза — аналог CDO-блока у лидов.
          Pavel попросил вывести его ПЕРЕД блоком «Навыки», чтобы дизайнер
          сначала видел человеческий контекст, потом разбор по навыкам.
          Редактирование доступно admin/lead/stardiz прямо с портрета
          (без перехода на форму оценки). Якорь `lead-comment` ведёт
          сюда из SectionNav (лейбл «Выводы»). */}
      <section id="lead-comment" className="scroll-mt-24">
        <EditableMarkdownBlock
          title="Мнение дизайн-лида / стардиза"
          badge="Лид"
          value={leadComment}
          canEdit={canEditLeadComment}
          emptyLabel="Лид ещё не оставил мнения к этой оценке"
          onSave={async (next) => {
            const res = await fetch('/api/assessments', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                assessmentId: data.assessmentId,
                leadComment: next,
              }),
            });
            if (res.ok) {
              setLeadComment(next);
              return true;
            }
            return false;
          }}
        />
      </section>

      {/* ИПР — чек-листы. Phase 17. Рендерим если зритель имеет meRole
          (т.е. это аутентифицированный пользователь — что должно быть
          всегда). Серверная проверка прав ещё раз сделает то же самое. */}
      {meRole && meUserId !== undefined && (
        <section id="ipr" className="scroll-mt-24">
          <ChecklistsSection
            ownerId={userId}
            me={{ id: meUserId, role: meRole }}
            canCreate={canCreateChecklists}
          />
        </section>
      )}

      {/* Skills grouped — accordions, стиль как у формы оценки */}
      <div id="skills" className="space-y-5 scroll-mt-24">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-medium tracking-tight">Навыки</h2>
          {/* Phase 14: тихий прогресс самооценки + информер-инструкция */}
          {selfMap && (isSelfOwner || Object.keys(selfMap).length > 0) && (
            <span className="inline-flex items-center gap-1.5 text-xs text-stone">
              Самооценка: {Object.keys(selfMap).length} из {data.skills.length}
              <SelfAssessmentInfo />
            </span>
          )}
        </div>
        {TAXONOMY_ORDER.filter((code) => grouped.has(code)).map((code) => {
          const taxMap = grouped.get(code)!;
          const taxName =
            data.skills.find((s) => s.taxonomyCode === code)?.taxonomyName ?? code;
          const taxXp = data.xpByTaxonomy[code] ?? 0;
          return (
            <section
              key={code}
              id={`tax-${code}`}
              className="card overflow-hidden scroll-mt-24"
            >
              <div className="px-6 py-3.5 border-b border-cloud bg-canvas/60 flex items-baseline justify-between">
                <div className="text-base font-medium text-ink">{taxName}</div>
                <div className="text-xs text-stone tabular-nums">{taxXp} XP</div>
              </div>
              {Array.from(taxMap.entries()).map(([groupName, skills], gIdx) => (
                <div
                  key={groupName}
                  className={gIdx > 0 ? 'border-t border-cloud' : ''}
                >
                  <div className="px-6 pt-5 pb-2 text-sm font-medium text-stone">
                    {groupName}
                  </div>
                  {skills.map((s) => (
                    <SkillAccordion
                      key={s.id}
                      skill={s}
                      self={selfMap ? selfMap[s.id] ?? null : null}
                      selfLoaded={selfMap !== null}
                      evidences={evidenceMap[s.id] ?? []}
                      canEditSelf={isSelfOwner}
                      onSetSelfLevel={setSelfLevel}
                      onSaveSelfComment={saveSelfComment}
                      onAddEvidence={addEvidence}
                      onRemoveEvidence={removeEvidence}
                    />
                  ))}
                </div>
              ))}
            </section>
          );
        })}
      </div>

      {/* Sticky-навигация по разделам (заменила floating-свитчер циклов) */}
      <SectionNav sections={navSections} />
    </main>
  );
}

// Дата публикации в переключателе циклов — в формате «13 мая 2026»
// (без «г.», полный год). Стандартный toLocaleDateString'ru-RU всегда
// прицепляет «г.» в конце, поэтому собираем строку вручную.
const MONTHS_RU = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

function formatPublishedDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Выбор цикла — дропдаун-чип в ряду тегов hero (концепт v6, раньше был
 * сегмент-баром). Закрывается по клику вне и по переходу.
 */
function CyclesSwitcher({
  siblings,
  currentId,
  hrefPrefix,
}: {
  siblings: PortraitData['siblings'];
  currentId: number;
  hrefPrefix: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const current = siblings.find((s) => s.id === currentId);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="chip bg-snow/60 backdrop-blur-md border border-cloud/40 text-ink cursor-pointer hover:bg-snow/80 transition-colors"
      >
        {current?.publishedAt ? formatPublishedDate(current.publishedAt) : `#${currentId}`}
        <ChevronDownIcon
          className={`w-3 h-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-30 card p-1.5 min-w-[210px] shadow-soft-lg animate-scale-in text-left">
          {siblings.map((s) => (
            <Link
              key={s.id}
              href={`${hrefPrefix}${s.id}`}
              className={`flex items-center justify-between gap-3 px-3 py-2 rounded-[10px] text-xs transition-colors ${
                s.id === currentId
                  ? 'bg-cloud/60 text-ink font-medium'
                  : 'text-stone hover:bg-canvas hover:text-ink'
              }`}
            >
              <span className="whitespace-nowrap">
                {s.publishedAt ? formatPublishedDate(s.publishedAt) : `#${s.id}`}
              </span>
              <span className="text-ash whitespace-nowrap">
                {s.effectiveGrade ? GRADE_NAMES[s.effectiveGrade] : ''}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Ячейка «Скорость роста» — вместо 9-Box для стардиза и самого дизайнера.
 * Циклы, путь по грейдам и длительность.
 */
function GrowthCell({ sibs }: { sibs: PortraitData['siblings'] }) {
  const n = sibs.length;
  const pts = sibs.filter((s) => s.totalXp != null);
  // Средний прирост XP за цикл — та же метрика, что «Скорость роста ·
  // медиана» в bento «Команды»: единая анатомия карточек (44px число).
  const avg =
    pts.length >= 2
      ? Math.round(
          (pts[pts.length - 1].totalXp! - pts[0].totalXp!) / (pts.length - 1),
        )
      : null;
  const first = sibs[0];
  const last = sibs[n - 1];
  let months: number | null = null;
  if (n >= 2 && first.publishedAt && last.publishedAt) {
    const a = new Date(first.publishedAt);
    const b = new Date(last.publishedAt);
    months =
      (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  }
  const cyclesWord = n === 1 ? 'цикл' : n < 5 ? 'цикла' : 'циклов';
  return (
    <div className="card p-5 flex flex-col min-h-[188px]">
      <div className="label-mono text-stone">Скорость роста</div>
      <div className="font-display text-[44px] leading-none font-medium tracking-tight mt-3">
        {n === 0 ? (
          '—'
        ) : avg !== null ? (
          <>
            {avg >= 0 ? '+' : ''}
            {avg}
            <span className="text-lg text-ash font-normal"> XP/цикл</span>
          </>
        ) : (
          <>
            1<span className="text-lg text-ash font-normal"> цикл</span>
          </>
        )}
      </div>
      <div className="text-xs text-stone mt-2 leading-relaxed">
        {n === 0 ? (
          'появится после первой публикации'
        ) : n >= 2 && first.effectiveGrade && last.effectiveGrade ? (
          <>
            {GRADE_NAMES[first.effectiveGrade]} → {GRADE_NAMES[last.effectiveGrade]}
            {months !== null && months > 0 && <> за {months} мес</>} · {n}{' '}
            {cyclesWord}
          </>
        ) : (
          'динамика появится со второго цикла'
        )}
      </div>
    </div>
  );
}

/**
 * Панель «Динамика роста»: XP по published-циклам (SVG, рукописный, как
 * спарклайн в карточке 360). Для admin/lead/stardiz — плашка сравнения
 * с медианой команды (teamGrowthMedian приходит с сервера только им).
 */
function GrowthPanel({
  sibs,
  currentId,
  firstName,
  teamGrowthMedian,
}: {
  sibs: PortraitData['siblings'];
  currentId: number;
  firstName: string;
  teamGrowthMedian: number | null;
}) {
  const pts = sibs.filter((s) => s.totalXp != null);
  // Средний прирост за цикл — для сравнения с медианой команды
  const myAvg =
    pts.length >= 2
      ? Math.round((pts[pts.length - 1].totalXp! - pts[0].totalXp!) / (pts.length - 1))
      : null;
  const vsMedian =
    myAvg !== null && teamGrowthMedian !== null && teamGrowthMedian > 0
      ? Math.round((myAvg / teamGrowthMedian - 1) * 100)
      : null;

  // Геометрия графика
  const W = 480;
  const H = 240;
  const padL = 36;
  const padR = 24;
  const padT = 26;
  const padB = 40;
  const vmax = Math.max(...pts.map((p) => p.totalXp!), 1) * 1.2;
  const X = (i: number) =>
    pts.length === 1
      ? W / 2
      : padL + (i * (W - padL - padR)) / (pts.length - 1);
  const Y = (v: number) => H - padB - (v / vmax) * (H - padT - padB);
  const line = pts
    .map((p, i) => `${i ? 'L' : 'M'} ${X(i).toFixed(1)} ${Y(p.totalXp!).toFixed(1)}`)
    .join(' ');

  return (
    <div className="card p-6 flex flex-col">
      <div className="text-base font-medium">Динамика роста</div>
      <div className="text-xs text-stone mt-0.5 mb-4">
        XP по опубликованным циклам оценки
      </div>
      {vsMedian !== null && (
        <div
          className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-card border mb-4 ${
            vsMedian >= 0
              ? 'bg-emerald/10 border-emerald/25'
              : 'bg-sunset/10 border-sunset/25'
          }`}
        >
          <span
            className={`font-display text-lg font-medium ${
              vsMedian >= 0 ? 'text-emerald' : 'text-sunset'
            }`}
          >
            {vsMedian >= 0 ? '+' : ''}
            {vsMedian}%
          </span>
          <span className="text-xs text-stone">
            к медиане команды ·{' '}
            <b className="text-ink font-medium">
              {myAvg! >= 0 ? '+' : ''}
              {myAvg} XP/цикл
            </b>{' '}
            против +{teamGrowthMedian}
          </span>
        </div>
      )}
      {pts.length < 2 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-ash italic py-10">
          График появится после второго цикла оценки
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full block mt-auto"
          aria-label={`Динамика XP — ${firstName}`}
        >
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line
              key={f}
              x1={padL}
              y1={Y(vmax * f)}
              x2={W - padR}
              y2={Y(vmax * f)}
              stroke="rgb(var(--c-cloud))"
              strokeWidth={1}
            />
          ))}
          <path
            d={`${line} L ${X(pts.length - 1).toFixed(1)} ${H - padB} L ${X(0).toFixed(1)} ${H - padB} Z`}
            fill="rgba(213,255,12,0.10)"
          />
          <path
            d={line}
            fill="none"
            stroke="#d5ff0c"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {pts.map((p, i) => (
            <g key={p.id}>
              <circle
                cx={X(i)}
                cy={Y(p.totalXp!)}
                r={p.id === currentId ? 5 : 3.5}
                fill="#d5ff0c"
                stroke={p.id === currentId ? 'rgb(var(--c-snow))' : 'none'}
                strokeWidth={2}
              />
              <text
                x={X(i)}
                y={Y(p.totalXp!) - 11}
                textAnchor="middle"
                fontSize={11}
                fontWeight={500}
                fill="rgb(var(--c-ink))"
              >
                {p.totalXp}
              </text>
              <text
                x={X(i)}
                y={H - padB + 16}
                textAnchor="middle"
                fontSize={9.5}
                fill="rgb(var(--c-ash))"
              >
                {p.publishedAt ? formatPublishedDate(p.publishedAt).replace(/ \d{4}$/, '') : ''}
              </text>
              <text
                x={X(i)}
                y={H - padB + 29}
                textAnchor="middle"
                fontSize={9}
                fill="rgb(var(--c-stone))"
              >
                {p.effectiveGrade ? GRADE_NAMES[p.effectiveGrade] : ''}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

function GroupBreakdown({
  groups,
  color,
  compact = false,
}: {
  groups: Record<string, { current: number; max: number }>;
  color: string;
  compact?: boolean;
}) {
  const entries = Object.entries(groups);
  // Тема — для цветов осей мини-радара. Хук ДО раннего return (rules-of-hooks).
  const theme = useTheme();
  const axis = CHART_AXIS[theme];
  if (entries.length < 3) {
    // Не радар — горизонтальные бары
    return (
      <div className="space-y-1.5">
        {entries.map(([name, { current, max }]) => {
          const pct = max > 0 ? Math.round((current / max) * 100) : 0;
          return (
            <div key={name} className="text-xs">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-stone truncate">{name}</span>
                <span className="text-stone ml-1 tabular-nums">{pct}%</span>
              </div>
              <div className="h-1.5 bg-canvas rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(pct, 100)}%`, background: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Радар по группам в этой таксономии
  const labels = entries.map(([name]) => name);
  const values = entries.map(([, { current, max }]) =>
    max > 0 ? Math.round((current / max) * 100) : 0,
  );

  // RGBA from hex for fill
  const hexToRgba = (hex: string, a: number) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  const chartData = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: hexToRgba(color, 0.2),
        borderColor: color,
        borderWidth: 2,
        pointBackgroundColor: color,
        pointBorderColor: color,
        pointRadius: 3,
      },
    ],
  };

  const opts = {
    scales: {
      r: {
        suggestedMin: 0,
        suggestedMax: 100,
        ticks: { display: false },
        grid: { color: axis.grid },
        angleLines: { color: axis.grid },
        pointLabels: {
          font: { size: compact ? 9 : 11, family: 'Onest' },
          color: axis.label,
        },
      },
    },
    plugins: { legend: { display: false } },
    maintainAspectRatio: false,
  };

  return (
    <div className="flex justify-center">
      <div
        style={{
          width: compact ? '100%' : 360,
          height: compact ? 180 : 240,
        }}
      >
        <Radar data={chartData} options={opts} />
      </div>
    </div>
  );
}

/** Скролл к разделу «Навыки» с само-коррекцией: блоки выше (перформанс,
 *  чек-листы) догружаются асинхронно и сдвигают якорь — без коррекции
 *  первый клик промахивался. 96px = scroll-mt-24. */
function scrollToSkills() {
  document.getElementById('skills')?.scrollIntoView({ behavior: 'smooth' });
  const correct = () => {
    const el = document.getElementById('skills');
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (Math.abs(top - 96) > 12) {
      window.scrollTo({ top: window.scrollY + top - 96, behavior: 'auto' });
    }
  };
  setTimeout(correct, 700);
  setTimeout(correct, 1400);
}

/** Phase 14: информер «как работает самооценка» — поповер по ховеру. */
function SelfAssessmentInfo() {
  return (
    <span className="relative group/info inline-flex shrink-0">
      <InfoIcon className="w-3.5 h-3.5 text-ash group-hover/info:text-ink cursor-help transition-colors" />
      <span
        className="pointer-events-none absolute right-0 top-full mt-2 w-80 card p-4 z-30
                   text-left text-xs text-stone leading-relaxed shadow-soft-lg
                   opacity-0 translate-y-1 transition-all duration-150
                   group-hover/info:opacity-100 group-hover/info:translate-y-0"
      >
        <span className="block font-medium text-ink mb-1.5">
          Как работает самооценка
        </span>
        Это твой взгляд на владение навыками — референс для лида при
        грейдировании. На XP и грейд не влияет.
        <span className="block mt-1.5">
          1. Раскрой навык и кликни по уровню — появится метка «Моя оценка».
        </span>
        <span className="block mt-1">
          2. Приложи ссылки-подтверждения (Figma, Notion, Loom) кнопкой
          «Добавить».
        </span>
        <span className="block mt-1">
          3. Лид увидит самооценку и материалы в форме оценки, расхождения
          подсветятся — это повод для 1:1.
        </span>
      </span>
    </span>
  );
}

function SkillAccordion({
  skill,
  self,
  selfLoaded,
  evidences,
  canEditSelf,
  onSetSelfLevel,
  onSaveSelfComment,
  onAddEvidence,
  onRemoveEvidence,
}: {
  skill: {
    id: number;
    name: string;
    type: string;
    description: string;
    weight: number;
    masteryLevel: number;
    maxMasteryLevel: number;
    levelTitle: string | null;
    levels: { level: number; title: string; criteria: string }[];
  };
  /** Phase 14: самооценка владельца по этому навыку (null — не ставил). */
  self: SelfEntry | null;
  /** Данные самооценки загружены (иначе секции не рисуем вовсе). */
  selfLoaded: boolean;
  evidences: EvidenceEntry[];
  canEditSelf: boolean;
  onSetSelfLevel: (skillId: number, level: number | null) => void;
  onSaveSelfComment: (skillId: number, comment: string) => void;
  onAddEvidence: (
    skillId: number,
    payload: { url: string; title: string; description?: string },
  ) => Promise<boolean>;
  onRemoveEvidence: (skillId: number, evidenceId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  // Phase 14: форма «Добавить ссылку» и индикатор автосейва комментария
  const [evidenceFormOpen, setEvidenceFormOpen] = useState(false);
  const [commentSaved, setCommentSaved] = useState(true);
  const hasContent = skill.description || skill.levels.length > 0;
  const earnedXp = skill.masteryLevel * skill.weight;
  const maxXp = skill.maxMasteryLevel * skill.weight;

  return (
    <article className="px-6 py-4 border-b border-cloud last:border-b-0">
      {/* Header row: clickable — компактный вид по варианту B Pavel'a:
          имя · текущий уровень-чип · XP earned/max · шеврон.
          CORE/SEC и вес уехали внутрь раскрытого блока. */}
      <button
        type="button"
        onClick={() => hasContent && setOpen((v) => !v)}
        disabled={!hasContent}
        className="w-full flex items-center gap-3 text-left disabled:cursor-default"
      >
        <span className="font-medium text-sm flex-1 min-w-0 truncate">
          {skill.name}
        </span>
        {skill.masteryLevel > 0 && skill.levelTitle ? (
          <span className="chip-neutral shrink-0">{skill.levelTitle}</span>
        ) : (
          <span className="chip-neutral shrink-0 text-ash">Не оценено</span>
        )}
        {/* Phase 14: самооценка — объём опыта из максимума (как «5 / 15»
            справа), с плотной подложкой — glass на карточке терялся */}
        {self && (
          <span className="chip bg-canvas border border-cloud/60 text-ink shrink-0">
            Я: {self.level * skill.weight} / {skill.maxMasteryLevel * skill.weight}
          </span>
        )}
        <span className="text-xs text-stone tabular-nums shrink-0 w-12 text-right">
          {earnedXp} / {maxXp}
        </span>
        {hasContent && (
          <ChevronDownIcon
            className={`w-3.5 h-3.5 text-ash transition-transform duration-150 shrink-0 ${
              open ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>

      {/* Раскрытое: мета (CORE/вес) + описание + radio-список уровней */}
      {open && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-stone">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-pill tracking-wide font-medium ${
                skill.type === 'CORE' ? 'bg-ink text-snow' : 'bg-cloud/60 text-stone'
              }`}
            >
              {skill.type}
            </span>
            <span>{skill.weight} вес</span>
          </div>
          {skill.description && (
            <div className="text-sm text-stone leading-relaxed">
              {skill.description}
            </div>
          )}
          {/* Phase 14: подсказка владельцу */}
          {canEditSelf && (
            <p className="text-[11px] text-ash">
              Кликни по уровню — отметишь «я считаю, что владею». Повторный
              клик по своему уровню — снять отметку.
            </p>
          )}
          <div className="flex flex-col gap-2">
            {skill.levels.map((lvl) => {
              const selected = lvl.level === skill.masteryLevel;
              const isSelf = self?.level === lvl.level;
              return (
                <div
                  key={lvl.level}
                  onClick={
                    canEditSelf
                      ? () => onSetSelfLevel(skill.id, isSelf ? null : lvl.level)
                      : undefined
                  }
                  className={`flex items-start gap-3 p-4 rounded-card border transition-colors ${
                    selected
                      ? 'border-ink bg-canvas/60'
                      : isSelf
                        ? 'border-lime/50 bg-lime/[0.05]'
                        : 'border-cloud bg-snow'
                  } ${canEditSelf ? 'cursor-pointer hover:border-ash' : ''}`}
                >
                  <span
                    className={`shrink-0 w-4 h-4 mt-0.5 rounded-full border-2 flex items-center justify-center ${
                      selected ? 'border-ink' : 'border-ash'
                    }`}
                  >
                    {selected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-ink" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink leading-snug">
                      {lvl.title}
                    </div>
                    {lvl.criteria && (
                      <div className="text-xs text-stone leading-relaxed mt-1 whitespace-pre-line">
                        {lvl.criteria}
                      </div>
                    )}
                  </div>
                  {/* Phase 14: явная метка самооценки */}
                  {isSelf && (
                    <span
                      className="chip-accent shrink-0 self-start"
                      title={
                        self?.updatedAt
                          ? `Самооценка от ${formatPublishedDate(self.updatedAt)}`
                          : 'Самооценка'
                      }
                    >
                      Моя оценка
                    </span>
                  )}
                  <div className="shrink-0 text-xs text-stone tabular-nums self-start mt-0.5">
                    {lvl.level * skill.weight}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Phase 14: комментарий к самооценке (владелец, если уровень отмечен) */}
          {canEditSelf && self && (
            <div className="relative">
              <input
                type="text"
                defaultValue={self.comment ?? ''}
                placeholder="Комментарий к самооценке (необязательно)"
                maxLength={2000}
                onChange={() => setCommentSaved(false)}
                onBlur={(e) => {
                  onSaveSelfComment(skill.id, e.target.value);
                  setCommentSaved(true);
                }}
                className="input text-xs pr-32"
              />
              {/* Статус-тег внутри поля: как сохраняется / что сохранено */}
              <span
                className={`absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-pill
                            text-[10px] leading-none pointer-events-none ${
                              commentSaved
                                ? 'bg-emerald/15 text-emerald'
                                : 'bg-ink/[0.07] text-ash'
                            }`}
              >
                {commentSaved ? 'Сохранено' : 'сохранится само'}
              </span>
            </div>
          )}
          {/* Комментарий самооценки для зрителя-mgmt */}
          {!canEditSelf && self?.comment && (
            <div className="text-xs text-stone">
              <span className="text-ash">Комментарий к самооценке:</span>{' '}
              {self.comment}
            </div>
          )}

          {/* Phase 14: подтверждения — компактные теги + явная кнопка */}
          {selfLoaded && (canEditSelf || evidences.length > 0) && (
            <div className="pt-3 border-t border-cloud/60 space-y-2.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-medium text-stone shrink-0">
                  {canEditSelf ? 'Мои подтверждения' : 'Подтверждения'}
                  {evidences.length > 0 && ` · ${evidences.length}`}
                </span>
                {evidences.map((ev) => (
                  <span
                    key={ev.id}
                    className="inline-flex items-center gap-1.5 chip bg-ink/[0.07] text-ink max-w-[280px]"
                  >
                    <a
                      href={ev.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate hover:underline"
                      title={`${ev.title}${ev.description ? ` — ${ev.description}` : ''} · ${formatPublishedDate(ev.createdAt)}`}
                    >
                      {ev.title}
                    </a>
                    {canEditSelf && (
                      <button
                        type="button"
                        onClick={() => onRemoveEvidence(skill.id, ev.id)}
                        className="text-ash hover:text-blaze shrink-0"
                        aria-label="Удалить ссылку"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {canEditSelf && !evidenceFormOpen && (
                  <button
                    type="button"
                    onClick={() => setEvidenceFormOpen(true)}
                    className="btn-secondary btn-sm ml-auto shrink-0"
                  >
                    Добавить
                  </button>
                )}
              </div>
              {canEditSelf && evidenceFormOpen && (
                <EvidenceForm
                  onAdd={(payload) => onAddEvidence(skill.id, payload)}
                  onClose={() => setEvidenceFormOpen(false)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/** Phase 14: форма добавления ссылки-подтверждения (открывает родитель
 *  кнопкой «Добавить»). */
function EvidenceForm({
  onAdd,
  onClose,
}: {
  onAdd: (payload: { url: string; title: string; description?: string }) => Promise<boolean>;
  onClose: () => void;
}) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function submit() {
    if (!url.trim() || !title.trim() || saving) return;
    setSaving(true);
    setError(false);
    const ok = await onAdd({
      url: url.trim(),
      title: title.trim(),
      description: description.trim() || undefined,
    });
    setSaving(false);
    if (ok) {
      setUrl('');
      setTitle('');
      setDescription('');
      onClose();
    } else {
      setError(true);
    }
  }

  return (
    <div className="space-y-1.5">
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://figma.com/…"
        className="input text-xs"
        autoFocus
      />
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Название (например «Концепт лендинга X»)"
        maxLength={200}
        className="input text-xs"
      />
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Описание (необязательно)"
        maxLength={1000}
        className="input text-xs"
      />
      {error && (
        <div className="text-[11px] text-blaze">
          Не сохранилось — проверь, что ссылка начинается с http(s) и название заполнено.
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving || !url.trim() || !title.trim()}
          className="btn-secondary btn-sm disabled:opacity-50"
        >
          {saving ? 'Сохраняю…' : 'Добавить'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-stone hover:text-ink"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
