'use client';

// «Найм и уходы за 12 мес»: наймы, уходы, отток против компании, разбивка
// по инициатору и восемь причин HR (раскрываются в людей). «Все причины» —
// полный список подкатегорий. Причины видит только админ (вся страница —
// только админу, проверка на сервере).

import { useId, useState } from 'react';
import Avatar from '@/components/Avatar';
import {
  fmtDate,
  LEVEL_LABEL,
  NO_REASON_GROUP,
  plural,
  type Churn,
  type ExitRow,
} from '@/lib/economics';
import { Collapse, DEPT_LABEL, Info, InitiatorChip, Rate, SheetTerm, ToggleButton } from './ui';

function LeaverRow({ x, showInitiator }: { x: ExitRow; showInitiator: boolean }) {
  const p = x.p;
  const role = [p.level ? LEVEL_LABEL[p.level] : null, p.dept ? DEPT_LABEL[p.dept] : null].filter(Boolean).join(' · ');
  return (
    <div className="flex gap-3">
      <Avatar name={p.name} avatarUrl={p.avatarUrl} size={28} className="mt-0.5 opacity-80 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-medium truncate">{p.name}</span>
          {role && <span className="text-[11px] text-stone truncate">{role}</span>}
          <span className="ml-auto text-[11px] text-stone tabular-nums shrink-0">{fmtDate(x.date)}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-xs ${x.reason ? 'text-ink/90' : 'text-ash'}`}>{x.reason ?? 'Причина не указана'}</span>
          {showInitiator && <InitiatorChip initiator={x.initiator} />}
        </div>
        {x.note && <div className="text-xs text-stone mt-0.5 text-pretty">{x.note}</div>}
      </div>
    </div>
  );
}

export default function ChurnCard({
  c,
  companyTurnoverPct,
  ytd,
  hireAvg,
  windowLabel,
}: {
  c: Churn;
  companyTurnoverPct: number | null;
  ytd: { hires: number; exits: number };
  hireAvg: { count: number; avg: number } | null;
  windowLabel: string;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [all, setAll] = useState(false);
  const baseId = useId();
  const split = c.byEmployee + c.byCompany;
  const toggle = (id: string) =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const over = c.turnoverPct != null && companyTurnoverPct != null && c.turnoverPct > companyTurnoverPct;
  const tiles = [
    {
      label: 'Наймы',
      value: String(c.hires),
      caption: `С 1 января — ${ytd.hires}`,
      info: hireAvg ? (
        <>
          Средняя стартовая ставка нанятых с 1 января — <Rate rub={hireAvg.avg} /> тыс., по {hireAvg.count}{' '}
          {plural(hireAvg.count, ['найму', 'наймам', 'наймам'])}.
          <SheetTerm term="ССЗП" />
        </>
      ) : null,
    },
    { label: 'Уходы', value: String(c.exits), caption: `С 1 января — ${ytd.exits}`, info: null },
    {
      label: 'Отток',
      value: c.turnoverPct == null ? '—' : `${Math.round(c.turnoverPct)}%`,
      caption: companyTurnoverPct == null ? 'Компания — нет данных' : `Компания — ${Math.round(companyTurnoverPct)}%`,
      info: 'Уходы за 12 месяцев к средней численности за те же месяцы. Компания — по статистике HR-портала.',
    },
  ];

  return (
    <section data-comment-anchor="economics-churn" className="card p-5 min-w-0 animate-fade-up" style={{ animationDelay: '420ms' }}>
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-base font-medium text-balance">Найм и уходы за 12 мес</h3>
        <span className="text-[11px] text-ash whitespace-nowrap tabular-nums">{windowLabel}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4">
        {tiles.map((s, i) => (
          // Подложка r-12 внутри карточки r-22 с отступом 20 — как остальные вложенные поверхности
          <div key={s.label} className="rounded-[12px] bg-canvas px-3.5 py-3 min-w-0">
            <div className="flex items-center gap-1.5 h-3.5">
              <span className="label-mono text-stone">{s.label}</span>
              {s.info && <Info align={i === 2 ? 'right' : 'left'} text={s.info} />}
            </div>
            <div className="font-display text-[28px] leading-none font-medium tracking-tight mt-2.5 tabular-nums">
              {s.value}
            </div>
            <div className="text-[11px] text-stone mt-1.5 flex items-center gap-1.5 tabular-nums">
              {i === 2 && over && <span className="w-1.5 h-1.5 rounded-full bg-sunset shrink-0" aria-hidden />}
              <span className="truncate">{s.caption}</span>
            </div>
          </div>
        ))}
      </div>

      {split > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3 text-[11px] text-stone mb-1.5 tabular-nums">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1.5 rounded-full bg-ink/30" />
              По желанию сотрудника · {c.byEmployee}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-1.5 rounded-full bg-sky" />
              По решению компании · {c.byCompany}
            </span>
          </div>
          <div className="flex h-1.5 gap-0.5" aria-hidden>
            {c.byEmployee > 0 && <div className="rounded-full bg-ink/30" style={{ flex: c.byEmployee }} />}
            {c.byCompany > 0 && <div className="rounded-full bg-sky" style={{ flex: c.byCompany }} />}
          </div>
          {c.unknown > 0 && (
            <div className="text-[11px] text-ash mt-1.5 tabular-nums">Инициатор не указан · {c.unknown}</div>
          )}
        </div>
      )}

      {c.groups.length === 0 ? (
        <div className="mt-4 text-sm text-stone">Справочник причин HR недоступен</div>
      ) : !all ? (
        <ul className="mt-4">
          {c.groups.map((g) => {
            const n = g.exits.length;
            const isOpen = open.has(g.id);
            const id = `${baseId}-${g.id}`;
            return (
              <li key={g.id} className="border-t border-cloud/60">
                <div
                  className={`group flex items-center gap-2.5 py-1.5 min-h-11 ${n ? 'cursor-pointer' : ''}`}
                  onClick={n ? () => toggle(g.id) : undefined}
                >
                  <span className={`text-[13px] flex-1 min-w-0 truncate ${n ? 'font-medium' : 'text-ash'}`}>{g.title}</span>
                  {g.id !== NO_REASON_GROUP && (
                    <span className={n ? '' : 'opacity-50'}>
                      <InitiatorChip initiator={g.initiator} />
                    </span>
                  )}
                  <span className={`w-6 text-right tabular-nums text-[13px] ${n ? 'font-medium' : 'text-ash'}`}>{n}</span>
                  {n ? (
                    <ToggleButton
                      open={isOpen}
                      label={`${g.title}: люди`}
                      controls={id}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(g.id);
                      }}
                    />
                  ) : (
                    <span className="w-8 shrink-0" />
                  )}
                </div>
                {n > 0 && (
                  <Collapse open={isOpen} id={id}>
                    <div className="pb-3">
                      <div className="rounded-[12px] bg-canvas px-3.5 py-3 flex flex-col gap-3">
                        {g.exits.map((x) => (
                          <LeaverRow key={`${x.p.key}-${x.date}`} x={x} showInitiator={g.id === NO_REASON_GROUP} />
                        ))}
                      </div>
                    </div>
                  </Collapse>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {c.groups
            .filter((g) => g.id !== NO_REASON_GROUP)
            .map((g) => (
              <div key={g.id}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="label-mono text-stone">{g.title}</span>
                  <InitiatorChip initiator={g.initiator} />
                </div>
                {g.subs.length === 0 ? (
                  <div className="text-[13px] text-ash py-1.5">Подкатегорий нет · {g.exits.length}</div>
                ) : (
                  g.subs.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 py-1.5 border-t border-cloud/50 first:border-t-0">
                      <span className={`text-[13px] flex-1 ${s.count ? '' : 'text-ash'}`}>{s.title}</span>
                      <span className={`tabular-nums text-[13px] ${s.count ? 'font-medium' : 'text-ash'}`}>{s.count}</span>
                    </div>
                  ))
                )}
              </div>
            ))}
          {c.groups.some((g) => g.id === NO_REASON_GROUP) && (
            <div className="flex items-center gap-3 py-1.5 border-t border-cloud/50">
              <span className="text-[13px] flex-1">Без причины в HR</span>
              <span className="tabular-nums text-[13px] font-medium">
                {c.groups.find((g) => g.id === NO_REASON_GROUP)!.exits.length}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-cloud/60 flex items-center justify-between gap-3">
        {c.groups.length > 0 ? (
          <button
            type="button"
            aria-pressed={all}
            onClick={() => setAll((v) => !v)}
            className="btn-ghost btn-sm -ml-3 h-8 active:scale-[0.96]"
          >
            {all ? 'По группам' : 'Все причины'}
          </button>
        ) : (
          <span />
        )}
        <span className="text-[11px] text-ash text-right">Причины видит только админ</span>
      </div>
    </section>
  );
}
