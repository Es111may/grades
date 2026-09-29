// Компенсация человека (Phase 23.4) — чистые функции без запросов к HR.
//
// На входе: запись сотрудника и журнал изменений ставки из HR-портала
// (`salary_changesalarylog`), премии из Грейдов, плановый пересмотр.
// На выходе: то, что показываем в поп-апе и истории.
//
// Правила, выведенные из сверки с таблицей Pavel (29.09.2026):
//   • суммы берём только из журнала изменений — в старых запросах HR они
//     пустые («0 → 0»);
//   • изменение в первую неделю после найма — это стартовая ставка, а не
//     повышение (HR оформляет её как «100 → 110» в день выхода);
//   • запись журнала с датой в будущем — «вступит в силу», в текущую ставку
//     не входит;
//   • если в HR человек уволен, а в Грейдах работает (вернулся, а HR не
//     обновили), старые цифры не показываем — это отдельное состояние.

import { bandFor, bandState, type BandState } from './salaryBands';

export type HrEmployee = {
  /** Ставка из карточки сотрудника, ₽. Запасной источник, если журнала нет. */
  salary: number;
  hiredAt: string | null;
  dismissedAt: string | null;
};
export type HrLogRow = { date: string; from: number; to: number };
export type BonusRow = { id: number; amount: number; paidAt: string; note: string | null };
export type PlannedRaiseInput = {
  setAt: string | null;
  at: string | null;
  salary: number | null;
  note: string | null;
};

export type CompEvent =
  | { kind: 'hire'; date: string; to: number }
  | {
      kind: 'raise' | 'decrease';
      date: string;
      from: number;
      to: number;
      delta: number;
      pct: number | null;
      future: boolean;
    }
  | { kind: 'bonus'; id: number; date: string; amount: number; note: string | null };

export type CompensationView =
  | { state: 'no_hr' }
  | { state: 'hr_dismissed'; dismissedAt: string }
  | {
      state: 'ok';
      current: number;
      hourly: boolean;
      band: { min: number; max: number; state: BandState; overBy: number } | null;
      since: { label: 'с начала года' | 'с найма'; from: number; pct: number | null; warn: boolean } | null;
      lastChange: { date: string; delta: number } | null;
      events: CompEvent[];
    };

/** Рост больше этого за период — предупреждение (правило из таблицы Pavel). */
export const GROWTH_WARN_PCT = 30;
/** Сколько дней после найма изменение ставки считается стартовой ставкой. */
const HIRE_WINDOW_DAYS = 7;

const day = (iso: string) => iso.slice(0, 10);
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(day(iso) + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

function isHireRow(r: HrLogRow, hiredAt: string | null): boolean {
  if (r.from <= 0) return true;
  if (!hiredAt) return false;
  const d = day(r.date);
  return d >= day(hiredAt) && d <= addDays(hiredAt, HIRE_WINDOW_DAYS);
}

/** Журнал по возрастанию даты, без записей «ставка не изменилась». */
function normalized(log: HrLogRow[]): HrLogRow[] {
  return log
    .filter((r) => r.to !== r.from)
    .map((r) => ({ ...r, date: day(r.date) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function buildCompensation(input: {
  hr: HrEmployee | null;
  log: HrLogRow[];
  bonuses: BonusRow[];
  role: string;
  grade: string | null;
  employmentType?: string | null;
  activeInGrades: boolean;
  today: string;
}): CompensationView {
  const { hr, bonuses, role, grade, employmentType, activeInGrades } = input;
  const today = day(input.today);
  if (!hr) return { state: 'no_hr' };

  const dismissed = hr.dismissedAt && day(hr.dismissedAt) > '2000' ? day(hr.dismissedAt) : null;
  if (dismissed && dismissed <= today && activeInGrades) {
    return { state: 'hr_dismissed', dismissedAt: dismissed };
  }

  const log = normalized(input.log);
  const past = log.filter((r) => r.date <= today);
  const current = past.length ? past[past.length - 1].to : hr.salary;

  // Изменения — всё, кроме стартовой ставки
  const events: CompEvent[] = log.map((r) =>
    isHireRow(r, hr.hiredAt)
      ? { kind: 'hire', date: r.date, to: r.to }
      : {
          kind: r.to > r.from ? 'raise' : 'decrease',
          date: r.date,
          from: r.from,
          to: r.to,
          delta: r.to - r.from,
          pct: r.from > 0 ? ((r.to - r.from) / r.from) * 100 : null,
          future: r.date > today,
        },
  );
  for (const b of bonuses) {
    events.push({ kind: 'bonus', id: b.id, date: day(b.paidAt), amount: b.amount, note: b.note });
  }
  events.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));

  const lastPastChange = [...events]
    .filter((e): e is Extract<CompEvent, { kind: 'raise' | 'decrease' }> =>
      (e.kind === 'raise' || e.kind === 'decrease') && !e.future,
    )[0];

  // «С начала года» или «с найма», если человек пришёл в этом году
  const jan1 = `${today.slice(0, 4)}-01-01`;
  const hiredThisYear = !!hr.hiredAt && day(hr.hiredAt) > jan1;
  let base: number | null;
  if (hiredThisYear) {
    const first = past[0];
    base = first ? (isHireRow(first, hr.hiredAt) ? first.to : first.from) : current;
  } else {
    const before = past.filter((r) => r.date <= jan1);
    const after = past.filter((r) => r.date > jan1);
    base = before.length ? before[before.length - 1].to : after.length ? after[0].from : current;
  }
  const pct = base && base > 0 ? ((current - base) / base) * 100 : null;
  const since = base
    ? {
        label: hiredThisYear ? ('с найма' as const) : ('с начала года' as const),
        from: base,
        pct,
        warn: pct != null && pct > GROWTH_WARN_PCT,
      }
    : null;

  const b = bandFor({ role, grade, employmentType });
  const band = b
    ? {
        min: b.min,
        max: b.max,
        state: bandState(current, b),
        overBy: Math.max(0, current - b.max),
      }
    : null;

  return {
    state: 'ok',
    current,
    hourly: employmentType === 'hourly',
    band,
    since,
    lastChange: lastPastChange ? { date: lastPastChange.date, delta: lastPastChange.delta } : null,
    events,
  };
}

export type PlannedRaiseState = 'none' | 'active' | 'done';

/**
 * Состояние планового пересмотра. «Выполнен» не хранится флагом: он
 * выводится из HR — есть повышение (не стартовая ставка) с датой не раньше
 * постановки статуса. Так же устроена дата грейдирования (lib/gradingPlan).
 */
export function plannedRaiseState(
  planned: Pick<PlannedRaiseInput, 'setAt'>,
  log: HrLogRow[],
  hiredAt: string | null,
): PlannedRaiseState {
  if (!planned.setAt) return 'none';
  const since = day(planned.setAt);
  const raised = normalized(log).some(
    (r) => r.to > r.from && !isHireRow(r, hiredAt) && r.date >= since,
  );
  return raised ? 'done' : 'active';
}

/** «130», «104,9» — тысячи рублей для подписи «тыс. ₽». */
export function formatThousands(rub: number): string {
  const t = rub / 1000;
  return Number.isInteger(t)
    ? t.toLocaleString('ru-RU')
    : t.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}
