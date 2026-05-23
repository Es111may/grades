'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import { ChevronDownIcon } from '@/components/icons';
import { EditableMarkdownBlock } from '@/components/Markdown';
import ProjectsField from '@/components/ProjectsField';
import SectionNav, { type SectionNavItem } from '@/components/SectionNav';
import {
  ROLE_LABEL,
  ROLE_LABEL_ONE,
  type LeadReviewAggregates,
  type CategoryAggregate,
  type ResponderRole,
  type OpenItemAggregate,
} from '@/lib/leadSurvey';

type Target = {
  id: number;
  fullName: string;
  role: string;
  avatarUrl: string | null;
  email: string;
  active: boolean;
};

type Sibling = {
  id: number;
  period: string;
  importedAt: string;
  responseCount: number;
};

type Review = {
  id: number;
  period: string;
  importedAt: string;
  responseCount: number;
  aggregates: LeadReviewAggregates;
  aiSummary: string | null;
  cdoSummary: string | null;
};

type Previous = {
  id: number;
  period: string;
  aggregates: LeadReviewAggregates;
};

const ROLE_ORDER: ResponderRole[] = ['designer', 'manager', 'lead', 'frontend', 'other'];

export default function LeadReviewView({
  meRole,
  review,
  target,
  siblings,
  previous,
  initialProjects,
  canEditProjects,
}: {
  meRole: string;
  review: Review;
  target: Target;
  siblings: Sibling[];
  previous: Previous | null;
  initialProjects: { id: number; name: string; category: string }[];
  canEditProjects: boolean;
}) {
  const router = useRouter();
  const isAdmin = meRole === 'admin';
  const agg = review.aggregates;

  // Двухступенчатое удаление
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function armDelete() {
    setDeleteArmed(true);
    setTimeout(() => setDeleteArmed(false), 5000);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/lead-reviews/${review.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        router.refresh();
        router.push(`/admin/lead-reviews?userId=${target.id}`);
        return;
      }
      const data = await res.json().catch(() => ({}));
      const msg =
        typeof data.error === 'string' ? data.error : res.statusText || 'Unknown error';
      alert(`Не получилось удалить (${res.status}): ${msg}`);
      setDeleting(false);
      setDeleteArmed(false);
    } catch (e) {
      alert(`Не получилось удалить — сеть пропала или сервер недоступен:\n${String(e)}`);
      setDeleting(false);
      setDeleteArmed(false);
    }
  }

  // Роли с ответами
  const presentRoles = ROLE_ORDER.filter((r) => (agg.roleCounts[r] ?? 0) > 0);
  const showRoleSplit = presentRoles.length >= 2;

  // Sticky-навигация по разделам — выезжает снизу при скролле.
  const navSections: SectionNavItem[] = useMemo(
    () => [
      // «Проекты» — если можно редактировать или уже что-то выбрано.
      ...(canEditProjects || initialProjects.length > 0
        ? [{ id: 'projects', label: 'Проекты' }]
        : []),
      { id: 'stats', label: 'Статистика' },
      { id: 'cat-review_quality', label: 'Ревью' },
      { id: 'cat-process', label: 'Процессы' },
      { id: 'cat-growth', label: 'Наставничество' },
      { id: 'cat-product', label: 'Решения' },
      { id: 'cat-communication', label: 'Коммуникация' },
      { id: 'cat-collaboration', label: 'Разработка' },
      { id: 'questions', label: 'Вопросы' },
      { id: 'summary', label: 'Выводы' },
    ],
    [canEditProjects, initialProjects.length],
  );

  return (
    <main className="max-w-[1400px] mx-auto px-8 pt-8 pb-16">
      <div className="text-xs text-stone mb-3">
        <Link href="/admin/users" className="hover:text-ink transition-colors">
          Команда
        </Link>
        <span className="text-ash mx-1.5">/</span>
        <span>{target.fullName}</span>
      </div>

      {/* Карточка-баннер временно скрыта — см. PRD §11.16. */}
      {/* <PortraitBanner
        fullName={target.fullName}
        role={target.role === 'lead' ? 'lead' : 'stardiz'}
      /> */}

      {/* Hero */}
      <div className="mb-6 flex items-center gap-4">
        <Avatar name={target.fullName} avatarUrl={target.avatarUrl} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-4xl font-semibold tracking-tight mb-2">
            {target.fullName}
          </h1>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="chip bg-ink text-snow">{review.period}</span>
            <span className="chip-neutral">
              {target.role === 'lead' ? 'Лид' : 'Стардиз'}
            </span>
            <span className="chip-neutral">
              {review.responseCount} {pluralRespondents(review.responseCount)}
            </span>
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/lead-reviews/new?userId=${target.id}`}
              className="btn-secondary"
            >
              Новый цикл
            </Link>
            {!deleteArmed ? (
              <button
                onClick={armDelete}
                className="btn-ghost-danger"
                title="Удалить эту оценку"
                type="button"
              >
                Удалить
              </button>
            ) : (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="btn-danger"
                type="button"
              >
                {deleting ? 'Удаляю…' : 'Точно удалить?'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Переключатель циклов — inline в шапке (floating-копию убрали в
          пользу SectionNav). */}
      {siblings.length > 1 && (
        <div className="mb-6">
          <CyclesSwitcher siblings={siblings} currentId={review.id} />
        </div>
      )}

      {/* Проекты — Pavel Phase 24. */}
      <section id="projects" className="scroll-mt-24">
        <ProjectsField
          userId={target.id}
          initialProjects={initialProjects}
          canEdit={canEditProjects}
        />
      </section>

      {/* === Статистика: eNPS + (Diff/RoleComparison) === */}
      <section id="stats" className="scroll-mt-24">
        {/* eNPS */}
        <div className="card p-7 mb-6">
          <div className="grid grid-cols-[auto_1fr] gap-10 items-center">
            <div>
              <div className="text-[11px] text-stone mb-2">
                Готовность работать с лидом
              </div>
              <div className="font-display text-5xl font-semibold tracking-tight leading-none tabular-nums">
                {agg.enps.average !== null ? agg.enps.average.toFixed(1) : '—'}
                <span className="text-xl text-stone font-normal ml-1.5">/ 10</span>
              </div>
              <div className="text-xs text-stone mt-2">
                eNPS · ответили {agg.enps.answeredCount}
              </div>
            </div>
            {showRoleSplit && (
              <div className="space-y-2">
                {presentRoles.map((role) => {
                  const v = agg.enps.averageByRole[role] ?? null;
                  return (
                    <div key={role} className="flex items-center gap-3 text-sm">
                      <span className="text-stone w-32 shrink-0 text-xs whitespace-nowrap">
                        {ROLE_LABEL[role]} ({agg.roleCounts[role]})
                      </span>
                      <ScoreBar value={v} max={10} />
                      <span className="tabular-nums w-10 text-right text-xs font-medium">
                        {v !== null ? v.toFixed(1) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Сравнительный блок:
              — если есть предыдущий цикл, показываем «Изменения с прошлого»
                (с раскрывающейся разбивкой по ролям внутри);
              — если это первый цикл и есть несколько ролей — показываем
                классическое «Сравнение оценок по ролям». */}
        {previous ? (
          <DiffWithPreviousCard
            current={agg}
            previous={previous}
            currentPeriod={review.period}
            presentRoles={presentRoles}
          />
        ) : (
          showRoleSplit && (
            <RoleComparisonTable aggregates={agg} presentRoles={presentRoles} />
          )
        )}
      </section>

      {/* Категории */}
      <div className="space-y-4 mb-8">
        {agg.categories.map((cat) => (
          <CategoryCard
            key={cat.id}
            category={cat}
            presentRoles={presentRoles}
            showRoleSplit={showRoleSplit}
            anchorId={`cat-${cat.id}`}
          />
        ))}
      </div>

      {/* Открытые вопросы */}
      <section id="questions" className="space-y-4 mb-8 scroll-mt-24">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Открытые вопросы
        </h2>
        {agg.openQuestions.map((oq) => (
          <OpenQuestionCard key={oq.id} item={oq} />
        ))}
      </section>

      {/* Выводы: AI-сводка + CDO. Локальный state на оба поля, чтобы
          оптимистично обновлять без router.refresh(). */}
      <section id="summary" className="scroll-mt-24">
        <LeadReviewMarkdownField
          title="Сводка по ИИ"
          badge="AI"
          hint="Прогони агрегаты через ChatGPT / Gemini снаружи и вставь markdown сюда"
          initialValue={review.aiSummary ?? ''}
          canEdit={isAdmin}
          reviewId={review.id}
          field="aiSummary"
        />

        <LeadReviewMarkdownField
          title="Блок CDO"
          badge="CDO"
          hint="Планы, KPI, наблюдения, итоговая оценка"
          initialValue={review.cdoSummary ?? ''}
          canEdit={isAdmin}
          reviewId={review.id}
          field="cdoSummary"
        />
      </section>

      <div className="text-xs text-ash text-center mt-10">
        Импортировано {new Date(review.importedAt).toLocaleString('ru-RU')}
      </div>

      {/* Sticky-навигация по разделам (заменила floating-свитчер циклов) */}
      <SectionNav sections={navSections} />

    </main>
  );
}

function CyclesSwitcher({
  siblings,
  currentId,
}: {
  siblings: Sibling[];
  currentId: number;
}) {
  return (
    <div className="segmented">
      {siblings.map((s) => (
        <Link
          key={s.id}
          href={`/admin/lead-reviews/${s.id}`}
          className={`segmented-item whitespace-nowrap ${
            s.id === currentId ? 'segmented-item-active' : ''
          }`}
        >
          {s.period}
        </Link>
      ))}
    </div>
  );
}

function DiffWithPreviousCard({
  current,
  previous,
  currentPeriod,
  presentRoles,
}: {
  current: LeadReviewAggregates;
  previous: Previous;
  currentPeriod: string;
  presentRoles: ResponderRole[];
}) {
  const [expanded, setExpanded] = useState(false);

  // Считаем дельты по каждой категории и по eNPS (общие — для основной строки)
  const rows: Array<{
    label: string;
    prev: number | null;
    curr: number | null;
    delta: number | null;
    scale: '5' | '10';
    // Разбивка по ролям (для раскрытого вида). Каждая роль — пара [было, стало].
    byRole: Partial<Record<ResponderRole, { prev: number | null; curr: number | null }>>;
  }> = [];

  for (const cat of current.categories) {
    const prevCat = previous.aggregates.categories.find((c) => c.id === cat.id);
    const byRole: Partial<Record<ResponderRole, { prev: number | null; curr: number | null }>> = {};
    for (const role of presentRoles) {
      byRole[role] = {
        prev: prevCat?.averageByRole?.[role] ?? null,
        curr: cat.averageByRole?.[role] ?? null,
      };
    }
    rows.push({
      label: cat.label,
      prev: prevCat?.average ?? null,
      curr: cat.average,
      delta:
        cat.average !== null && (prevCat?.average ?? null) !== null
          ? cat.average - (prevCat!.average as number)
          : null,
      scale: '5',
      byRole,
    });
  }

  // eNPS
  const enpsByRole: Partial<Record<ResponderRole, { prev: number | null; curr: number | null }>> = {};
  for (const role of presentRoles) {
    enpsByRole[role] = {
      prev: previous.aggregates.enps.averageByRole?.[role] ?? null,
      curr: current.enps.averageByRole?.[role] ?? null,
    };
  }
  rows.push({
    label: 'Готовность работать (eNPS, 1–10)',
    prev: previous.aggregates.enps.average,
    curr: current.enps.average,
    delta:
      current.enps.average !== null && previous.aggregates.enps.average !== null
        ? current.enps.average - previous.aggregates.enps.average
        : null,
    scale: '10',
    byRole: enpsByRole,
  });

  const canExpand = presentRoles.length >= 2;

  return (
    <section className="card overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-cloud bg-canvas/60 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink">
            Изменение с прошлого цикла
          </h2>
          <p className="text-xs text-stone mt-0.5">
            {previous.period} → {currentPeriod}
          </p>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="text-[11px] text-stone bg-canvas/40">
          <tr>
            <th className="text-left px-6 py-3 font-medium">Категория</th>
            <th className="text-right px-4 py-3 font-medium w-28 whitespace-nowrap">
              Было
            </th>
            <th className="text-right px-4 py-3 font-medium w-28 whitespace-nowrap">
              Стало
            </th>
            <th className="text-right px-6 py-3 font-medium w-28 whitespace-nowrap">
              Δ
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const fmt = (v: number | null) =>
              v === null ? '—' : r.scale === '10' ? v.toFixed(1) : v.toFixed(2);
            const isEnps = r.scale === '10';
            return (
              <tr
                key={i}
                className={`border-t border-cloud hover:bg-canvas/40 transition-colors ${
                  isEnps ? 'bg-canvas/40 font-medium' : ''
                }`}
              >
                <td className="px-6 py-3 text-graphite">{r.label}</td>
                <td className="text-right px-4 py-3 tabular-nums text-stone">
                  {fmt(r.prev)}
                </td>
                <td className="text-right px-4 py-3 tabular-nums">{fmt(r.curr)}</td>
                <td className="text-right px-6 py-3 tabular-nums font-medium">
                  {r.delta === null ? (
                    <span className="text-ash">—</span>
                  ) : Math.abs(r.delta) < 0.005 ? (
                    <span className="text-stone">0</span>
                  ) : (
                    <span
                      className={
                        r.delta > 0 ? 'text-emerald' : 'text-blaze'
                      }
                    >
                      {r.delta > 0 ? '+' : ''}
                      {r.scale === '10' ? r.delta.toFixed(1) : r.delta.toFixed(2)}
                      <span className="ml-1">{r.delta > 0 ? '↑' : '↓'}</span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Раскрытие — детали по ролям. Показываем кнопку только если есть
          две и более ролей, по которым можно разложить. */}
      {canExpand && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full px-6 py-3 border-t border-cloud flex items-center justify-between text-sm text-stone hover:bg-canvas/40 transition-colors"
            type="button"
          >
            <span>{expanded ? 'Свернуть' : 'Подробнее по ролям'}</span>
            <ChevronDownIcon
              className={`w-4 h-4 transition-transform duration-150 ${
                expanded ? 'rotate-180' : ''
              }`}
            />
          </button>
          {expanded && (
            <div className="border-t border-cloud overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] text-stone bg-canvas/40">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium">Блок</th>
                    {presentRoles.flatMap((role) => [
                      <th
                        key={`${role}-prev`}
                        className="text-right px-3 py-3 font-medium tabular-nums whitespace-nowrap"
                      >
                        {ROLE_LABEL[role]} · {previous.period}
                      </th>,
                      <th
                        key={`${role}-curr`}
                        className="text-right px-3 py-3 font-medium tabular-nums whitespace-nowrap"
                      >
                        {ROLE_LABEL[role]} · {currentPeriod}
                      </th>,
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const fmt = (v: number | null) =>
                      v === null ? '—' : r.scale === '10' ? v.toFixed(1) : v.toFixed(2);
                    const isEnps = r.scale === '10';
                    return (
                      <tr
                        key={i}
                        className={`border-t border-cloud ${
                          isEnps ? 'bg-canvas/40 font-medium' : ''
                        }`}
                      >
                        <td className="px-6 py-3 text-graphite">{r.label}</td>
                        {presentRoles.flatMap((role) => {
                          const cell = r.byRole[role];
                          const prevV = cell?.prev ?? null;
                          const currV = cell?.curr ?? null;
                          const delta =
                            prevV !== null && currV !== null
                              ? currV - prevV
                              : null;
                          const deltaColor =
                            delta === null || Math.abs(delta) < 0.005
                              ? ''
                              : delta > 0
                                ? 'text-emerald'
                                : 'text-blaze';
                          return [
                            <td
                              key={`${role}-prev`}
                              className="text-right px-3 py-3 tabular-nums text-stone"
                            >
                              {fmt(prevV)}
                            </td>,
                            <td
                              key={`${role}-curr`}
                              className={`text-right px-3 py-3 tabular-nums ${deltaColor}`}
                            >
                              {fmt(currV)}
                            </td>,
                          ];
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function CategoryCard({
  category,
  presentRoles,
  showRoleSplit,
  anchorId,
}: {
  category: CategoryAggregate;
  presentRoles: ResponderRole[];
  showRoleSplit: boolean;
  anchorId?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasOpenItems = category.openItems.some((o) => o.answers.length > 0);

  return (
    <section id={anchorId} className="card overflow-hidden scroll-mt-24">
      <div className="px-6 py-4 border-b border-cloud bg-canvas/60 flex items-center justify-between gap-4">
        <h3 className="text-base font-semibold text-ink leading-tight">{category.label}</h3>
        <div className="font-display text-2xl font-semibold tracking-tight tabular-nums shrink-0">
          {category.average !== null ? category.average.toFixed(2) : '—'}
          <span className="text-sm text-stone font-normal ml-1">/ 5</span>
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        {category.items.map((item) => (
          <div key={item.id} className="text-sm">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0 text-graphite leading-snug">
                {item.question}
              </div>
              <span className="tabular-nums shrink-0 w-12 text-right font-semibold">
                {item.average !== null ? item.average.toFixed(2) : '—'}
              </span>
            </div>
            <div className="mt-2">
              <ScoreBar value={item.average} max={5} />
            </div>
            {showRoleSplit && (
              <div className="flex items-center gap-3 mt-2 text-[11px] text-ash flex-wrap">
                {presentRoles.map((role) => {
                  const v = item.averageByRole[role];
                  if (v === undefined || v === null) return null;
                  return (
                    <span key={role} className="tabular-nums whitespace-nowrap">
                      {ROLE_LABEL[role]}:{' '}
                      <strong className="text-stone">{v.toFixed(2)}</strong>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {hasOpenItems && (
        <div className="border-t border-cloud">
          <button
            onClick={() => setOpen((v) => !v)}
            className="w-full px-6 py-3 flex items-center justify-between text-sm text-stone hover:bg-canvas/40 transition-colors"
            type="button"
          >
            <span>Подробный фидбек</span>
            <ChevronDownIcon
              className={`w-4 h-4 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
            />
          </button>
          {open && (
            <div className="px-6 pb-5 pt-1 space-y-4">
              {category.openItems.map((oi) =>
                oi.answers.length > 0 ? (
                  <div key={oi.id}>
                    <div className="text-[11px] text-stone mb-2">{oi.question}</div>
                    <ul className="space-y-2">
                      {oi.answers.map((a, idx) => (
                        <li
                          key={idx}
                          className="text-sm leading-relaxed bg-canvas/50 border border-cloud rounded-card p-3.5 whitespace-pre-line"
                        >
                          <span className="chip-build mr-2 align-baseline">
                            {ROLE_LABEL_ONE[a.role]}
                          </span>
                          {a.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RoleComparisonTable({
  aggregates,
  presentRoles,
}: {
  aggregates: LeadReviewAggregates;
  presentRoles: ResponderRole[];
}) {
  return (
    <section className="card overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-cloud bg-canvas/60">
        <h2 className="text-base font-semibold text-ink">Сравнение оценок по ролям</h2>
        <p className="text-xs text-stone mt-1">
          Средняя по категории, разбивка по тем, кто отвечал.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="text-[11px] text-stone bg-canvas/40">
          <tr>
            <th className="text-left px-6 py-3 font-medium">Категория</th>
            {presentRoles.map((r) => (
              <th
                key={r}
                className="text-right px-4 py-3 font-medium tabular-nums w-32 whitespace-nowrap"
              >
                {ROLE_LABEL[r]} ({aggregates.roleCounts[r]})
              </th>
            ))}
            {presentRoles.length >= 2 && (
              <th className="text-right px-6 py-3 font-medium w-24 whitespace-nowrap">
                Разрыв
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {aggregates.categories.map((cat) => {
            const values = presentRoles.map((r) => cat.averageByRole[r] ?? null);
            const nums = values.filter((v): v is number => typeof v === 'number');
            const gap =
              nums.length >= 2 ? Math.max(...nums) - Math.min(...nums) : null;
            return (
              <tr
                key={cat.id}
                className="border-t border-cloud hover:bg-canvas/40 transition-colors"
              >
                <td className="px-6 py-3 text-graphite">{cat.label}</td>
                {values.map((v, i) => (
                  <td key={i} className="text-right px-4 py-3 tabular-nums">
                    {v !== null ? v.toFixed(2) : '—'}
                  </td>
                ))}
                {presentRoles.length >= 2 && (
                  <td
                    className={`text-right px-6 py-3 tabular-nums font-medium ${
                      gap !== null && gap >= 0.7 ? 'text-blaze' : 'text-stone'
                    }`}
                  >
                    {gap !== null ? gap.toFixed(2) : '—'}
                  </td>
                )}
              </tr>
            );
          })}
          {/* eNPS отдельной строкой */}
          <tr className="border-t border-cloud bg-canvas/40">
            <td className="px-6 py-3 text-graphite font-medium">
              Готовность работать (eNPS, 1–10)
            </td>
            {presentRoles.map((r) => {
              const v = aggregates.enps.averageByRole[r];
              return (
                <td key={r} className="text-right px-4 py-3 tabular-nums">
                  {typeof v === 'number' ? v.toFixed(1) : '—'}
                </td>
              );
            })}
            {presentRoles.length >= 2 && (
              <td className="text-right px-6 py-3 tabular-nums font-medium text-stone">
                {(() => {
                  const nums = presentRoles
                    .map((r) => aggregates.enps.averageByRole[r])
                    .filter((v): v is number => typeof v === 'number');
                  if (nums.length < 2) return '—';
                  return (Math.max(...nums) - Math.min(...nums)).toFixed(1);
                })()}
              </td>
            )}
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function OpenQuestionCard({ item }: { item: OpenItemAggregate }) {
  if (item.answers.length === 0) {
    return (
      <section className="card p-5">
        <div className="text-sm font-medium text-ink mb-2">{item.question}</div>
        <div className="text-xs text-ash italic">Ответов не было</div>
      </section>
    );
  }
  return (
    <section className="card p-5">
      <div className="text-sm font-medium text-ink mb-3">{item.question}</div>
      <ul className="space-y-2">
        {item.answers.map((a, idx) => (
          <li
            key={idx}
            className="text-sm leading-relaxed bg-canvas/50 border border-cloud rounded-card p-3.5 whitespace-pre-line"
          >
            <span className="chip-build mr-2 align-baseline">
              {ROLE_LABEL_ONE[a.role]}
            </span>
            {a.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Тонкая обёртка над `EditableMarkdownBlock` для полей `aiSummary` и
 * `cdoSummary` у LeadReview. Заворачивает работу с локальным state +
 * сетевой запрос к PATCH /api/lead-reviews/[id].
 */
function LeadReviewMarkdownField({
  title,
  badge,
  hint,
  initialValue,
  canEdit,
  reviewId,
  field,
}: {
  title: string;
  badge: string;
  hint: string;
  initialValue: string;
  canEdit: boolean;
  reviewId: number;
  field: 'aiSummary' | 'cdoSummary';
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <EditableMarkdownBlock
      title={title}
      badge={badge}
      hint={hint}
      value={value}
      canEdit={canEdit}
      onSave={async (next) => {
        const res = await fetch(`/api/lead-reviews/${reviewId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: next }),
        });
        if (res.ok) {
          setValue(next);
          return true;
        }
        return false;
      }}
    />
  );
}

function ScoreBar({
  value,
  max,
}: {
  value: number | null | undefined;
  max: number;
}) {
  if (value == null) {
    return <div className="flex-1 h-1.5 bg-cloud rounded-full overflow-hidden" />;
  }
  const pct = Math.min(100, (value / max) * 100);
  const ratio = value / max;
  const color = ratio < 0.6 ? '#ff453a' : ratio < 0.8 ? '#ff9f0a' : '#34c759';
  return (
    <div className="flex-1 h-1.5 bg-cloud rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

function pluralRespondents(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'респондентов';
  if (mod10 === 1) return 'респондент';
  if (mod10 >= 2 && mod10 <= 4) return 'респондента';
  return 'респондентов';
}
