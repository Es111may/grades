/**
 * Работа с циклами оценок.
 *
 * Цикл — строка вида "YYYY-MM". Раньше система поддерживала только
 * "YYYY-04" и "YYYY-10" (регулярные апрель и октябрь). Сейчас разрешён
 * любой месяц — для оценок после испытательного срока, ad-hoc reassessments,
 * и т.п. Регулярные циклы остаются default'ом.
 */

const MONTH_NAMES_RU: Record<string, string> = {
  '01': 'январь',
  '02': 'февраль',
  '03': 'март',
  '04': 'апрель',
  '05': 'май',
  '06': 'июнь',
  '07': 'июль',
  '08': 'август',
  '09': 'сентябрь',
  '10': 'октябрь',
  '11': 'ноябрь',
  '12': 'декабрь',
};

/** Текущий месяц в формате YYYY-MM (например, "2026-05"). */
export function currentCycle(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Регулярный цикл (апрель или октябрь) — ближайший в этом полугодии. */
export function regularCycle(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  return month <= 6 ? `${now.getFullYear()}-04` : `${now.getFullYear()}-10`;
}

/** Человекочитаемое название: "май 2026", "апрель 2026" и т.д. */
export function cycleName(cycle: string): string {
  const [y, m] = cycle.split('-');
  const monthName = MONTH_NAMES_RU[m] ?? m;
  return `${monthName} ${y}`;
}

/** Тип цикла: регулярный (апрель/октябрь) или ad-hoc. */
export function isRegularCycle(cycle: string): boolean {
  return cycle.endsWith('-04') || cycle.endsWith('-10');
}

/**
 * Сгенерировать варианты циклов для селектора.
 * Возвращает: текущий месяц, ближайший регулярный, и пару следующих регулярных.
 */
export function suggestedCycles(): { value: string; label: string; hint?: string }[] {
  const now = new Date();
  const year = now.getFullYear();
  const cur = currentCycle();
  const reg = regularCycle();

  const seen = new Set<string>();
  const out: { value: string; label: string; hint?: string }[] = [];

  function add(value: string, hint?: string) {
    if (seen.has(value)) return;
    seen.add(value);
    out.push({ value, label: cycleName(value), hint });
  }

  add(cur, isRegularCycle(cur) ? 'регулярный' : 'текущий месяц (испытательный / ad-hoc)');
  add(reg, isRegularCycle(cur) ? undefined : 'ближайший регулярный');
  add(`${year}-04`, 'регулярный');
  add(`${year}-10`, 'регулярный');
  add(`${year + 1}-04`, 'регулярный');

  return out;
}
