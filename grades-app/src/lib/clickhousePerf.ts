/**
 * ClickHouse-коннектор для дашборда «Мой перформанс».
 *
 * Это TS-порт Python-сервиса `ida.team/backend/analytics/services/time_manage.py`
 * и SQL-билдеров `ida.team/backend/analytics/sql/time_manage.py`.
 *
 * Полная аналитика в ida.team поддерживает направления frontend / backend / qa /
 * design / core / c-level. Тут мы оставили только `design` — Грейды живут
 * исключительно про дизайнеров, тащить в Next бесполезный код для других
 * направлений смысла не было.
 *
 * Источники данных в ClickHouse:
 *   - collab.tasks / collab.time_records / collab.projects / collab.task_lists
 *     — ActiveCollab (старый трекер).
 *   - manage.worklog_task / manage.worklog_timerecord / manage.users_user
 *     — таблицы внутреннего manage, в которых дублированы и расширены данные
 *     Яндекс Трекера. Мы используем именно их (а не tracker.*), как и
 *     ida.team — там данные актуальнее и полнее.
 *
 * Запросы параметризованные через нативные ClickHouse `{name:Type}` —
 * никакой склейки строк руками. Креды берутся из ENV; есть дефолты на случай,
 * если переменные не проставлены (Pavel передал учётные данные напрямую).
 */

import { createClient, type ClickHouseClient } from '@clickhouse/client';

// ============================================================
// Конфиг
// ============================================================

/**
 * Дефолтные креды — те же, что Pavel дал в чате (тот же ClickHouse, что
 * используется для подтягивания дат повышений в `clickhouse.ts`). Для prod
 * лучше задать переменные окружения, но без них всё равно работает.
 */
const CH_URL =
  process.env.CLICKHOUSE_URL ??
  `http://${process.env.CLICKHOUSE_HOST ?? '158.160.85.201'}:${
    process.env.CLICKHOUSE_PORT ?? '8123'
  }`;
const CH_USER = process.env.CLICKHOUSE_USER ?? 'designgrades';
const CH_PASS =
  process.env.CLICKHOUSE_PASSWORD ?? 'Savor7-Unjustly-Fidelity-Tripod-Boogeyman';

// ============================================================
// Singleton-клиент
// ============================================================

let _client: ClickHouseClient | null = null;

function getClient(): ClickHouseClient {
  if (_client) return _client;
  _client = createClient({
    url: CH_URL,
    username: CH_USER,
    password: CH_PASS,
    // Запрос задач — тяжёлый JOIN по миллионам записей time_records.
    // 15 секунд — компромисс между «не упасть на медленных запросах» и
    // «не блокировать рендер портрета слишком долго».
    request_timeout: 15000,
    // Кэш не отключаем — ClickHouse сам кэширует одинаковые запросы
    // несколько секунд (query_cache на сервере).
  });
  return _client;
}

// ============================================================
// Константы направления `design`
// ============================================================

/**
 * job_type_id в collab.time_records, которые считаются «дизайнерскими».
 * Источник — analytics/const.py::DIRECTION_JOB_TYPE_IDS['design'].
 */
const DESIGN_JOB_TYPE_IDS = [5, 17, 23, 31, 35] as const;

/** Колонка в manage.worklog_task с направленной оценкой дизайна. */
const MANAGE_ESTIMATE_COL = 'estimate_design';

/**
 * Regex для парсинга «оценка: дизайн N» из тела задачи collab.
 * Сначала отдельно ищем секцию «Оценка:» / «Эстимирование:», потом находим
 * пару «(design|дизайн) N». В TS-литерале каждое `\` пишется как `\\\\`,
 * чтобы в SQL пришло `\\`, а ClickHouse-парсер регэкспа уже свернул это в `\`.
 */
const ESTIMATE_REGEX =
  '(?si)(?:оценка|эстимирование)\\\\s*:.*?(?:design|дизайн)\\\\s*(?:-|—|:)?\\\\s*(\\\\d+(?:[.,]\\\\d+)?)';
const ITERATION_TAG = '#design-iteration:\\\\s*\\\\d+';
const ITERATION_REPLACE = '#design-iteration:\\\\s*';

const JOB_TYPE_IDS_SQL = DESIGN_JOB_TYPE_IDS.join(', ');

// ============================================================
// Типы (camelCase, совпадают с тем, что отдавал Python)
// ============================================================

export type TaskSource = 'collab' | 'tracker';

export interface TaskDetail {
  /** Например `2024 / Q3` */
  quarter: string;
  /** Месяц последней активности по задаче в формате `YYYY-MM` */
  lastPeriodMonth: string;
  projectName: string;
  taskName: string;
  /** В collab — число; в manage/tracker — строка типа `123`. Унифицируем под строку. */
  taskId: string;
  projectId: number;
  taskListName: string;
  /** `YYYY-MM-DD` */
  taskCreatedOn: string;
  /** Общий эстимейт задачи (включая все направления) */
  estimateGeneral: number;
  /** Эстимейт по направлению «дизайн» (часы) */
  estimate: number;
  /** Часы, запушенные конкретным разработчиком */
  pushedByDev: number;
  /** Превышение эстимейта (max(0, pushed - estimate)) */
  overpushHours: number;
  /** В процентах: (pushed - estimate) / estimate * 100 */
  pushRatio: number;
  /** Уровень по pushRatio — `≥ L6` / `L5` / ... */
  level: string;
  /** Вклад в задачу: pushed / (totalPush - retestTime), 0..1 */
  devContribution: number;
  /** Общие часы команды на задачу */
  totalTeamPush: number;
  /** Часы, запушенные другими QA. Для дизайна обычно 0. */
  otherQaPush: number;
  /** Кол-во итераций QA — оценочно */
  qaIterations: number;
  /** Часы QA-ретестов */
  qaTime: number;
  /** Часы тег `разработка:` (для дизайна — основная работа) */
  devTime: number;
  /** Часы тег `доработка:` */
  reworkTime: number;
  /** Часы тег `тестирование:` (QA) */
  testTime: number;
  /** Часы тег `ретест:` (для самого QA) */
  retestTime: number;
  /** Часы тег `документация:` */
  docsTime: number;
  /** Часы тег `автотесты:` */
  autotestTime: number;
  source: TaskSource;
  /** Только для tracker: ключ задачи (`PROJECT-123`) для построения ссылки */
  taskKey?: string;
}

export interface FetchTasksParams {
  email: string;
  hasEstimate: boolean;
  completedOnly: boolean;
  workedHardOnly: boolean;
  /** Опциональный фильтр по кварталу, в формате `2025 / Q1` */
  quarter?: string;
  /** Опциональный фильтр по месяцу, в формате `YYYY-MM`. Имеет приоритет над quarter. */
  month?: string;
}

// ============================================================
// Уровни по pushRatio — порт `time-manage-tasks-table.ts`
// ============================================================

/**
 * Лейблы уровней по pushRatio. Совпадают с фронтом ida.team —
 * см. `frontend/assets/ts/utils/time-manage-tasks-table.ts`.
 */
function getLevel(pushRatio: number): string {
  if (pushRatio <= 10) return '≥ L6';
  if (pushRatio <= 20) return 'L5';
  if (pushRatio <= 30) return 'L4';
  if (pushRatio <= 40) return 'L3';
  return 'Слишком большой оверпуш';
}

// ============================================================
// SQL-билдеры
// ============================================================

/**
 * Сборка SQL для collab.tasks (ActiveCollab).
 *
 * Точный порт `build_collab_tasks_query('design', ...)` из
 * ida.team/backend/analytics/sql/time_manage.py.
 *
 * Фильтры:
 *   - hasEstimate     — HAVING estimate > 0
 *   - completedOnly   — task_list_name содержит «done/закрыто/готово/...»
 *                       или completed_on не пустой
 *   - workedHardOnly  — доля разработчика на задаче ≥ 50%
 *   - quarter / month — точечный фильтр; month имеет приоритет
 */
function buildCollabTasksSQL(p: FetchTasksParams): string {
  const completedOnly = p.completedOnly
    ? `AND (
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
    )`
    : '';

  const hasEstimate = p.hasEstimate ? 'AND estimate > 0' : '';
  const workedHard = p.workedHardOnly
    ? `AND ifNull(
        if(
          ABS(total_push - retest_time) > 0,
          round((ABS(pushed_by_dev) / ABS(total_push - retest_time)) * 100),
          0
        ),
        0
      ) >= 50`
    : '';

  // Период (month имеет приоритет над quarter)
  let periodFilter = '';
  if (p.month) {
    periodFilter =
      "AND formatDateTime(dir_agg.last_record_date_direction, '%Y-%m') = {month:String}";
  } else if (p.quarter) {
    periodFilter =
      "AND concat(toString(toYear(dir_agg.last_record_date_direction))," +
      " ' / Q', toString(toQuarter(dir_agg.last_record_date_direction)))" +
      ' = {quarter:String}';
  }

  return `
    SELECT
      concat(toString(toYear(dir_agg.last_record_date_direction)), ' / Q',
             toString(toQuarter(dir_agg.last_record_date_direction))) AS quarter,
      any(formatDateTime(dir_agg.last_record_date_direction, '%Y-%m')) AS last_period_month,
      t.project_id AS project_id,
      t.id AS task_id,
      any(p.name) AS project_name,
      any(t.name) AS task_name,
      any(tl.name) AS task_list_name,
      any(formatDateTime(t.created_on, '%Y-%m-%d')) AS task_created_on,
      any(t.estimate) AS estimate_general,

      avg(
        if(
          extract(replaceRegexpAll(assumeNotNull(t.body), '<[^>]*>', ' '), '${ESTIMATE_REGEX}') = '',
          toFloat64(t.estimate),
          ifNull(
            toFloat64OrNull(
              replaceAll(
                extract(replaceRegexpAll(assumeNotNull(t.body), '<[^>]*>', ' '), '${ESTIMATE_REGEX}'),
                ',', '.'
              )
            ),
            toFloat64(t.estimate)
          )
        )
      ) AS estimate,

      sumIf(tr.value, tr.user_email = {developer:String}) AS pushed_by_dev,

      /* Для дизайна QA-блок неактуален, но оставляем колонки 0-ми для совместимости. */
      0 AS other_qa_push,

      sum(tr.value) AS total_push,

      /* Время ретестов: для дизайна почти всегда 0 — оставлено для парности с фронт-направлениями. */
      0 AS retest_time,

      /* Итерации (по тегам #design-iteration:) */
      ifNull(max(toFloat64OrNull(replaceRegexpAll(
        arrayElement(extractAll(assumeNotNull(t.body), '(${ITERATION_TAG})'), 1),
        '${ITERATION_REPLACE}', ''
      ))), 0) AS qa_iterations,

      0 AS qa_time,

      /* Тег «разработка:» — основная работа дизайнера */
      sumIf(tr.value,
        tr.user_email = {developer:String}
        AND startsWith(lowerUTF8(tr.summary), 'разработка:')
      ) AS dev_time,

      sumIf(tr.value,
        tr.user_email = {developer:String}
        AND startsWith(lowerUTF8(tr.summary), 'доработка:')
      ) AS rework_time,

      0 AS test_time,
      0 AS qa_retest_time,
      0 AS doc_time,
      0 AS autotest_time

    FROM collab.tasks t
    INNER JOIN collab.projects p ON p.id = t.project_id
    INNER JOIN collab.task_lists tl ON tl.id = t.task_list_id
    INNER JOIN collab.time_records tr ON t.id = tr.parent_id AND tr.is_trashed = 0

    LEFT JOIN (
      SELECT
        parent_id,
        arrayStringConcat(arrayDistinct(groupArray(user_email)), ',') AS all_user_emails
      FROM collab.time_records
      WHERE is_trashed = 0
      GROUP BY parent_id
    ) AS tr_agg ON tr_agg.parent_id = t.id

    LEFT JOIN (
      SELECT
        parent_id,
        maxIf(record_date, job_type_id IN (${JOB_TYPE_IDS_SQL})) AS last_record_date_direction
      FROM collab.time_records
      WHERE is_trashed = 0
      GROUP BY parent_id
    ) AS dir_agg ON dir_agg.parent_id = t.id

    WHERE
      dir_agg.last_record_date_direction > toDate('2024-01-01')
      ${periodFilter}
      AND position(tr_agg.all_user_emails, {developer:String}) > 0
      ${completedOnly}
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
      AND positionCaseInsensitiveUTF8(tl.name, 'митап') = 0
      AND positionCaseInsensitiveUTF8(tl.name, 'дейли') = 0

    GROUP BY quarter, t.project_id, t.id

    HAVING 1 = 1
      ${hasEstimate}
      ${workedHard}

    ORDER BY quarter DESC, pushed_by_dev DESC
  `;
}

/**
 * Сборка SQL для manage.worklog_task (Яндекс Трекер через manage).
 *
 * Точный порт `build_manage_tracker_tasks_query('design', ...)`.
 */
function buildManageTrackerTasksSQL(p: FetchTasksParams): string {
  const completedOnly = p.completedOnly ? 'AND t.is_completed = 1' : '';
  const hasEstimate = p.hasEstimate ? 'AND estimate > 0' : '';
  const workedHard = p.workedHardOnly
    ? `AND ifNull(
        if(
          ABS(total_push - retest_time) > 0,
          round((ABS(pushed_by_dev) / ABS(total_push - retest_time)) * 100),
          0
        ),
        0
      ) >= 50`
    : '';

  let periodFilter = '';
  if (p.month) {
    periodFilter = "AND formatDateTime(wl_agg.last_date, '%Y-%m') = {month:String}";
  } else if (p.quarter) {
    periodFilter =
      "AND concat(toString(toYear(wl_agg.last_date))," +
      " ' / Q', toString(toQuarter(wl_agg.last_date)))" +
      ' = {quarter:String}';
  }

  return `
    SELECT
      concat(toString(toYear(wl_agg.last_date)), ' / Q',
             toString(toQuarter(wl_agg.last_date))) AS quarter,
      formatDateTime(wl_agg.last_date, '%Y-%m') AS last_period_month,
      ifNull(q.key, '') AS project_name,
      t.name AS task_name,
      replaceRegexpOne(t.link, '^.*/([^/]+)$', '\\\\1') AS task_key,
      toString(t.id) AS task_id,
      if(t.is_completed = 1, 'Выполнено', 'В работе') AS task_list_name,
      formatDateTime(ifNull(t.created_on, now()), '%Y-%m-%d') AS task_created_on,
      ifNull(t.estimate, 0) AS estimate_general,

      if(
        ifNull(t.${MANAGE_ESTIMATE_COL}, 0) > 0,
        toFloat64(t.${MANAGE_ESTIMATE_COL}),
        toFloat64(ifNull(t.estimate, 0))
      ) AS estimate,

      sumIf(tr.value, u.email = {developer:String}) AS pushed_by_dev,

      0 AS other_qa_push,
      sum(tr.value) AS total_push,
      0 AS retest_time,
      0 AS qa_iterations,
      0 AS qa_time,

      sumIf(tr.value,
        u.email = {developer:String}
        AND startsWith(lowerUTF8(tr.summary), 'разработка:')
      ) AS dev_time,

      sumIf(tr.value,
        u.email = {developer:String}
        AND startsWith(lowerUTF8(tr.summary), 'доработка:')
      ) AS rework_time,

      0 AS test_time,
      0 AS qa_retest_time,
      0 AS doc_time,
      0 AS autotest_time

    FROM manage.worklog_task t
    INNER JOIN manage.worklog_timerecord tr ON tr.task_id = t.id AND tr.is_deleted = 0
    INNER JOIN manage.users_user u ON u.id = tr.user_id

    LEFT JOIN manage.yandex_tracker_yandextrackerqueue q ON q.id = t.yt_queue_id

    LEFT JOIN (
      SELECT task_id, max(date) AS last_date
      FROM manage.worklog_timerecord
      WHERE is_deleted = 0
      GROUP BY task_id
    ) wl_agg ON wl_agg.task_id = t.id

    WHERE
      t.source = 'yandex_tracker'
      AND wl_agg.last_date > toDate('2024-01-01')
      ${periodFilter}
      AND t.id IN (
        SELECT DISTINCT tr0.task_id
        FROM manage.worklog_timerecord tr0
        INNER JOIN manage.users_user u0 ON u0.id = tr0.user_id
        WHERE u0.email = {developer:String} AND tr0.is_deleted = 0
      )
      ${completedOnly}

    GROUP BY
      quarter, t.id, t.name, t.link, t.is_completed, t.created_on,
      t.estimate, t.${MANAGE_ESTIMATE_COL}, q.key, wl_agg.last_date

    HAVING pushed_by_dev > 0
      ${hasEstimate}
      ${workedHard}

    ORDER BY quarter DESC, pushed_by_dev DESC
  `;
}

// ============================================================
// Маппинг сырых ClickHouse-строк в TaskDetail
// ============================================================

interface RawTaskRow {
  quarter: string;
  last_period_month: string;
  project_name: string;
  task_name: string;
  task_id: string | number;
  /** Только collab — числовой id проекта */
  project_id?: number;
  task_list_name: string;
  task_created_on: string;
  estimate_general: number | string;
  estimate: number | string;
  pushed_by_dev: number | string;
  total_push: number | string;
  retest_time: number | string;
  other_qa_push: number | string;
  qa_iterations: number | string;
  qa_time: number | string;
  dev_time: number | string;
  rework_time: number | string;
  test_time: number | string;
  qa_retest_time: number | string;
  doc_time: number | string;
  autotest_time: number | string;
  task_key?: string;
}

const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (v: number): number => Math.round(v * 100) / 100;

function mapRow(row: RawTaskRow, source: TaskSource): TaskDetail {
  const estimate = num(row.estimate);
  const pushedByDev = num(row.pushed_by_dev);
  const totalPush = num(row.total_push);
  const retestTime = num(row.retest_time);

  const pushRatio = estimate > 0 ? ((pushedByDev - estimate) / estimate) * 100 : 0;
  const overpushHours = Math.max(0, pushedByDev - estimate);
  const effectiveTeamPush = totalPush - retestTime;
  const devContribution = effectiveTeamPush > 0 ? pushedByDev / effectiveTeamPush : 0;

  return {
    quarter: String(row.quarter ?? ''),
    lastPeriodMonth: String(row.last_period_month ?? ''),
    projectName: String(row.project_name ?? ''),
    taskName: String(row.task_name ?? ''),
    taskId: String(row.task_id ?? ''),
    projectId: typeof row.project_id === 'number' ? row.project_id : 0,
    taskListName: String(row.task_list_name ?? ''),
    taskCreatedOn: String(row.task_created_on ?? ''),
    estimateGeneral: num(row.estimate_general),
    estimate: round2(estimate),
    pushedByDev: round2(pushedByDev),
    overpushHours: round2(overpushHours),
    pushRatio: round2(pushRatio),
    level: getLevel(pushRatio),
    devContribution: Math.round(devContribution * 10000) / 10000,
    totalTeamPush: round2(totalPush),
    otherQaPush: round2(num(row.other_qa_push)),
    qaIterations: Math.round(num(row.qa_iterations)),
    qaTime: round2(num(row.qa_time)),
    devTime: round2(num(row.dev_time)),
    reworkTime: round2(num(row.rework_time)),
    testTime: round2(num(row.test_time)),
    retestTime: round2(num(row.qa_retest_time)),
    docsTime: round2(num(row.doc_time)),
    autotestTime: round2(num(row.autotest_time)),
    source,
    ...(row.task_key ? { taskKey: String(row.task_key) } : {}),
  };
}

// ============================================================
// Публичный API
// ============================================================

/**
 * Подтягивает список задач дизайнера за весь доступный период (2024-01-01+).
 *
 * Запускает два параллельных запроса (collab + manage) и склеивает результат.
 * Если один из источников падает — возвращаем хотя бы то, что есть из другого
 * (как в Python-сервисе).
 */
export async function fetchDesignerTasks(p: FetchTasksParams): Promise<TaskDetail[]> {
  const client = getClient();
  const queryParams: Record<string, string> = { developer: p.email };
  if (p.quarter) queryParams.quarter = p.quarter;
  if (p.month) queryParams.month = p.month;

  // Запускаем оба запроса параллельно. Каждый возвращает [] при ошибке —
  // лучше частичные данные, чем пустой портрет.
  const [collabRows, trackerRows] = await Promise.all([
    runQuery<RawTaskRow>(client, buildCollabTasksSQL(p), queryParams).catch((err) => {
      console.error('[clickhousePerf] collab query failed:', err);
      return [] as RawTaskRow[];
    }),
    runQuery<RawTaskRow>(client, buildManageTrackerTasksSQL(p), queryParams).catch(
      (err) => {
        console.error('[clickhousePerf] manage tracker query failed:', err);
        return [] as RawTaskRow[];
      },
    ),
  ]);

  return [
    ...collabRows.map((r) => mapRow(r, 'collab')),
    ...trackerRows.map((r) => mapRow(r, 'tracker')),
  ];
}

async function runQuery<T>(
  client: ClickHouseClient,
  sql: string,
  params: Record<string, string>,
): Promise<T[]> {
  const result = await client.query({
    query: sql,
    query_params: params,
    format: 'JSONEachRow',
  });
  return (await result.json()) as T[];
}
