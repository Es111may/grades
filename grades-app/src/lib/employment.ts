// Формат занятости (Phase 23.4): штатный или почасовщик. И билды без грейдов.
//
// Почасовщик — такой же дизайнер, но:
//   • не грейдируется: нет даты грейдирования, оценок, сигналов о них;
//   • не входит в таланты: NIPC, 9-Box, рейтинг и подиум;
//   • его задачи учитываются в «в срок» команды — это реальная работа.
// Решения Pavel, 29.09.2026. Правила собраны здесь, чтобы сервер (page.tsx)
// и клиент (computeScopedStats) считали одинаково.
//
// Билд без грейдов (Pavel, 01.10.2026) — то же самое, но по билду, а не по
// формату: «Коммуникации» (коммуникационный дизайнер в отделе «Инхаус»).
// Матрицы, весов и гейтов у такого билда нет; человек виден в «Команде»,
// входит в «в срок», в «Экономике» — в ФОТ, численность и строку «Без грейда».

export type EmploymentType = 'staff' | 'hourly';

/**
 * Билды без грейдов: код → название. Строку в `builds` заводит
 * oneTimeMigrations (ensureNonGradingBuilds); страницы матрицы и грейдов
 * такие билды не показывают.
 */
export const NON_GRADING_BUILDS: Readonly<Record<string, string>> = {
  communications: 'Коммуникации',
};
export const NON_GRADING_BUILD_CODES: ReadonlySet<string> = new Set(Object.keys(NON_GRADING_BUILDS));

/** Prisma-фильтр билдов с матрицей: для страниц весов, гейтов и порогов. */
export const GRADING_BUILD_WHERE = {
  code: { notIn: Array.from(NON_GRADING_BUILD_CODES) },
};

type WithEmployment = { employmentType?: string | null };
/**
 * Билд человека: связь `build` (строка Prisma, строка «Команды») или плоский
 * `buildCode` («Экономика», сессия). Поле обязательно, значение может быть
 * null: забытый в выборке билд молча вернул бы человека из билда без
 * грейдов в грейдирование — пусть это ловит компилятор.
 */
export type WithBuild = { build: { code: string } | null } | { buildCode: string | null };
type Person = WithEmployment & WithBuild & { role: string; active: boolean };

export function isHourly(u: WithEmployment): boolean {
  return u.employmentType === 'hourly';
}

/** Код билда — из связи или плоского поля; null — билд не назначен. */
export function buildCodeOf(u: WithBuild): string | null {
  const b = u as { build?: { code: string } | null; buildCode?: string | null };
  return b.build?.code ?? b.buildCode ?? null;
}

/** Билд без грейдов — «Коммуникации». */
export function isNonGradingBuild(u: WithBuild): boolean {
  const code = buildCodeOf(u);
  return code !== null && NON_GRADING_BUILD_CODES.has(code);
}

/**
 * Вне грейдирования по формату или билду — независимо от роли и активности.
 * Там, где роль и активность уже отфильтрованы (talentDesigners, места в
 * рейтинге), этого достаточно; иначе — isGradable.
 */
export function isGradingExempt(u: WithEmployment & WithBuild): boolean {
  return isHourly(u) || isNonGradingBuild(u);
}

/**
 * Участвует в грейдировании и талантах: дизайнер или стардиз, активен,
 * не почасовщик и не в билде без грейдов.
 */
export function isGradable(u: Person): boolean {
  return (u.role === 'designer' || u.role === 'stardiz') && u.active && !isGradingExempt(u);
}

/** Дизайнер, чья работа идёт в «в срок» команды — включая почасовщиков и билды без грейдов. */
export function countsForOnTime(u: { role: string; active: boolean }): boolean {
  return u.role === 'designer' && u.active;
}

/** Подпись-причина для билда без грейдов: «Билд «Коммуникации» — без грейдов». */
export function nonGradingBuildNote(u: WithBuild): string | null {
  const code = buildCodeOf(u);
  if (code === null || !NON_GRADING_BUILD_CODES.has(code)) return null;
  return `Билд «${NON_GRADING_BUILDS[code]}» — без грейдов`;
}

/** Текст отказа API оценок, когда isGradable = false. */
export function notGradableError(u: WithBuild): string {
  return nonGradingBuildNote(u) ?? 'Почасовщиков и неактивных не грейдируют';
}

/**
 * Кто может перевести дизайнера в почасовщики и обратно: админ — любого,
 * лид — своего подопечного. Стардиз — нет. Статус есть только у дизайнеров.
 */
export function canSetEmploymentType(
  me: { id: number; role: string } | null,
  target: { role: string; leadId: number | null },
): boolean {
  if (!me || target.role !== 'designer') return false;
  if (me.role === 'admin') return true;
  return me.role === 'lead' && target.leadId === me.id;
}
