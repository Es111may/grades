/**
 * Батчевый агрегат «% попадания в срок за 6 месяцев» — для лидерборда
 * и шапки портрета.
 *
 * В отличие от `clickhousePerf.ts` (детальный список задач для дашборда),
 * тут один большой запрос, который возвращает per-email агрегат:
 *
 *   { email → { onTimePercent: number, totalTasks: number } }
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
import { getOrCompute, makeEmailsCacheKey, DEFAULT_TTL_MS } from './perfCache';

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
    request_timeout: 20000, // батч-запрос тяжелее одиночного
  });
  return _client;
}

// ============================================================
// Константы — те же, что в clickhousePerf.ts для совместимости
// ============================================================

const DESIGN_JOB_TYPE_IDS = [5, 17, 23, 31, 35] as const;
const MANAGE_ESTIMATE_COL = 'estimate_design';
const ESTIMATE_REGEX =
  '(?si)(?:оценка|эстимирование)\\\\s*:.*?(?:design|дизайн)\\\\s*(?:-|—|:)?\\\\s*(\\\\d+(?:[.,]\\\\d+)?)';
const JOB_TYPE_IDS_SQL = DESIGN_JOB_TYPE_IDS.join(', ');

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
 * Сборка SQL для батч-агрегата за 6 месяцев.
 *
 * Внешний SELECT — count() по группе user_email.
 * Внутренний UNION ALL даёт по одной строке на каждую (задачу, юзера),
 * где юзер участвовал в задаче, она прошла все фильтры и попадает в окно.
 */
function buildOnTimeBatchSQL(): string {
  return `
    SELECT
      user_email,
      count() AS total_tasks,
      countIf(push_ratio <= 10) AS on_time_tasks
    FROM (
      -- ─────── COLLAB ───────
      SELECT
        pu.user_email AS user_email,
        ((pu.pushed_by_dev - tm.estimate) / tm.estimate * 100) AS push_ratio
      FROM (
        SELECT
          tr.parent_id AS task_id,
          lowerUTF8(tr.user_email) AS user_email,
          sum(tr.value) AS pushed_by_dev
        FROM collab.time_records tr
        WHERE tr.is_trashed = 0
          AND lowerUTF8(tr.user_email) IN ({emails:Array(String)})
        GROUP BY tr.parent_id, lowerUTF8(tr.user_email)
      ) AS pu
      INNER JOIN (
        SELECT
          t.id AS task_id,
          -- Эстимейт: парсим секцию «дизайн: N» в body, фолбек на t.estimate
          if(
            extract(replaceRegexpAll(assumeNotNull(t.body), '<[^>]*>', ' '), '${ESTIMATE_REGEX}') = '',
            toFloat64(t.estimate),
            ifNull(
              toFloat64OrNull(replaceAll(
                extract(replaceRegexpAll(assumeNotNull(t.body), '<[^>]*>', ' '), '${ESTIMATE_REGEX}'),
                ',', '.'
              )),
              toFloat64(t.estimate)
            )
          ) AS estimate
        FROM collab.tasks t
        INNER JOIN collab.task_lists tl ON tl.id = t.task_list_id
        WHERE
          -- completed_only: список содержит done/готово/...
          (
            isNotNull(t.completed_on)
            OR positionCaseInsensitiveUTF8(tl.name, 'done') != 0
            OR positionCaseInsensitiveUTF8(tl.name, 'закрыто') != 0
            OR positionCaseInsensitiveUTF8(tl.name, 'сделано') != 0
            OR positionCaseInsensitiveUTF8(tl.name, 'на бою') != 0
            OR positionCaseInsensitiveUTF8(tl.name, 'завершен') != 0
            OR positionCaseInsensitiveUTF8(tl.name, 'готов') != 0
            OR positionCaseInsensitiveUTF8(tl.name, 'готово') != 0
            OR positionCaseInsensitiveUTF8(tl.name, 'archiv') != 0
            OR positionCaseInsensitiveUTF8(tl.name, 'архив') != 0
            OR positionCaseInsensitiveUTF8(tl.name, 'выполнен') != 0
          )
          -- noise-фильтры по имени задачи (как в основном запросе)
          AND positionCaseInsensitiveUTF8(t.name, 'разворот') = 0
          AND positionCaseInsensitiveUTF8(t.name, 'знакомство') = 0
          AND positionCaseInsensitiveUTF8(t.name, 'LEAD') = 0
          AND positionCaseInsensitiveUTF8(t.name, 'TEAMLEAD') = 0
          AND positionCaseInsensitiveUTF8(t.name, 'дейлик') = 0
          AND positionCaseInsensitiveUTF8(t.name, 'дейли') = 0
          AND positionCaseInsensitiveUTF8(t.name, 'daily') = 0
          AND positionCaseInsensitiveUTF8(t.name, 'calls') = 0
          AND positionCaseInsensitiveUTF8(t.name, 'коллы') = 0
          AND positionCaseInsensitiveUTF8(t.name, 'митап') = 0
          AND positionCaseInsensitiveUTF8(t.name, 'созвон') = 0
          AND positionCaseInsensitiveUTF8(t.name, 'обсуждение') = 0
          AND positionCaseInsensitiveUTF8(t.name, 'оценка') = 0
          AND positionCaseInsensitiveUTF8(tl.name, 'периодич.') = 0
          AND positionCaseInsensitiveUTF8(tl.name, 'цикличные') = 0
          AND positionCaseInsensitiveUTF8(tl.name, 'day') = 0
          AND positionCaseInsensitiveUTF8(tl.name, 'оффтоп') = 0
      ) AS tm ON tm.task_id = pu.task_id
      INNER JOIN (
        SELECT
          tr.parent_id AS task_id,
          sum(tr.value) AS total_push,
          maxIf(tr.record_date, tr.job_type_id IN (${JOB_TYPE_IDS_SQL})) AS last_date_direction
        FROM collab.time_records tr
        WHERE tr.is_trashed = 0
        GROUP BY tr.parent_id
      ) AS tt ON tt.task_id = pu.task_id
      WHERE
        tm.estimate > 0
        AND pu.pushed_by_dev > 0
        AND tt.last_date_direction >= subtractMonths(today(), 6)
        -- worked_hard: вклад дизайнера ≥ 50% от командного пуша
        AND ifNull(
          if(ABS(tt.total_push) > 0,
             round(ABS(pu.pushed_by_dev) / ABS(tt.total_push) * 100),
             0),
          0
        ) >= 50

      UNION ALL

      -- ─────── MANAGE (Яндекс Трекер через manage.*) ───────
      SELECT
        pu.user_email AS user_email,
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
        WHERE t.source = 'yandex_tracker'
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
    GROUP BY user_email
  `;
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
  // Нормализуем + убираем пустые/невалидные.
  const normalized = emails
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && e.includes('@'));

  // Уникальные — но в ключе кэша одинаковый набор должен попадать в один слот.
  const unique = Array.from(new Set(normalized));
  if (unique.length === 0) return new Map();

  const cacheKey = makeEmailsCacheKey('perf-on-time-6m', unique);

  return getOrCompute(
    cacheKey,
    async () => {
      const client = getClient();
      const result = await client.query({
        query: buildOnTimeBatchSQL(),
        query_params: { emails: unique },
        format: 'JSONEachRow',
      });
      type Row = {
        user_email: string;
        total_tasks: number | string;
        on_time_tasks: number | string;
      };
      const rows = (await result.json()) as Row[];

      const map: OnTimeStatsByEmail = new Map();
      for (const r of rows) {
        const total = Number(r.total_tasks) || 0;
        const onTime = Number(r.on_time_tasks) || 0;
        const percent = total > 0 ? Math.round((onTime / total) * 1000) / 10 : null;
        map.set(r.user_email.toLowerCase(), {
          totalTasks: total,
          onTimeTasks: onTime,
          onTimePercent: percent,
        });
      }
      return map;
    },
    DEFAULT_TTL_MS,
  );
}
