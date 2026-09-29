'use client';

import { useEffect, useState } from 'react';
import TitleAurora from '@/components/TitleAurora';
import { formatDateShort } from '@/lib/dates';
import type { FeatureRole, FeatureSection, FeatureUpdate } from '@/lib/features';

const ROLE_LABEL: Record<FeatureRole, string> = { admin: 'Админ', lead: 'Лид', stardiz: 'Стардиз' };
const SEEN_KEY = 'features-seen';

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
  const [tab, setTab] = useState<Tab>('updates');
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

  return (
    <main className="max-w-[1240px] mx-auto px-8 pt-[164px] pb-16">
      <div className="text-center mb-[120px] animate-fade-up title-halo">
        <TitleAurora />
        <h1 className="font-display text-[64px] leading-none font-medium tracking-[-0.035em]">
          Функционал
        </h1>
      </div>

      <div className="max-w-[760px] mx-auto">
        <div className="flex justify-center mb-6">
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
                onClick={() => setTab(key)}
                className={`segmented-item ${tab === key ? 'segmented-item-active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {role === 'admin' && (
          <p className="text-center text-xs text-stone mb-6">
            Ты видишь всё. У каждой записи отмечено, кому она показывается.
          </p>
        )}

        {tab === 'updates' ? (
          <ul className="flex flex-col gap-3">
            {updates.map((u) => {
              const isOpen = open.has(u.id);
              const isNew = seen !== null && u.date > seen;
              return (
                <li key={u.id} className="card">
                  <button
                    type="button"
                    onClick={() => toggle(u.id)}
                    aria-expanded={isOpen}
                    className="w-full text-left px-5 py-4 flex items-start gap-4"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="label-mono text-stone">{formatDateShort(u.date)}</span>
                        {isNew && <span className="chip-accent h-5 text-[10px]">новое</span>}
                        {role === 'admin' && <RoleChips roles={u.roles} />}
                      </span>
                      <span className="block font-medium text-[15px] mt-1.5 text-ink">{u.title}</span>
                      <span className="block text-sm text-stone mt-1">{u.summary}</span>
                    </span>
                    <span
                      className="w-8 h-8 shrink-0 rounded-pill flex items-center justify-center text-lg leading-none text-stone"
                      aria-hidden
                    >
                      {isOpen ? '−' : '+'}
                    </span>
                  </button>
                  {isOpen && (
                    <ul className="px-5 pb-5 -mt-1 flex flex-col gap-2 text-sm">
                      {u.details.map((d, i) => (
                        <li key={i} className="flex gap-2.5">
                          <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-lime shrink-0" aria-hidden />
                          <span className="text-ink/90">
                            {d.text}
                            {role === 'admin' && d.roles && (
                              <span className="ml-1.5 align-middle inline-flex">
                                <RoleChips roles={d.roles} />
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col gap-3">
            {sections.map((s) => (
              <section key={s.id} className="card px-5 py-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-medium text-[15px] text-ink">{s.title}</h2>
                  {role === 'admin' && <RoleChips roles={s.roles} />}
                </div>
                <p className="text-sm text-stone mt-1">{s.summary}</p>
                <dl className="mt-3 flex flex-col gap-2 text-sm">
                  {s.items.map((it, i) => (
                    <div key={i} className="grid grid-cols-[180px_1fr] gap-4">
                      <dt className="text-stone">{it.title}</dt>
                      <dd className="text-ink/90">
                        {it.text}
                        {role === 'admin' && it.roles && (
                          <span className="ml-1.5 align-middle inline-flex">
                            <RoleChips roles={it.roles} />
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function RoleChips({ roles }: { roles: FeatureRole[] }) {
  return (
    <span className="inline-flex gap-1">
      {roles.map((r) => (
        <span key={r} className="chip-neutral h-5 text-[10px]">
          {ROLE_LABEL[r]}
        </span>
      ))}
    </span>
  );
}

function prevDay(isoDate: string): string {
  return new Date(Date.parse(isoDate + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
}
