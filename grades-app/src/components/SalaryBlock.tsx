'use client';

import { useCallback, useEffect, useState } from 'react';
import { CloseIcon } from '@/components/icons';
import { formatDateShort } from '@/lib/dates';
import {
  formatThousands,
  type CompEvent,
  type CompensationView,
  type PlannedRaiseState,
} from '@/lib/compensation';
import type { PlannedRaiseRow } from '@/components/PlannedRaiseBadge';

type ApiView = CompensationView | { state: 'hr_unavailable' };
type Planned = {
  state: PlannedRaiseState;
  setAt: string | null;
  at: string | null;
  salary: number | null;
  note: string | null;
  setBy: string | null;
};
type Data = { view: ApiView; planned: Planned; can: { editPlanned: boolean; editBonuses: boolean } };

const tys = (rub: number) => `${formatThousands(rub)} тыс.`;
const signed = (rub: number) =>
  `${rub > 0 ? '+' : rub < 0 ? '−' : ''}${formatThousands(Math.abs(rub))}`;
const pctStr = (p: number) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(Math.round(p))}%`;

/**
 * Блок «Зарплата» (Phase 23.4) — в поп-апе 360 и на странице дизайнера.
 *
 * Данные — из /api/users/[id]/compensation; права проверяет сервер, блок
 * рендерят только админу и лиду по своим людям. Прятать суммы при показе
 * экрана — глобальный выключатель в шапке: корень помечен salary-sensitive.
 *
 *  • popup    — всё сразу, история под линией;
 *  • portrait — текущая зарплата одной строкой, остальное по «+».
 */
export default function SalaryBlock({
  userId,
  variant,
  editSignal = 0,
  onPlannedChange,
}: {
  userId: number;
  variant: 'popup' | 'portrait';
  /** Растёт при «Запланировать пересмотр» в меню «⋯» — открывает редактор. */
  editSignal?: number;
  onPlannedChange?: (planned: PlannedRaiseRow | null) => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const r = await fetch(`/api/users/${userId}/compensation`);
      if (!r.ok) throw new Error(String(r.status));
      setData(await r.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Меню «⋯» → «Запланировать пересмотр»: сразу редактор и свежие данные
  useEffect(() => {
    if (editSignal > 0) {
      setEditing(true);
      setExpanded(true);
      void load();
    }
    // load стабилен в рамках userId; реагируем только на новый сигнал
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSignal]);

  const view = data?.view;
  const planned = data?.planned;
  const current = view?.state === 'ok' ? view.current : null;

  const headline = (
    <>
      {loading && !data && <span className="text-stone italic">Загрузка…</span>}
      {error && <span className="text-ash italic">Не удалось загрузить</span>}
      {view?.state === 'ok' && (
        <>
          <span className="text-ink">{tys(view.current)} ₽/мес</span>
          {view.hourly ? (
            <span className="chip-neutral h-6">почасовка</span>
          ) : view.band ? (
            view.band.state === 'above' ? (
              <span className="chip-danger h-6">выше вилки на {formatThousands(view.band.overBy)}</span>
            ) : (
              <span className="chip-success h-6">
                {view.band.state === 'within' ? 'в вилке' : 'ниже вилки'}
              </span>
            )
          ) : null}
        </>
      )}
      {view && view.state !== 'ok' && <span className="text-ash">нет данных</span>}
    </>
  );

  const notice =
    view?.state === 'hr_unavailable' ? (
      <p className="text-ash">HR-портал сейчас недоступен — зарплата и история не загрузились.</p>
    ) : view?.state === 'no_hr' ? (
      <p className="text-ash">Нет данных в HR-портале.</p>
    ) : view?.state === 'hr_dismissed' ? (
      <p className="text-ash">
        В HR-портале — увольнение с {formatDateShort(view.dismissedAt)}, актуальных данных нет.
        Если человек вернулся, возвращение нужно оформить в HR.
      </p>
    ) : null;

  const details = (
    <div className="flex flex-col gap-3">
      {notice}
      {view?.state === 'ok' && (
        <>
          {view.band && (
            <BandMeter
              min={view.band.min}
              max={view.band.max}
              current={view.current}
              planned={planned?.state === 'active' ? planned.salary : null}
            />
          )}
          {view.since && (
            <Row label={view.since.label === 'с найма' ? 'С найма' : 'С начала года'}>
              {view.since.pct === 0 || view.since.pct == null ? (
                <span className="text-stone">без изменений</span>
              ) : (
                <span className="text-ink">
                  {formatThousands(view.since.from)} → {formatThousands(view.current)}
                  <span className="text-stone"> · {pctStr(view.since.pct)}</span>
                </span>
              )}
              {view.since.warn && <span className="chip-warn h-6">рост больше 30%</span>}
            </Row>
          )}
          <Row label="Последний пересмотр">
            {view.lastChange ? (
              <span className="text-ink">
                {signed(view.lastChange.delta)}
                <span className="text-stone"> · {formatDateShort(view.lastChange.date)}</span>
              </span>
            ) : (
              <span className="text-ash">не было</span>
            )}
          </Row>
        </>
      )}
      {data && planned && (
        <PlannedRow
          userId={userId}
          planned={planned}
          current={current}
          canEdit={data.can.editPlanned}
          editing={editing}
          setEditing={setEditing}
          offerStart={variant === 'portrait'}
          onChanged={async (next) => {
            onPlannedChange?.(next);
            await load();
          }}
        />
      )}
    </div>
  );

  const history =
    view?.state === 'ok' && data ? (
      <History userId={userId} events={view.events} canEditBonuses={data.can.editBonuses} onChanged={load} />
    ) : null;

  if (variant === 'popup') {
    return (
      <div className="salary-sensitive flex flex-col gap-3">
        <Row label="Зарплата">{headline}</Row>
        {details}
        {history && <div className="border-t border-cloud pt-3">{history}</div>}
      </div>
    );
  }

  return (
    <section className="salary-sensitive card px-5 py-4 mb-6 text-sm">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="label-mono text-stone">Зарплата</span>
        <span className="flex items-center gap-2 flex-wrap">{headline}</span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Свернуть историю зарплаты' : 'Показать историю зарплаты'}
          className="ml-auto w-8 h-8 rounded-pill flex items-center justify-center text-lg leading-none
                     text-stone hover:text-ink hover:bg-ink/5 transition-colors"
        >
          {expanded ? '−' : '+'}
        </button>
      </div>
      {expanded && (
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-4 border-t border-cloud mt-4 pt-4">
          {details}
          {history ?? <div />}
        </div>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-stone shrink-0">{label}</span>
      <span className="ml-auto flex items-center gap-2 flex-wrap justify-end text-right">{children}</span>
    </div>
  );
}

/**
 * Шкала вилки: полоса «мин–макс», точка — текущая ставка (красная, если выше
 * вилки), полое кольцо — ставка после планового пересмотра.
 */
function BandMeter({
  min,
  max,
  current,
  planned,
}: {
  min: number;
  max: number;
  current: number;
  planned: number | null;
}) {
  const lo = Math.min(min, current, planned ?? current) * 0.92;
  const hi = Math.max(max, current, planned ?? current) * 1.06;
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const above = current > max;
  return (
    <div className="pt-1 pb-0.5">
      <div className="relative h-1.5 rounded-full bg-ink/[0.07]">
        <div
          className="absolute inset-y-0 rounded-full bg-emerald/30"
          style={{ left: pos(min), width: `calc(${pos(max)} - ${pos(min)})` }}
        />
        {planned != null && (
          <span
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-ink/50 bg-snow"
            style={{ left: pos(planned) }}
            title={`После пересмотра: ${formatThousands(planned)} тыс.`}
          />
        )}
        <span
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full ring-2 ring-snow ${
            above ? 'bg-blaze' : 'bg-emerald'
          }`}
          style={{ left: pos(current) }}
        />
      </div>
      <div className="relative h-4 mt-1 text-[11px] text-ash tabular-nums">
        <span className="absolute -translate-x-1/2" style={{ left: pos(min) }}>
          {formatThousands(min)}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: pos(max) }}>
          {formatThousands(max)}
        </span>
      </div>
    </div>
  );
}

function PlannedRow({
  userId,
  planned,
  current,
  canEdit,
  editing,
  setEditing,
  offerStart,
  onChanged,
}: {
  userId: number;
  planned: Planned;
  current: number | null;
  canEdit: boolean;
  editing: boolean;
  setEditing: (v: boolean) => void;
  /** Показать «Запланировать пересмотр», если статуса нет (там, где нет меню «⋯»). */
  offerStart: boolean;
  onChanged: (next: PlannedRaiseRow | null) => Promise<void>;
}) {
  const [at, setAt] = useState(planned.at ? planned.at.slice(0, 10) : '');
  const [salary, setSalary] = useState(planned.salary ? String(planned.salary / 1000) : '');
  const [note, setNote] = useState(planned.note ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setAt(planned.at ? planned.at.slice(0, 10) : '');
    setSalary(planned.salary ? String(planned.salary / 1000) : '');
    setNote(planned.note ?? '');
  }, [planned.at, planned.salary, planned.note]);

  async function save() {
    setBusy(true);
    setErr(null);
    const rub = salary.trim() ? Math.round(Number(salary.replace(',', '.')) * 1000) : null;
    if (rub !== null && (!Number.isFinite(rub) || rub <= 0)) {
      setErr('Ставка — число в тысячах, например 145');
      setBusy(false);
      return;
    }
    const res = await fetch(`/api/users/${userId}/planned-raise`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ at: at || null, salary: rub, note: note.trim() || null }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr('Не удалось сохранить');
      return;
    }
    const j = await res.json();
    setEditing(false);
    await onChanged({ at: j.at, salary: j.salary, note: j.note });
  }

  async function clear() {
    setBusy(true);
    const res = await fetch(`/api/users/${userId}/planned-raise`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) {
      setEditing(false);
      await onChanged(null);
    }
  }

  if (editing && canEdit) {
    return (
      <div className="rounded-card border border-cloud p-3 flex flex-col gap-2.5">
        <div className="text-stone">Плановый пересмотр</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-stone">
            Дата
            <input type="date" className="input" value={at} onChange={(e) => setAt(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-stone">
            Новая ставка, тыс.
            <input
              inputMode="decimal"
              className="input"
              placeholder={current ? formatThousands(current) : '145'}
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs text-stone">
          Обоснование
          <input
            className="input"
            placeholder="Например: после сдачи проекта"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {current && salary.trim() && Number.isFinite(Number(salary.replace(',', '.'))) && (
          <p className="text-xs text-stone">
            Прибавка {signed(Math.round(Number(salary.replace(',', '.')) * 1000) - current)} тыс.
          </p>
        )}
        {err && <p className="text-xs text-blaze">{err}</p>}
        <div className="flex items-center gap-2">
          <button type="button" className="btn-primary" disabled={busy} onClick={save}>
            Сохранить
          </button>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => setEditing(false)}>
            Отмена
          </button>
          {planned.setAt && (
            <button
              type="button"
              className="ml-auto text-xs text-blaze hover:underline"
              disabled={busy}
              onClick={clear}
            >
              Снять
            </button>
          )}
        </div>
      </div>
    );
  }

  if (planned.state === 'none') {
    if (!offerStart || !canEdit) return null;
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="self-start text-stone hover:text-ink transition-colors"
      >
        Запланировать пересмотр
      </button>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <span className="text-stone shrink-0">Плановый пересмотр</span>
      <span className="ml-auto text-right">
        {planned.state === 'done' ? (
          <span className="text-emerald">выполнен — в HR есть повышение</span>
        ) : (
          <span className="text-ink">
            {planned.at ? formatDateShort(planned.at) : 'дата не назначена'}
            {planned.salary && (
              <>
                {' '}→ {formatThousands(planned.salary)}
                {current && (
                  <span className="text-stone"> · {signed(planned.salary - current)}</span>
                )}
              </>
            )}
          </span>
        )}
        {planned.note && <span className="block text-xs text-stone mt-0.5">«{planned.note}»</span>}
        {canEdit && (
          <span className="block mt-1">
            {planned.state === 'active' && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs text-stone hover:text-ink transition-colors"
              >
                Изменить
              </button>
            )}
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              className="text-xs text-stone hover:text-blaze transition-colors ml-3"
            >
              Снять
            </button>
          </span>
        )}
      </span>
    </div>
  );
}

const EVENT_LABEL: Record<CompEvent['kind'], string> = {
  hire: 'Ставка при найме',
  raise: 'Пересмотр',
  decrease: 'Снижение',
  bonus: 'Премия',
};

function History({
  userId,
  events,
  canEditBonuses,
  onChanged,
}: {
  userId: number;
  events: CompEvent[];
  canEditBonuses: boolean;
  onChanged: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function addBonus() {
    const rub = Math.round(Number(amount.replace(',', '.')) * 1000);
    if (!Number.isFinite(rub) || rub <= 0) {
      setErr('Сумма — число в тысячах, например 50');
      return;
    }
    setErr(null);
    const res = await fetch(`/api/users/${userId}/bonuses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: rub, paidAt, note: note.trim() || null }),
    });
    if (!res.ok) {
      setErr('Не удалось сохранить премию');
      return;
    }
    setAdding(false);
    setAmount('');
    setNote('');
    await onChanged();
  }

  async function removeBonus(id: number) {
    const res = await fetch(`/api/bonuses/${id}`, { method: 'DELETE' });
    if (res.ok) await onChanged();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center">
        <span className="text-stone">История</span>
        {canEditBonuses && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="ml-auto text-xs text-stone hover:text-ink transition-colors"
          >
            + Премия
          </button>
        )}
      </div>

      {adding && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-stone">
              Сумма, тыс.
              <input
                inputMode="decimal"
                className="input"
                placeholder="50"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-stone">
              Дата
              <input type="date" className="input" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </label>
          </div>
          <input
            className="input"
            placeholder="Комментарий, по желанию"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {err && <p className="text-xs text-blaze">{err}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={addBonus}>
              Внести
            </button>
            <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {events.length === 0 && !adding && (
        <p className="text-xs text-ash">Пересмотров в HR-портале пока нет.</p>
      )}

      <ul className="flex flex-col divide-y divide-cloud">
        {events.map((e, i) => (
          <li key={`${e.kind}-${e.date}-${i}`} className="py-2 flex items-start gap-3 text-sm">
            <span className="text-stone tabular-nums w-[92px] shrink-0">
              {formatDateShort(e.date)}
            </span>
            <span className="flex-1 min-w-0">
              <span className="text-ink">{EVENT_LABEL[e.kind]}</span>
              {e.kind === 'hire' && <span className="text-stone"> · {tys(e.to)}</span>}
              {(e.kind === 'raise' || e.kind === 'decrease') && (
                <span className="text-stone">
                  {' '}· {formatThousands(e.from)} → {formatThousands(e.to)} · {signed(e.delta)}
                  {e.pct != null && ` (${pctStr(e.pct)})`}
                </span>
              )}
              {e.kind === 'bonus' && <span className="text-stone"> · {tys(e.amount)}</span>}
              {e.kind !== 'bonus' && e.kind !== 'hire' && e.future && (
                <span className="block text-xs text-sunset mt-0.5">вступит в силу</span>
              )}
              {e.kind === 'bonus' && e.note && (
                <span className="block text-xs text-stone mt-0.5">{e.note}</span>
              )}
            </span>
            {e.kind === 'bonus' && canEditBonuses && (
              <button
                type="button"
                onClick={() => removeBonus(e.id)}
                aria-label="Удалить премию"
                className="text-ash hover:text-blaze transition-colors p-0.5"
              >
                <CloseIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
