// Единый набор данных HR-портала — только сервер.
//
// Ставки и журнал в поп-апе (lib/hrSalary), «Экономика» (lib/hrEconomics)
// и сверка состава (scripts/sync-hr-registry.ts) считают в памяти поверх
// одного набора. Откуда он берётся:
//   1. ClickHouse настроен и отвечает — живой набор (SQL — lib/hrDatasetQueries);
//   2. иначе — последний слепок из Postgres (таблица hr_snapshots; пишет
//      scripts/hr-snapshot.ts из ответов ida.hub, сверенных по контрольным
//      суммам);
//   3. нет ни того, ни другого — HrUnavailableError: потребители уже
//      обрабатывают любую ошибку как «HR недоступен».
// Кэш — perfCache, 15 минут (stale-while-revalidate до 6 ч), один ключ на
// весь набор.
//
// Перформанс и задачи (manage.*, clickhousePerf*) сюда не относятся: они
// ходят в ClickHouse напрямую.

import { prisma } from './db';
import { chQuery } from './clickhouse';
import { DEFAULT_TTL_MS, getOrCompute, invalidate, setCached } from './perfCache';
import { hrDataSql, normalizeEmail, normalizeScopeEmails, type HrDatasetKey } from './hrDatasetQueries';
import { rowsFromObjects, tablesFromSnapshotData, type HrDatasetTables } from './hrSnapshot';

export type { HrDatasetKey, HrRow } from './hrDatasetQueries';
export type { HrDatasetTables } from './hrSnapshot';

export type HrDatasetSource = 'clickhouse' | 'snapshot';

export type HrDataset = HrDatasetTables & {
  source: HrDatasetSource;
  /** Когда данные взяты из HR (ISO). */
  takenAt: string;
};

/** Нет ни живого HR, ни слепка. */
export class HrUnavailableError extends Error {
  constructor(message = 'HR: данные недоступны') {
    super(message);
    this.name = 'HrUnavailableError';
  }
}

// ── Загрузка ────────────────────────────────────────────────────────────

const CACHE_KEY = 'hr-dataset:v1';
/** Не чаще раза в минуту перечитываем живой набор ради нового email. */
const COVER_RELOAD_MS = 60 * 1000;

type Loaded = {
  dataset: HrDataset;
  /** Почты охвата живого набора; у слепка — null (охват зафиксирован). */
  scope: ReadonlySet<string> | null;
};

let lastCoverReload = 0;

function clickHouseConfigured(): boolean {
  return ['CLICKHOUSE_HOST', 'CLICKHOUSE_PORT', 'CLICKHOUSE_USER', 'CLICKHOUSE_PASSWORD'].every(
    (k) => !!process.env[k],
  );
}

/** Таблица по возможности — как раньше в «Экономике»: без неё страница живёт. */
async function optional<T>(label: string, p: Promise<T[]>): Promise<T[]> {
  try {
    return await p;
  } catch (err) {
    console.error(`[hrDataset] ${label} failed:`, err);
    return [];
  }
}

async function loadLive(): Promise<Loaded> {
  const users = await prisma.user.findMany({ select: { email: true } });
  const emails = normalizeScopeEmails(users.map((u) => u.email));
  const q = <K extends HrDatasetKey>(key: K) =>
    chQuery<Record<string, unknown>>(hrDataSql(key, emails)).then((rows) => rowsFromObjects(key, rows));
  // Учётки и журнал обязательны; справочники и статистика компании — по
  // возможности (без них нет причин ухода и доли в ФОТ компании)
  const [employees, salaryLog, reasons, subs, wageFundByMonth, monthlyStats] = await Promise.all([
    q('employees'),
    q('salaryLog'),
    optional('reasons', q('reasons')),
    optional('subs', q('subs')),
    optional('wageFundByMonth', q('wageFundByMonth')),
    optional('monthlyStats', q('monthlyStats')),
  ]);
  return {
    dataset: {
      employees,
      salaryLog,
      reasons,
      subs,
      wageFundByMonth,
      monthlyStats,
      source: 'clickhouse',
      takenAt: new Date().toISOString(),
    },
    scope: new Set(emails),
  };
}

/** Последний слепок: по дате данных, при равенстве — последний загруженный. */
export async function loadLatestSnapshot(): Promise<HrDataset | null> {
  const row = await prisma.hrSnapshot.findFirst({
    orderBy: [{ takenAt: 'desc' }, { id: 'desc' }],
    select: { takenAt: true, data: true },
  });
  if (!row) return null;
  return { ...tablesFromSnapshotData(row.data), source: 'snapshot', takenAt: row.takenAt.toISOString() };
}

async function compute(): Promise<Loaded> {
  if (clickHouseConfigured()) {
    try {
      return await loadLive();
    } catch (err) {
      // Живой HR не ответил — слепок; причину оставляем в логах
      console.error('[hrDataset] ClickHouse unavailable, using snapshot:', err instanceof Error ? err.message : err);
    }
  }
  const snapshot = await loadLatestSnapshot();
  if (!snapshot) throw new HrUnavailableError();
  return { dataset: snapshot, scope: null };
}

/**
 * Набор HR. cover — почты, которые нужны вызывающему: если живой набор
 * собран раньше, чем человек появился в Грейдах (или сменил email), набор
 * перечитывается — не чаще раза в минуту. Слепок не перечитывается: его
 * охват зафиксирован при загрузке.
 */
export async function loadHrDataset(cover: readonly string[] = []): Promise<HrDataset> {
  const loaded = await getOrCompute(CACHE_KEY, compute, DEFAULT_TTL_MS);
  if (!loaded.scope) return loaded.dataset;
  const scope = loaded.scope;
  const missing = cover.some((e) => {
    const k = normalizeEmail(e);
    return !!k && !scope.has(k);
  });
  if (!missing || Date.now() - lastCoverReload < COVER_RELOAD_MS) return loaded.dataset;
  lastCoverReload = Date.now();
  // Не вышло перечитать — остаёмся на прежнем наборе, а не на ошибке
  try {
    const fresh = await compute();
    setCached(CACHE_KEY, fresh, DEFAULT_TTL_MS);
    return fresh.dataset;
  } catch (err) {
    console.error('[hrDataset] reload for new email failed:', err instanceof Error ? err.message : err);
    return loaded.dataset;
  }
}

/** Только для тестов. */
export function resetHrDatasetForTests(): void {
  lastCoverReload = 0;
  invalidate(CACHE_KEY);
}
