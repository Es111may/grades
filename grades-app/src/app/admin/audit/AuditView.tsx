'use client';

/**
 * UI аудит-лога. Server-side первая страница приходит готовой (initialEntries),
 * дальше — фильтры и load-more через /api/audit.
 *
 * Структура: фильтры сверху, под ними таблица. Каждая строка кликается —
 * раскрывается details (before/after diff) в moncospace-формате.
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronDownIcon } from '@/components/icons';
import { AUDIT_ACTION_LABEL, AUDIT_TARGET_TYPE_LABEL } from '@/lib/audit';
import TitleAurora from '@/components/TitleAurora';

interface ActorInfo {
  id: number;
  fullName: string;
  role: string;
}

export interface AuditEntry {
  id: number;
  createdAt: string;
  action: string;
  targetType: string;
  targetId: number | null;
  /** Имя target'а если targetType === 'user' и id известен. */
  targetName: string | null;
  details: unknown;
  actor: ActorInfo;
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Админ',
  lead: 'Лид',
  stardiz: 'Стардиз',
  designer: 'Дизайнер',
};

export default function AuditView({
  initialEntries,
  actors,
  pageSize,
}: {
  initialEntries: AuditEntry[];
  actors: ActorInfo[];
  pageSize: number;
}) {
  const [entries, setEntries] = useState<AuditEntry[]>(initialEntries);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialEntries.length === pageSize);

  // Фильтры
  const [actorId, setActorId] = useState<string>('');
  const [action, setAction] = useState<string>('');
  const [targetType, setTargetType] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const filterParams = useMemo(() => {
    const p = new URLSearchParams();
    if (actorId) p.set('actorId', actorId);
    if (action) p.set('action', action);
    if (targetType) p.set('targetType', targetType);
    if (dateFrom) p.set('from', dateFrom);
    if (dateTo) p.set('to', dateTo);
    return p;
  }, [actorId, action, targetType, dateFrom, dateTo]);

  // При смене фильтров перезагружаем первую страницу.
  // initialEntries оставляем как fallback на случай, если фильтры все пустые.
  useEffect(() => {
    // Если ни один фильтр не выставлен — показываем initialEntries.
    if (filterParams.toString() === '') {
      setEntries(initialEntries);
      setHasMore(initialEntries.length === pageSize);
      return;
    }
    let cancelled = false;
    (async () => {
      const url = `/api/audit?${filterParams.toString()}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = (await res.json()) as { entries: AuditEntry[] };
      if (!cancelled) {
        setEntries(data.entries);
        setHasMore(data.entries.length === pageSize);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filterParams, initialEntries, pageSize]);

  async function loadMore() {
    if (entries.length === 0) return;
    const lastId = entries[entries.length - 1].id;
    setLoadingMore(true);
    try {
      const p = new URLSearchParams(filterParams);
      p.set('beforeId', String(lastId));
      const res = await fetch(`/api/audit?${p.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { entries: AuditEntry[] };
      setEntries((prev) => [...prev, ...data.entries]);
      setHasMore(data.entries.length === pageSize);
    } finally {
      setLoadingMore(false);
    }
  }

  // Список уникальных action'ов из текущей выдачи — чтобы select-фильтр
  // не был пустым. Альтернатива — захардкодить список из AUDIT_ACTIONS,
  // но тогда покажутся action'и которых никогда не было.
  const knownActions = useMemo(() => {
    const s = new Set<string>();
    for (const e of initialEntries) s.add(e.action);
    for (const e of entries) s.add(e.action);
    return Array.from(s).sort();
  }, [initialEntries, entries]);

  const knownTargetTypes = useMemo(() => {
    const s = new Set<string>();
    for (const e of initialEntries) s.add(e.targetType);
    for (const e of entries) s.add(e.targetType);
    return Array.from(s).sort();
  }, [initialEntries, entries]);

  return (
    <main className="max-w-[1240px] mx-auto px-8 pt-[164px] pb-16">
      <div className="text-center mb-[164px] animate-fade-up title-halo">
        <TitleAurora />
        <h1 className="font-display text-[64px] leading-none font-medium tracking-[-0.035em]">
          Аудит
        </h1>
      </div>

      {/* Фильтры */}
      <div className="card p-4 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <FilterField label="Кто">
            <select
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              className="input input-sm"
            >
              <option value="">Все</option>
              {actors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName} · {ROLE_LABEL[a.role] ?? a.role}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Действие">
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="input input-sm"
            >
              <option value="">Все</option>
              {knownActions.map((a) => (
                <option key={a} value={a}>
                  {AUDIT_ACTION_LABEL[a] ?? a}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Тип объекта">
            <select
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
              className="input input-sm"
            >
              <option value="">Все</option>
              {knownTargetTypes.map((t) => (
                <option key={t} value={t}>
                  {AUDIT_TARGET_TYPE_LABEL[t] ?? t}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="С даты">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input input-sm"
            />
          </FilterField>

          <FilterField label="По дату">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input input-sm"
            />
          </FilterField>
        </div>
        {(actorId || action || targetType || dateFrom || dateTo) && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => {
                setActorId('');
                setAction('');
                setTargetType('');
                setDateFrom('');
                setDateTo('');
              }}
              className="text-xs text-stone hover:text-ink transition-colors"
            >
              Сбросить фильтры
            </button>
          </div>
        )}
      </div>

      {/* Таблица */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="label-mono bg-canvas border-b border-cloud">
              <th className="text-left py-2.5 px-4 font-medium text-stone w-[140px]">
                Когда
              </th>
              <th className="text-left py-2.5 px-4 font-medium text-stone w-[200px]">
                Кто
              </th>
              <th className="text-left py-2.5 px-4 font-medium text-stone">
                Действие
              </th>
              <th className="text-left py-2.5 px-4 font-medium text-stone w-[220px]">
                Объект
              </th>
              <th className="text-center py-2.5 px-4 font-medium text-stone w-[80px]">
                Детали
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cloud">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm text-stone italic">
                  Нет событий под выбранные фильтры.
                </td>
              </tr>
            ) : (
              entries.map((e) => <AuditRow key={e.id} entry={e} />)
            )}
          </tbody>
        </table>
      </div>

      {hasMore && entries.length > 0 && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="btn-secondary btn-sm"
          >
            {loadingMore ? 'Загружаю…' : 'Загрузить ещё'}
          </button>
        </div>
      )}
    </main>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-stone block mb-1">{label}</span>
      {children}
    </label>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);

  const actionLabel = AUDIT_ACTION_LABEL[entry.action] ?? entry.action;
  const targetTypeLabel = AUDIT_TARGET_TYPE_LABEL[entry.targetType] ?? entry.targetType;

  return (
    <>
      <tr
        onClick={() => setExpanded((v) => !v)}
        className="hover:bg-canvas/60 transition-colors cursor-pointer"
      >
        <td className="py-3 px-4 text-stone whitespace-nowrap tabular-nums">
          {formatDateTime(entry.createdAt)}
        </td>
        <td className="py-3 px-4">
          <div className="font-medium leading-tight text-ink">
            {entry.actor.fullName}
          </div>
          <div className="text-[11px] text-stone mt-0.5">
            {ROLE_LABEL[entry.actor.role] ?? entry.actor.role}
          </div>
        </td>
        <td className="py-3 px-4 text-ink">{actionLabel}</td>
        <td className="py-3 px-4 text-sm">
          <div className="text-ink">
            {entry.targetName ??
              (entry.targetId !== null
                ? `${targetTypeLabel} #${entry.targetId}`
                : targetTypeLabel)}
          </div>
          {entry.targetName && (
            <div className="text-[11px] text-stone mt-0.5">
              {targetTypeLabel}
            </div>
          )}
        </td>
        <td className="py-3 px-4 text-center">
          <ChevronDownIcon
            className={`w-4 h-4 text-stone inline-block transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </td>
      </tr>
      {expanded && (
        <tr className="bg-canvas/30">
          <td colSpan={5} className="py-3 px-4">
            <pre className="text-[11px] font-mono text-stone whitespace-pre-wrap break-words leading-relaxed">
              {JSON.stringify(entry.details, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
