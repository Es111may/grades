/**
 * Лёгкий HTTP-клиент к ClickHouse — нужен для подтягивания данных из HR-системы
 * Иды (повышения ЗП и т.п.).
 *
 * Подключение и креды можно переопределить через env (рекомендуется
 * перенести в Railway Variables), но есть дефолты на случай, если переменные
 * не проставлены — Pavel передал учётные данные напрямую при постановке задачи.
 *
 * Запросы параметризованные через нативные ClickHouse `{name:Type}`-параметры,
 * передаются в query-string как `param_name=…`. Это безопаснее, чем
 * склеивать строку SQL руками.
 */

const CH_URL = process.env.CLICKHOUSE_URL ?? 'http://158.160.85.201:8123';
const CH_USER = process.env.CLICKHOUSE_USER ?? 'designgrades';
const CH_PASS =
  process.env.CLICKHOUSE_PASSWORD ?? 'Savor7-Unjustly-Fidelity-Tripod-Boogeyman';

export async function chQuery<T>(
  sql: string,
  params: Record<string, string | number> = {},
): Promise<T[]> {
  const auth = 'Basic ' + Buffer.from(`${CH_USER}:${CH_PASS}`).toString('base64');
  const url = new URL(CH_URL);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(`param_${k}`, String(v));
  }
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'text/plain',
    },
    // Принудительно требуем JSON-формат — у нас единый парсер ответа.
    body: sql + '\nFORMAT JSON',
    // 6 секунд достаточно для большинства HR-запросов; если ClickHouse недоступен,
    // не блокируем рендер карточки пользователя.
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`ClickHouse ${res.status}: ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data: T[] };
  return json.data;
}
