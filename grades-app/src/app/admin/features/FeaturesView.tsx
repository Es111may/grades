'use client';

import { useEffect, useRef, useState } from 'react';
import TitleAurora from '@/components/TitleAurora';
import FilterDropdown, { type FilterOption } from '@/components/FilterDropdown';
import EmptyState from '@/components/EmptyState';
import { PlusIcon, SearchIcon } from '@/components/icons';
import { formatDateShort } from '@/lib/dates';
import {
  FEATURE_AREAS,
  areaCounts,
  areaLabel,
  filterSections,
  filterUpdates,
  type AreaFilter,
  type FeatureArea,
  type FeatureRole,
  type FeatureSection,
  type FeatureUpdate,
  type RoleFilter,
} from '@/lib/features';

const ROLE_LABEL: Record<FeatureRole, string> = { admin: 'Админ', lead: 'Лид', stardiz: 'Стардиз' };
const ROLES: FeatureRole[] = ['admin', 'lead', 'stardiz'];
const SEEN_KEY = 'features-seen';
// Появление карточек лесенкой: шаг 50мс, дальше шестой — без добавки
const STAGGER_START = 110;
const STAGGER_STEP = 50;
const STAGGER_MAX = 5;

type Tab = 'updates' | 'all';

export default function FeaturesView({
  role,
  updates,
  sections,
}: {
  role: FeatureRole;
  updates: FeatureUpdate[];
  sections: FeatureSection[];
}) {
  const isAdmin = role === 'admin';
  const [tab, setTab] = useState<Tab>('updates');
  // Фильтры общие для обеих вкладок. «Роль» — только у админа: лид и
  // стардиз и так получают с сервера только своё.
  const [area, setArea] = useState<AreaFilter>('all');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  // Лесенка появления — при загрузке и смене вкладки, но не при фильтрах:
  // карточки, которые вернул фильтр, просто встают на место.
  const [stagger, setStagger] = useState(true);
  // Раскрыто первое (самое свежее) обновление
  const [open, setOpen] = useState<Set<string>>(() => new Set(updates[0] ? [updates[0].id] : []));
  // «Новое» — всё, что вышло после прошлого визита. В первый визит —
  // только самый свежий день, чтобы не пометить новым весь список.
  const [seen, setSeen] = useState<string | null>(null);
  useEffect(() => {
    const latest = updates[0]?.date ?? '';
    let prev: string | null = null;
    try {
      prev = localStorage.getItem(SEEN_KEY);
      localStorage.setItem(SEEN_KEY, latest);
    } catch {
      // приватный режим — «новое» просто не подсветится
    }
    setSeen(prev ?? (latest ? prevDay(latest) : ''));
  }, [updates]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Записей — десятки, фильтруем на каждом рендере без мемоизации.
  // Счётчики в дропдаунах перекрёстные: у «Типа» учтена выбранная роль,
  // у «Роли» — выбранный тип; считаются по текущей вкладке.
  const apply = (a: AreaFilter, r: RoleFilter): Array<{ area: FeatureArea }> =>
    tab === 'updates'
      ? filterUpdates({ updates, area: a, role: r })
      : filterSections({ sections, area: a, role: r });
  const visibleUpdates = filterUpdates({ updates, area, role: roleFilter });
  const visibleSections = filterSections({ sections, area, role: roleFilter });

  const byRole = apply('all', roleFilter);
  const present = new Map(areaCounts(byRole).map((p) => [p.area, p.count]));
  const areaOptions: FilterOption<AreaFilter>[] = [
    { value: 'all', label: 'Все', count: byRole.length },
    // Выбранный тип остаётся в меню, даже если на этой вкладке его нет, —
    // иначе в пилюле висело бы значение, которого не найти в списке
    ...FEATURE_AREAS.filter((a) => present.has(a.id) || a.id === area).map((a) => ({
      value: a.id,
      label: a.label,
      count: present.get(a.id) ?? 0,
    })),
  ];
  const roleOptions: FilterOption<RoleFilter>[] = [
    { value: 'all', label: 'Все роли', count: apply(area, 'all').length },
    ...ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r], count: apply(area, r).length })),
  ];

  const filtered = area !== 'all' || roleFilter !== 'all';
  const resetFilters = () => {
    setStagger(false);
    setArea('all');
    setRoleFilter('all');
  };
  const isEmpty = tab === 'updates' ? visibleUpdates.length === 0 : visibleSections.length === 0;

  const enter = (i: number) =>
    stagger
      ? {
          className: 'animate-fade-up',
          style: { animationDelay: `${STAGGER_START + Math.min(i, STAGGER_MAX) * STAGGER_STEP}ms` },
        }
      : { className: '', style: undefined };

  return (
    <main className="max-w-[1240px] mx-auto px-8 pt-[164px] pb-16">
      {/* Заголовок — по центру, крупно, с halo-сиянием позади */}
      <div data-comment-anchor="page-title" className="text-center mb-[164px] animate-fade-up title-halo">
        <TitleAurora />
        <h1 className="font-display text-[64px] leading-none font-medium tracking-[-0.035em]">
          Функционал
        </h1>
      </div>

      {/* Ряд контролов, как на «Команде»: вкладки · тип · роль (админ) · сброс */}
      <div
        className="flex items-center gap-1.5 mb-5 flex-wrap animate-fade-up"
        style={{ animationDelay: '70ms' }}
      >
        <div className="segmented">
          {(
            [
              ['updates', 'Что нового'],
              ['all', 'Весь функционал'],
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (key === tab) return;
                setStagger(true);
                setTab(key);
              }}
              className={`segmented-item ${tab === key ? 'segmented-item-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        <FilterDropdown
          label="Тип"
          value={area}
          options={areaOptions}
          onChange={(v) => {
            setStagger(false);
            setArea(v);
          }}
          minWidth={240}
        />

        {isAdmin && (
          <FilterDropdown
            label="Роль"
            value={roleFilter}
            options={roleOptions}
            onChange={(v) => {
              setStagger(false);
              setRoleFilter(v);
            }}
          />
        )}

        {filtered && (
          <button type="button" onClick={resetFilters} className="btn-ghost h-10 py-0 ml-auto text-[13px]">
            Сбросить
          </button>
        )}
      </div>

      {isEmpty ? (
        <div className="card py-6 animate-fade-in">
          <EmptyState
            icon={<SearchIcon className="w-5 h-5" />}
            title="Под эти фильтры ничего нет"
            action={
              <button type="button" onClick={resetFilters} className="btn-secondary btn-sm">
                Сбросить фильтры
              </button>
            }
          />
        </div>
      ) : tab === 'updates' ? (
        <ul className="flex flex-col gap-4">
          {visibleUpdates.map((u, i) => (
            <UpdateCard
              key={u.id}
              update={u}
              isOpen={open.has(u.id)}
              isNew={seen !== null && u.date > seen}
              showRoles={isAdmin}
              onToggle={() => toggle(u.id)}
              {...enter(i)}
            />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-4">
          {visibleSections.map((s, i) => (
            <SectionCard key={s.id} section={s} showRoles={isAdmin} {...enter(i)} />
          ))}
        </div>
      )}
    </main>
  );
}

/** Карточка обновления: шапка кликабельна целиком, детали — раскрываются. */
function UpdateCard({
  update: u,
  isOpen,
  isNew,
  showRoles,
  onToggle,
  className,
  style,
}: {
  update: FeatureUpdate;
  isOpen: boolean;
  isNew: boolean;
  showRoles: boolean;
  onToggle: () => void;
  className: string;
  style?: React.CSSProperties;
}) {
  const detailsId = `update-${u.id}`;
  // Свёрнутые детали остаются в DOM ради анимации, но не должны ловить фокус
  // и поиск по странице. inert — через DOM: React 18 не знает этот атрибут
  // и булево значение в разметку не пишет.
  const detailsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (detailsRef.current) detailsRef.current.inert = !isOpen;
  }, [isOpen]);

  return (
    <li className={`card px-8 py-7 ${className}`} style={style}>
      <div
        className="group cursor-pointer"
        onClick={() => {
          // Выделяли текст мышью — не сворачиваем карточку под курсором
          if (window.getSelection()?.toString()) return;
          onToggle();
        }}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="chip-neutral h-6 tabular-nums">{formatDateShort(u.date)}</span>
          <span className="chip-neutral h-6">{areaLabel(u.area)}</span>
          {isNew && <span className="chip-accent h-6">Новое</span>}
          <span className="ml-auto flex items-center gap-4 pl-4">
            {showRoles && <RoleChips roles={u.roles} />}
            {/* 40×40 в ряду чипов высотой 24: -my-2 держит ряд по чипам,
                кнопка центрирована по ним. «+» и «−» оба в DOM — кросс-фейд. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              aria-expanded={isOpen}
              aria-controls={detailsId}
              aria-label={u.title}
              className="relative -my-2 w-10 h-10 shrink-0 rounded-pill bg-ink/5 text-stone
                         group-hover:bg-ink/10 group-hover:text-ink active:scale-[0.96]
                         transition-[background-color,color,transform] duration-150 ease-out"
            >
              <ToggleGlyph shown={!isOpen}>
                <PlusIcon className="w-4 h-4" />
              </ToggleGlyph>
              <ToggleGlyph shown={isOpen}>
                <MinusGlyph />
              </ToggleGlyph>
            </button>
          </span>
        </div>
        <h2 className="mt-4 text-[22px] leading-[1.25] font-medium tracking-[-0.01em] text-ink text-balance">
          {u.title}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-stone max-w-[720px] text-pretty">
          {u.summary}
        </p>
      </div>

      {/* Раскрытие — через grid-rows 0fr → 1fr: переход прерываемый, высоту
          контента знать не нужно */}
      <div
        ref={detailsRef}
        id={detailsId}
        aria-hidden={isOpen ? undefined : true}
        className="grid transition-[grid-template-rows] duration-[250ms] ease-out"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <ul className="mt-6 pt-6 border-t border-cloud/60 grid md:grid-cols-2 gap-x-12 gap-y-4">
            {u.details.map((d, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-lime shrink-0" aria-hidden />
                <span className="text-[14px] leading-relaxed text-ink/90 text-pretty">
                  {d.text}
                  {showRoles && d.roles && (
                    <span className="ml-2 align-middle inline-flex">
                      <RoleChips roles={d.roles} />
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}

/** Раздел справочника: слева — что это, справа — из чего состоит. */
function SectionCard({
  section: s,
  showRoles,
  className,
  style,
}: {
  section: FeatureSection;
  showRoles: boolean;
  className: string;
  style?: React.CSSProperties;
}) {
  return (
    <section className={`card px-8 py-8 ${className}`} style={style}>
      <div className="grid grid-cols-[280px_1fr] gap-12">
        <div>
          <h2 className="text-[22px] leading-[1.25] font-medium tracking-[-0.01em] text-ink text-balance">
            {s.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-stone text-pretty">{s.summary}</p>
          <div className="mt-4 flex items-center gap-1.5 flex-wrap">
            <span className="chip-neutral h-6">{areaLabel(s.area)}</span>
            {showRoles && <RoleChips roles={s.roles} />}
          </div>
        </div>
        <dl>
          {s.items.map((it, i) => (
            <div
              key={i}
              className="grid grid-cols-[180px_1fr] gap-6 py-3.5 border-t border-cloud/50
                         first:pt-0 first:border-t-0 last:pb-0"
            >
              <dt className="text-sm text-stone">{it.title}</dt>
              <dd className="text-sm leading-relaxed text-ink/90 text-pretty">
                {it.text}
                {showRoles && it.roles && (
                  <span className="ml-2 align-middle inline-flex">
                    <RoleChips roles={it.roles} />
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** Кому видна запись — тише чипа области: меньше и контуром, без заливки. */
function RoleChips({ roles }: { roles: FeatureRole[] }) {
  return (
    <span className="inline-flex gap-1">
      {roles.map((r) => (
        <span key={r} className="chip h-5 px-2 text-[10px] text-stone border border-cloud">
          {ROLE_LABEL[r]}
        </span>
      ))}
    </span>
  );
}

/** Значок в кнопке раскрытия: появляется из размытия и масштаба 0.25. */
function ToggleGlyph({ shown, children }: { shown: boolean; children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className={`absolute inset-0 flex items-center justify-center
                  transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]
                  ${shown ? 'opacity-100 scale-100 blur-0' : 'opacity-0 scale-[0.25] blur-[4px]'}`}
    >
      {children}
    </span>
  );
}

/** «−» в геометрии PlusIcon (та же толщина и длина штриха). */
function MinusGlyph() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M5 11H19V13H5V11Z" />
    </svg>
  );
}

function prevDay(isoDate: string): string {
  return new Date(Date.parse(isoDate + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
}
