/**
 * Батчевый агрегат «% попадания в срок за 6 месяцев» — для лидерборда
 * и шапки портрета.
 *
 * В отличие от `clickhousePerf.ts` (детальный список задач для дашборда),
 * тут один большой запрос, который возвращает per-email агрегат:
 *
 *   { email → { onTimePercent: number, totalTasks: number } }
 *
 * и из тех же строк — месячную динамику команды для спарклайна (один SQL
 * на оба, см. `buildOnTimeRowsSQL`).
 *
 * Фильтры жёстко зашиты (как просил Pavel — «эталонная выборка»):
 *   - Только с эстимейтом       (estimate > 0)
 *   - Только завершённые задачи (collab task_list_name ∈ done/готово/...,
 *                                manage t.is_completed = 1)
 *   - Только где участвовал > 50% (pushed_by_dev / effective_team_push >= 50%)
 *   - Оба источника (collab + manage)
 *
 * Окно — скользящие 6 месяцев от сегодня (`subtractMonths(today(), 6)`).
 *
 * Возвращает агрегат через объединение двух источников. Если по email
 * нет ни одной задачи под фильтры — он отсутствует в результате. Caller
 * сам решает что показывать («Нет данных»).
 */

import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { getOrCompute, makeEmailsCacheKey, setCached, DEFAULT_TTL_MS } from './perfCache';

// ============================================================
// Singleton-клиент — отдельный от clickhousePerf.ts, чтобы не путать
// ============================================================

let _client: ClickHouseClient | null = null;

function getClient(): ClickHouseClient {
  if (_client) return _client;

  const host = process.env.CLICKHOUSE_HOST;
  const port = process.env.CLICKHOUSE_PORT;
  const user = process.env.CLICKHOUSE_USER;
  const password = process.env.CLICKHOUSE_PASSWORD;
  if (!host || !port || !user || !password) {
    throw new Error(
      'ClickHouse env vars not set. Нужны CLICKHOUSE_HOST/PORT/USER/PASSWORD.',
    );
  }
  _client = createClient({
    url: `http://${host}:${port}`,
    username: user,
    password,
    // Батч-запрос тяжелее одиночного: на холодную 5–8 с. Страницы ждут его
    // не дольше своего бюджета (withTimeout), а сам запрос дорабатывает в
    // фоне и дописывает кэш. 12 с — запас ×1,5 к холодному прогону; 20 с,
    // как раньше, только дольше держали зависшее соединение.
    request_timeout: 12000,
  });
  return _client;
}

// ============================================================
// Константы — те же, что в clickhousePerf.ts для совместимости
// ============================================================

/** Колонка в manage.worklog_task с направленной оценкой дизайна. */
const MANAGE_ESTIMATE_COL = 'estimate_design';

// ============================================================
// Типы
// ============================================================

export interface OnTimeStat {
  /** Сколько задач попало в выборку (после всех фильтров и 6-мес окна). */
  totalTasks: number;
  /** Сколько задач из них уложились в эстимейт (pushRatio ≤ 10%). */
  onTimeTasks: number;
  /** % попадания в срок. null если totalTasks=0. */
  onTimePercent: number | null;
}

/** Карта email → стата. Email в lowercase. */
export type OnTimeStatsByEmail = Map<string, OnTimeStat>;

// ============================================================
// SQL
// ============================================================

/**
 * Один SQL на оба агрегата «в срок» за 6 месяцев: счётчики по паре
 * (email, месяц последней записи времени по задаче).
 *
 * Раньше было два запроса с одинаковой внутренней выборкой — по email
 * (лидерборд) и по месяцу (спарклайн bento) — и оба гоняли тяжёлый JOIN по
 * `manage.worklog_timerecord`. count/countIf складываются, поэтому из пар
 * (email, месяц) обе группировки собираются без потерь: сумма по месяцам =
 * прежняя строка по email, сумма по email = прежняя строка по месяцу.
 *
 * Внутренний SELECT даёт по одной строке на каждую (задачу, юзера), где
 * юзер участвовал в задаче, она прошла все фильтры и попадает в окно.
 * Вклад юзера в задачу от набора email'ов в запросе не зависит (`tt`
 * считает всё время по задаче) — поэтому строки одного email из командного
 * запроса совпадают с запросом только по нему.
 */
function buildOnTimeRowsSQL(): string {
  // Pavel: «всё в manage» — и ActiveCollab, и Яндекс Трекер летят в
  // manage.worklog_task. Запрос к collab.* убран (он только дублировал
  // данные), фильтр по t.source убран (он отрезал collab-задачи внутри
  // manage). Источник — единственный.
  return `
    SELECT
      user_email,
      toStartOfMonth(last_date) AS month,
      count() AS total_tasks,
      countIf(push_ratio <= 10) AS on_time_tasks
    FROM (
      SELECT
        pu.user_email AS user_email,
        tt.last_date AS last_date,
        ((pu.pushed_by_dev - tm.estimate) / tm.estimate * 100) AS push_ratio
      FROM (
        SELECT
          tr.task_id AS task_id,
          lowerUTF8(u.email) AS user_email,
          sum(tr.value) AS pushed_by_dev
        FROM manage.worklog_timerecord tr
        INNER JOIN manage.users_user u ON u.id = tr.user_id
        WHERE tr.is_deleted = 0
          AND lowerUTF8(u.email) IN ({emails:Array(String)})
        GROUP BY tr.task_id, lowerUTF8(u.email)
      ) AS pu
      INNER JOIN (
        SELECT
          t.id AS task_id,
          if(
            ifNull(t.${MANAGE_ESTIMATE_COL}, 0) > 0,
            toFloat64(t.${MANAGE_ESTIMATE_COL}),
            toFloat64(ifNull(t.estimate, 0))
          ) AS estimate,
          t.is_completed AS is_completed
        FROM manage.worklog_task t
      ) AS tm ON tm.task_id = pu.task_id
      INNER JOIN (
        SELECT
          task_id,
          sum(value) AS total_push,
          max(date) AS last_date
        FROM manage.worklog_timerecord
        WHERE is_deleted = 0
        GROUP BY task_id
      ) AS tt ON tt.task_id = pu.task_id
      WHERE
        tm.is_completed = 1
        AND tm.estimate > 0
        AND pu.pushed_by_dev > 0
        AND tt.last_date >= subtractMonths(today(), 6)
        AND ifNull(
          if(ABS(tt.total_push) > 0,
             round(ABS(pu.pushed_by_dev) / ABS(tt.total_push) * 100),
             0),
          0
        ) >= 50
    ) AS per_user_task
    GROUP BY user_email, month
    ORDER BY month
  `;
}

/** Строка агрегата: email × месяц. Email в lowercase, месяц `YYYY-MM-01`. */
export interface OnTimeRow {
  email: string;
  month: string;
  total: number;
  onTime: number;
}

/** Складывает счётчики по ключу — месяцы в email или email'ы в месяц. */
function sumBy(rows: OnTimeRow[], key: (r: OnTimeRow) => string) {
  const sums = new Map<string, { total: number; onTime: number }>();
  for (const r of rows) {
    const cur = sums.get(key(r)) ?? { total: 0, onTime: 0 };
    cur.total += r.total;
    cur.onTime += r.onTime;
    sums.set(key(r), cur);
  }
  return sums;
}

/**
 * Агрегат по email из строк (email, месяц) — то же, что давал прежний
 * запрос с `GROUP BY user_email`: % с одним знаком после запятой.
 */
export function onTimeStatsFromRows(rows: OnTimeRow[]): OnTimeStatsByEmail {
  const map: OnTimeStatsByEmail = new Map();
  for (const [email, { total, onTime }] of sumBy(rows, (r) => r.email)) {
    const percent = total > 0 ? Math.round((onTime / total) * 1000) / 10 : null;
    map.set(email, { totalTasks: total, onTimeTasks: onTime, onTimePercent: percent });
  }
  return map;
}

/**
 * Спарклайн из строк (email, месяц) — то же, что давал прежний запрос с
 * `GROUP BY month ORDER BY month`: целые %, по возрастанию месяца.
 */
export function monthlyOnTimePercents(rows: OnTimeRow[]): number[] {
  return Array.from(sumBy(rows, (r) => r.month).entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .filter(([, m]) => m.total > 0)
    .map(([, m]) => Math.round((m.onTime / m.total) * 100));
}

/** Нормализуем + убираем пустые/невалидные, без дублей. */
function normalizeEmails(emails: string[]): string[] {
  return Array.from(
    new Set(
      emails.map((e) => e.trim().toLowerCase()).filter((e) => e && e.includes('@')),
    ),
  );
}

const rowsKey = (emails: string[]) => makeEmailsCacheKey('perf-on-time-rows', emails);

/**
 * Строки (email, месяц) для набора email'ов. Кэш 15 мин; параллельные
 * вызовы с тем же набором (лидерборд + спарклайн на одной странице) ждут
 * один запрос. Командный результат заодно раскладываем по ключам
 * одиночных email'ов — портрет, открытый из списка, не идёт в ClickHouse.
 */
async function loadOnTimeRows(unique: string[]): Promise<OnTimeRow[]> {
  return getOrCompute(
    rowsKey(unique),
    async () => {
      const client = getClient();
      const result = await client.query({
        query: buildOnTimeRowsSQL(),
        query_params: { emails: unique },
        format: 'JSONEachRow',
      });
      type Row = {
        user_email: string;
        month: string;
        total_tasks: number | string;
        on_time_tasks: number | string;
      };
      const rows = ((await result.json()) as Row[]).map((r) => ({
        email: r.user_email.toLowerCase(),
        month: String(r.month),
        total: Number(r.total_tasks) || 0,
        onTime: Number(r.on_time_tasks) || 0,
      }));
      if (unique.length > 1) {
        const byEmail = new Map<string, OnTimeRow[]>(unique.map((e) => [e, []]));
        for (const r of rows) byEmail.get(r.email)?.push(r);
        for (const [email, own] of byEmail) setCached(rowsKey([email]), own, DEFAULT_TTL_MS);
      }
      return rows;
    },
    DEFAULT_TTL_MS,
  );
}

/**
 * Месячная динамика «в срок» по команде (спарклайн). Возвращает проценты
 * по месяцам за 6-мес окно, по возрастанию месяца. Кэш 15 мин.
 */
export async function fetchTeamMonthlyOnTime(
  emails: string[],
): Promise<number[]> {
  const unique = normalizeEmails(emails);
  if (unique.length === 0) return [];

  return monthlyOnTimePercents(await loadOnTimeRows(unique));
}

// ============================================================
// Публичная функция
// ============================================================

/**
 * Получить агрегат «% попадания в срок за 6 мес» для набора email'ов.
 *
 * Использует кэш (TTL 15 мин) — повторные запросы за тот же набор
 * возвращаются мгновенно. Ключ кэша — отсортированный набор email'ов,
 * порядок на входе не важен.
 *
 * Если ClickHouse недоступен или возвращает ошибку — кидаем исключение.
 * Caller (страница или API) сам решает что показать пользователю.
 */
export async function fetchOnTimeStatsByEmail(
  emails: string[],
): Promise<OnTimeStatsByEmail> {
  const unique = normalizeEmails(emails);
  if (unique.length === 0) return new Map();

  return onTimeStatsFromRows(await loadOnTimeRows(unique));
}
