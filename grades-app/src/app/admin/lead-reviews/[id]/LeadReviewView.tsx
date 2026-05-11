'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import { ChevronDownIcon } from '@/components/icons';
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

const ROLE_ORDER: ResponderRole[] = ['designer', 'manager', 'lead', 'frontend', 'other'];

export default function LeadReviewView({
  meRole,
  review,
  target,
  siblings,
}: {
  meRole: string;
  review: Review;
  target: Target;
  siblings: Sibling[];
}) {
  const router = useRouter();
  const isAdmin = meRole === 'admin';
  const agg = review.aggregates;

  async function handleDelete() {
    if (
      !confirm(
        `Удалить оценку «${review.period}» для ${target.fullName}? Действие необратимо.`,
      )
    )
      return;
    const res = await fetch(`/api/lead-reviews/${review.id}`, { method: 'DELETE' });
    if (res.ok) {
      router.push(`/admin/lead-reviews?userId=${target.id}`);
      router.refresh();
    } else {
      alert('Не получилось удалить — обнови страницу и попробуй ещё раз');
    }
  }

  // Роли, по которым были ответы — для таблицы сравнения
  const presentRoles = ROLE_ORDER.filter((r) => (agg.roleCounts[r] ?? 0) > 0);
  const showRoleSplit = presentRoles.length >= 2;

  return (
    <main className="max-w-[1100px] mx-auto px-8 pt-8 pb-16">
      <div className="text-xs text-stone mb-3">
        <Link href="/admin/users" className="hover:text-ink transition-colors">
          Команда
        </Link>
        <span className="text-ash mx-1.5">/</span>
        <span>{target.fullName}</span>
      </div>

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
            <button
              onClick={handleDelete}
              className="btn-ghost-danger"
              title="Удалить эту оценку"
            >
              Удалить
            </button>
          </div>
        )}
      </div>

      {/* Переключатель между циклами оценки этого же лида */}
      {siblings.length > 1 && (
        <div className="mb-6 flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-stone mr-1">Все циклы:</span>
          <div className="segmented">
            {siblings.map((s) => (
              <Link
                key={s.id}
                href={`/admin/lead-reviews/${s.id}`}
                className={`segmented-item ${
                  s.id === review.id ? 'segmented-item-active' : ''
                }`}
              >
                {s.period}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* eNPS — большая карточка */}
      <div className="card p-7 mb-6">
        <div className="grid grid-cols-[auto_1fr] gap-10 items-end">
          <div>
            <div className="text-[11px] text-stone mb-2">
              Готовность работать с лидом
            </div>
            <div className="font-display text-6xl font-semibold tracking-tight leading-none tabular-nums">
              {agg.enps.average !== null ? agg.enps.average.toFixed(1) : '—'}
              <span className="text-2xl text-stone font-normal ml-1.5">/ 10</span>
            </div>
            <div className="text-xs text-stone mt-2">
              eNPS · ответили {agg.enps.answeredCount}
            </div>
          </div>
          <div>
            {showRoleSplit && (
              <div className="space-y-2.5">
                {presentRoles.map((role) => {
                  const v = agg.enps.averageByRole[role];
                  return (
                    <div
                      key={role}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-stone w-24 shrink-0">
                        {ROLE_LABEL[role]} ({agg.roleCounts[role]})
                      </span>
                      <ScoreBar value={v} max={10} />
                      <span className="tabular-nums w-8 text-right">
                        {v !== null ? v.toFixed(1) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Категории */}
      <div className="space-y-4 mb-8">
        {agg.categories.map((cat) => (
          <CategoryCard
            key={cat.id}
            category={cat}
            presentRoles={presentRoles}
            showRoleSplit={showRoleSplit}
          />
        ))}
      </div>

      {/* Сравнение оценок по ролям — таблица (если есть несколько ролей) */}
      {showRoleSplit && (
        <RoleComparisonTable
          aggregates={agg}
          presentRoles={presentRoles}
        />
      )}

      {/* Открытые вопросы */}
      <div className="space-y-4 mb-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Открытые вопросы
        </h2>
        {agg.openQuestions.map((oq) => (
          <OpenQuestionCard key={oq.id} item={oq} />
        ))}
      </div>

      {/* AI-сводка */}
      <EditableMarkdownBlock
        title="Сводка по ИИ"
        hint="Прогони агрегаты и ответы через ChatGPT / Gemini снаружи и вставь markdown сюда."
        value={review.aiSummary ?? ''}
        canEdit={isAdmin}
        reviewId={review.id}
        field="aiSummary"
        accent="info"
      />

      {/* CDO-блок */}
      <EditableMarkdownBlock
        title="CDO-блок"
        hint="Планы, KPI, наблюдения, итоговая оценка от Pavel'a."
        value={review.cdoSummary ?? ''}
        canEdit={isAdmin}
        reviewId={review.id}
        field="cdoSummary"
        accent="warn"
      />

      <div className="text-xs text-ash text-center mt-10">
        Импортировано {new Date(review.importedAt).toLocaleString('ru-RU')}
      </div>
    </main>
  );
}

function CategoryCard({
  category,
  presentRoles,
  showRoleSplit,
}: {
  category: CategoryAggregate;
  presentRoles: ResponderRole[];
  showRoleSplit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasOpenItems = category.openItems.some((o) => o.answers.length > 0);

  return (
    <section className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-cloud bg-canvas/60 flex items-baseline justify-between gap-4">
        <h3 className="text-base font-semibold text-ink">{category.label}</h3>
        <div className="font-display text-2xl font-semibold tracking-tight tabular-nums">
          {category.average !== null ? category.average.toFixed(2) : '—'}
          <span className="text-sm text-stone font-normal ml-1">/ 5</span>
        </div>
      </div>

      <div className="px-6 py-5 space-y-3.5">
        {category.items.map((item) => (
          <div key={item.id} className="text-sm">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0 text-graphite leading-snug">
                {item.question}
              </div>
              <span className="tabular-nums shrink-0 w-12 text-right font-medium">
                {item.average !== null ? item.average.toFixed(2) : '—'}
              </span>
            </div>
            <div className="mt-2">
              <ScoreBar value={item.average} max={5} />
            </div>
            {showRoleSplit && (
              <div className="flex items-center gap-3 mt-1.5 text-[11px] text-ash flex-wrap">
                {presentRoles.map((role) => {
                  const v = item.averageByRole[role];
                  if (v === undefined || v === null) return null;
                  return (
                    <span key={role} className="tabular-nums">
                      {ROLE_LABEL[role]}: <strong className="text-stone">{v.toFixed(2)}</strong>
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
                    <div className="text-[11px] text-stone mb-2">
                      {oi.question}
                    </div>
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
        <h2 className="text-base font-semibold text-ink">
          Сравнение оценок по ролям
        </h2>
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
                className="text-right px-4 py-3 font-medium tabular-nums w-28"
              >
                {ROLE_LABEL[r]} ({aggregates.roleCounts[r]})
              </th>
            ))}
            {presentRoles.length >= 2 && (
              <th className="text-right px-6 py-3 font-medium w-24">Разрыв</th>
            )}
          </tr>
        </thead>
        <tbody>
          {aggregates.categories.map((cat) => {
            const values = presentRoles.map((r) => cat.averageByRole[r] ?? null);
            const nums = values.filter((v): v is number => typeof v === 'number');
            const gap =
              nums.length >= 2
                ? Math.max(...nums) - Math.min(...nums)
                : null;
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

function EditableMarkdownBlock({
  title,
  hint,
  value,
  canEdit,
  reviewId,
  field,
  accent,
}: {
  title: string;
  hint: string;
  value: string;
  canEdit: boolean;
  reviewId: number;
  field: 'aiSummary' | 'cdoSummary';
  accent: 'info' | 'warn';
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/lead-reviews/${reviewId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: draft }),
    });
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      alert('Не получилось сохранить — попробуй ещё раз');
    }
  }

  const accentClass =
    accent === 'info'
      ? 'border-l-4 border-l-sky'
      : 'border-l-4 border-l-sunset';

  return (
    <section className={`card mb-6 overflow-hidden ${accentClass}`}>
      <div className="px-6 py-4 border-b border-cloud bg-canvas/30 flex items-baseline justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <p className="text-xs text-stone mt-0.5">{hint}</p>
        </div>
        {canEdit && !editing && (
          <button
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
            className="btn-ghost btn-sm"
          >
            {value ? 'Редактировать' : 'Заполнить'}
          </button>
        )}
      </div>
      <div className="px-6 py-5">
        {editing ? (
          <div className="space-y-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="input"
              rows={12}
              placeholder="Markdown · переносы строк сохраняются"
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setEditing(false)}
                className="btn-ghost"
                disabled={saving}
              >
                Отмена
              </button>
              <button onClick={save} disabled={saving} className="btn-accent">
                {saving ? 'Сохраняю…' : 'Сохранить'}
              </button>
            </div>
          </div>
        ) : value ? (
          <div className="text-sm leading-relaxed text-graphite whitespace-pre-line">
            {value}
          </div>
        ) : (
          <div className="text-sm text-ash italic">Ещё не заполнено</div>
        )}
      </div>
    </section>
  );
}

function ScoreBar({ value, max }: { value: number | null; max: number }) {
  if (value === null) {
    return (
      <div className="flex-1 h-1.5 bg-cloud rounded-full overflow-hidden" />
    );
  }
  const pct = Math.min(100, (value / max) * 100);
  // Цвет: до 3 — blaze, до 4 — sunset, выше — emerald (для шкалы 5).
  // Для шкалы 10: до 6 — blaze, до 8 — sunset, выше — emerald.
  const ratio = value / max;
  const color =
    ratio < 0.6 ? '#ff453a' : ratio < 0.8 ? '#ff9f0a' : '#34c759';
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
