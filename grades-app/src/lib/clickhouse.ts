/**
 * Лёгкий HTTP-клиент к ClickHouse — нужен для подтягивания данных из HR-системы
 * Иды (повышения ЗП и т.п.).
 *
 * Все креды берутся из переменных окружения. На Railway их нужно проставить
 * в Variables:
 *
 *   CLICKHOUSE_HOST       — например `158.160.85.201`
 *   CLICKHOUSE_PORT       — обычно `8123`
 *   CLICKHOUSE_USER       — логин ClickHouse
 *   CLICKHOUSE_PASSWORD   — пароль ClickHouse
 *
 * Если хоть одна переменная не задана — `chQuery()` бросит понятную ошибку,
 * вызывающий код (см. `/api/users/[id]/last-raise`) ловит её и возвращает
 * пустой ответ, чтобы не валить страницу портрета.
 *
 * Запросы параметризованные через нативные ClickHouse `{name:Type}` —
 * передаются в query-string как `param_name=…`. Это безопаснее, чем
 * склеивать строку SQL руками.
 */

function getCreds(): { url: string; user: string; password: string } {
  const host = process.env.CLICKHOUSE_HOST;
  const port = process.env.CLICKHOUSE_PORT;
  const user = process.env.CLICKHOUSE_USER;
  const password = process.env.CLICKHOUSE_PASSWORD;
  const missing: string[] = [];
  if (!host) missing.push('CLICKHOUSE_HOST');
  if (!port) missing.push('CLICKHOUSE_PORT');
  if (!user) missing.push('CLICKHOUSE_USER');
  if (!password) missing.push('CLICKHOUSE_PASSWORD');
  if (missing.length > 0) {
    throw new Error(
      `ClickHouse env vars not set: ${missing.join(', ')}. ` +
        `Установи переменные на Railway (Service → Variables).`,
    );
  }
  return {
    url: `http://${host}:${port}`,
    user: user as string,
    password: password as string,
  };
}

export async function chQuery<T>(
  sql: string,
  params: Record<string, string | number> = {},
): Promise<T[]> {
  const { url, user, password } = getCreds();
  const auth = 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(`param_${k}`, String(v));
  }
  const res = await fetch(u.toString(), {
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
