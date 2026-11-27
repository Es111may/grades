/**
 * Сверка состава с HR-порталом (Phase 23.6a, правила владельца от 27.11.2026):
 * у каждого, кто в HR работает или работал на дизайнерской позиции, должна
 * быть карточка в Грейдах, а ушедшие из компании — не числиться активными.
 * Правила плана — в src/lib/hrRegistry.ts (там же история решений), здесь
 * только данные, отчёт и запись.
 *
 * Запуск — вручную. На деплое не выполняется (в scripts/start.ts его нет).
 *
 *   npx tsx scripts/sync-hr-registry.ts
 *       Отчёт без записи: числа и id (HR id, user id), без имён и email.
 *       В конце — отпечаток плана.
 *   npx tsx scripts/sync-hr-registry.ts --verbose
 *       То же с именами, email и датами — только в свой терминал, не в общие логи.
 *   npx tsx scripts/sync-hr-registry.ts --apply --confirm=<отпечаток>
 *       Записать ровно план из отчёта одной транзакцией:
 *         • «Заведём» — работающих в HR, кого нет в Грейдах, активными, без
 *           пароля (войти смогут, когда админ задаст пароль); ушедших с
 *           границы — неактивными;
 *         • пустые даты найма и увольнения — из HR (и пустую дату найма у
 *           однозначной пары «Похоже, уже есть»);
 *         • «Деактивируем» — как кнопкой в интерфейсе (lib/deactivation):
 *           active = false, пустая дата увольнения — из HR, в «Действия» —
 *           «Деактивирован» с пометкой «Сверка с HR».
 *       Отпечаток — из последнего отчёта. План с тех пор изменился (новый
 *       слепок, правка в интерфейсе) — ничего не пишем: запусти отчёт снова.
 *   --skip-hr-id=<uuid>[,<uuid>…]
 *       Не трогать учётку HR: не заводить, не дозаполнять и не деактивировать
 *       по ней. Флаг можно повторить.
 *   --skip-user-id=<id>[,<id>…]
 *       Не трогать человека Грейдов: ни дат, ни деактивации.
 *       Id, которого нет ни в HR, ни в Грейдах, — ошибка в отчёте, и --apply
 *       тогда не пишет ничего: исправь список и запусти снова.
 *   --actor=<email>
 *       От чьего имени записи в «Действия» (активный админ). По умолчанию —
 *       первый активный админ.
 *   --departed-since=YYYY-MM-DD
 *       С какой даты увольнения заводить ушедших (включительно). По умолчанию
 *       2025-01-01 (REGISTRY_DEPARTED_SINCE). Существующих людей граница не
 *       касается.
 *
 * Убраны 27.11.2026: --include-active-missing и --include-hr-id. Новых теперь
 * заводим без флага; не заводить кого-то — --skip-hr-id. Старые флаги —
 * ошибка с этой подсказкой.
 *
 * Не трогаем никогда: админов (строка «Проверьте вручную»), тех, кого нет в
 * HR, кто в декрете, почасовщиков (числом); никого не активируем; поля
 * существующих людей не перетираем. Вне контура дизайна: отдел Lite и
 * позиция 29 «Дизайн-инженер» (числом).
 *
 * Данные HR — набор lib/hrDataset: живой ClickHouse, если CLICKHOUSE_* заданы
 * и он отвечает, иначе последний слепок из БД (scripts/hr-snapshot.ts).
 * Нужна DATABASE_URL (Postgres Грейдов).
 *
 * Повторный запуск безопасен: заведённые совпадут по email, заполненные даты
 * не трогаются, деактивированные уже неактивны — план будет пустым (кроме
 * справок и нерешённых расхождений). Запись проверяет «пусто ли поле» и
 * «активен ли» ещё раз внутри транзакции: правку, сделанную в интерфейсе
 * между отчётом и записью, скрипт не перетрёт. Сессия деактивированного
 * гаснет при ближайшей проверке — не позже 5 минут (lib/auth).
 *
 * Тип и причину ухода скрипт не ставит — их переносят из таблички отдельно.
 * Персональные данные в git не попадают: скрипт читает их из набора HR и пишет в БД.
 */

import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../src/lib/db';
import { AUDIT_ACTIONS } from '../src/lib/auditShared';
import { todayMoscowIso } from '../src/lib/dates';
import { deactivationWrites } from '../src/lib/deactivation';
import { loadHrDataset, type HrDataset, type HrRow } from '../src/lib/hrDataset';
import { canDeactivateUser } from '../src/lib/permissions';
import {
  REGISTRY_DEPARTED_SINCE,
  normalizeHrDate,
  planRegistrySync,
  type HrPerson,
  type RegistryConflictKind,
  type RegistryCreate,
  type RegistryPerson,
  type RegistryPlan,
} from '../src/lib/hrRegistry';

const FLAGS = ['--apply', '--verbose'] as const;
const VALUE_FLAGS = ['--actor=', '--departed-since=', '--skip-hr-id=', '--skip-user-id=', '--confirm='] as const;
/** Флаги, убранные 27.11.2026 — понятная ошибка вместо «неизвестного». */
const REMOVED_FLAGS = ['--include-active-missing', '--include-hr-id'] as const;

/** HR id — UUID, как его отдаёт toString(e.id). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Значения флага: через запятую и/или флагом несколько раз, без повторов. */
function listValues(argv: string[], flag: string): string[] | null {
  const args = argv.filter((a) => a.startsWith(flag));
  if (!args.length) return null;
  return Array.from(
    new Set(
      args
        .flatMap((a) => a.slice(flag.length).split(','))
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export function parseArgs(argv: string[]) {
  const removed = argv.find((a) => REMOVED_FLAGS.some((f) => a === f || a.startsWith(`${f}=`)));
  if (removed) {
    throw new Error(
      `Флаг ${removed.split('=')[0]} убран 27.11.2026: новые из HR заводятся без флага. ` +
        'Не заводить кого-то — --skip-hr-id=<uuid>.',
    );
  }
  const value = (flag: string) => argv.find((a) => a.startsWith(flag))?.slice(flag.length).trim() || null;
  const unknown = argv.filter(
    (a) => !(FLAGS as readonly string[]).includes(a) && !VALUE_FLAGS.some((f) => a.startsWith(f)),
  );
  if (unknown.length) {
    throw new Error(
      `Неизвестные аргументы: ${unknown.join(' ')}. Есть: ${FLAGS.join(' ')} --confirm=<отпечаток> ` +
        '--skip-hr-id=<uuid>[,…] --skip-user-id=<id>[,…] --actor=<email> --departed-since=YYYY-MM-DD',
    );
  }
  const sinceArg = value('--departed-since=');
  const departedSince = sinceArg ? normalizeHrDate(sinceArg) : REGISTRY_DEPARTED_SINCE;
  if (!departedSince) throw new Error('--departed-since — дата в формате YYYY-MM-DD');

  const skipHr = listValues(argv, '--skip-hr-id=');
  if (skipHr && !skipHr.length) throw new Error('--skip-hr-id — без id');
  const notUuid = (skipHr ?? []).filter((id) => !UUID_RE.test(id));
  if (notUuid.length) throw new Error(`--skip-hr-id — HR id в виде UUID; не UUID: ${notUuid.join(', ')}`);

  const skipUser = listValues(argv, '--skip-user-id=');
  if (skipUser && !skipUser.length) throw new Error('--skip-user-id — без id');
  const notId = (skipUser ?? []).filter((id) => !/^\d+$/.test(id) || Number(id) <= 0);
  if (notId.length) throw new Error(`--skip-user-id — id пользователя числом; не число: ${notId.join(', ')}`);

  return {
    apply: argv.includes('--apply'),
    verbose: argv.includes('--verbose'),
    confirm: value('--confirm='),
    skipHrIds: skipHr ?? [],
    skipUserIds: (skipUser ?? []).map(Number),
    actor: value('--actor='),
    departedSince,
  };
}

/** «2025» для 1 января, иначе «2025-03-01» — в «ушли с …» / «ушли до …». */
const sinceLabel = (since: string) => (since.endsWith('-01-01') ? since.slice(0, 4) : since);

// ── Данные ──────────────────────────────────────────────────────────────

/** Учётка набора HR → вход планировщика. Пустые строки набора — «нет значения». */
export function toHrPerson(e: HrRow<'employees'>): HrPerson {
  return {
    id: e.id,
    email: e.email || null,
    firstNameRu: e.firstNameRu,
    lastNameRu: e.lastNameRu,
    firstName: e.firstName,
    lastName: e.lastName,
    positionId: e.positionId || null,
    department: e.department || null,
    hiredAt: e.hiredAt || null,
    dismissedAt: e.dismissedAt || null,
    isArchive: e.isArchive,
    isHourly: e.isHourly,
    maternityLeave: e.maternityLeave,
  };
}

/** «слепок на 27.11.2026» / «живой ClickHouse» — для строки отчёта. */
export function describeSource(ds: Pick<HrDataset, 'source' | 'takenAt'>): string {
  if (ds.source === 'clickhouse') return 'живой ClickHouse';
  const day = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short' }).format(
    new Date(ds.takenAt),
  );
  return `слепок на ${day}`;
}

// ── Отчёт ───────────────────────────────────────────────────────────────

const CONFLICT_LABEL: Record<Exclude<RegistryConflictKind, 'name_matches_user'>, string> = {
  no_email: 'В HR нет email — не с чем сопоставить',
  no_name: 'В HR нет имени — карточку не заводим',
  duplicate_name_in_hr: 'Несколько учёток HR с одним именем — не создаём ни одну, решить руками',
  dismissal_before_hire: 'В HR увольнение раньше найма — не создаём и дату не ставим',
  active_in_hr_inactive_in_grades: 'Справка: в HR работает, в Грейдах неактивен — не активируем',
};

const ROLE_LABEL: Record<string, string> = { designer: 'дизайнер', lead: 'лид' };

/** Строка о человеке — только для --verbose (имена и email). */
function describe(p: RegistryPerson): string {
  const dates = `${p.hiredAt ?? '?'} → ${p.dismissedAt ?? (p.departed ? 'без даты' : 'работает')}`;
  return [
    `${p.fullName} <${p.email}>`,
    ROLE_LABEL[p.role] ?? p.role,
    p.department ?? 'без отдела',
    dates,
    p.employmentType === 'hourly' ? 'почасовщик' : null,
    p.hrRows > 1 ? `дублей в HR: ${p.hrRows}` : null,
    `HR ${p.hrId}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** «Импрув 12, Криэйт 9, без отдела 1» — по убыванию. */
function breakdown<T>(items: T[], key: (x: T) => string): string {
  const m = new Map<string, number>();
  for (const x of items) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return Array.from(m)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .map(([k, n]) => `${k} ${n}`)
    .join(', ');
}

function printPeople(people: RegistryPerson[], verbose: boolean) {
  if (!people.length) return;
  if (verbose) for (const p of people) console.log(`    ${describe(p)}`);
  else console.log(`    HR id: ${people.map((p) => p.hrId).join(', ')}`);
}

function printCreate(list: RegistryCreate[], verbose: boolean) {
  if (!list.length) return;
  console.log(`    Роли: ${breakdown(list, (c) => ROLE_LABEL[c.role] ?? c.role)}`);
  console.log(`    Отделы: ${breakdown(list, (c) => c.department ?? 'без отдела')}`);
  const hourly = list.filter((c) => c.employmentType === 'hourly').length;
  if (hourly) console.log(`    Почасовщиков: ${hourly}`);
  printPeople(list, verbose);
}

export function printReport(
  plan: RegistryPlan,
  opts: {
    verbose: boolean;
    today: string;
    departedSince?: string;
    /** Откуда набор HR — describeSource. */
    source?: string;
  },
) {
  const since = opts.departedSince ?? REGISTRY_DEPARTED_SINCE;
  const v = opts.verbose;
  const s = plan.stats;
  const fresh = plan.create.filter((c) => c.active);
  const departed = plan.create.filter((c) => !c.active);
  const who = (id: number, email?: string, name?: string) =>
    `user #${id}${v && email ? ` ${name ? `${name} ` : ''}<${email}>` : ''}`;

  console.log(`\nСверка состава с HR-порталом · ${opts.today}`);
  if (opts.source) console.log(`  Данные HR: ${opts.source}`);
  console.log(
    `  HR: строк на позициях дизайна и дизайн-инженеров ${s.hrRows - s.ignoredPositions}` +
      (s.ignoredPositions ? ` (прочих позиций ${s.ignoredPositions} — только для сверки ушедших)` : '') +
      `, людей ${s.people}, склеено дублей по email ${s.mergedDuplicates}`,
  );
  // Вне контура дизайна (Pavel, 01.10.2026) — только числом
  console.log(`  Lite (дизайн-инженеры) — пропущено: ${s.skippedLite}`);
  console.log(`  Дизайн-инженеры (позиция) — пропущено: ${s.skippedEngineer}`);
  console.log(`  Совпали с Грейдами по email: ${s.matched}`);

  console.log(`\n  Заведём — работают в HR, нет в Грейдах (активными, без пароля): ${fresh.length}`);
  printCreate(fresh, v);
  console.log(`  Создать неактивными (ушли с ${sinceLabel(since)}): ${departed.length}`);
  printCreate(departed, v);
  // Граница ушедших (Pavel: трекаем с начала 2025) — одной строкой-счётчиком
  console.log(`  Пропущено: ушли до ${sinceLabel(since)} — ${plan.skipDepartedBefore.length}`);
  if (v) printPeople(plan.skipDepartedBefore, true);
  if (plan.skipDepartedUndated.length) {
    console.log(`  Пропущено: ушли без даты увольнения — ${plan.skipDepartedUndated.length}`);
    printPeople(plan.skipDepartedUndated, v);
  }
  // Декрет — личное: по умолчанию только число, HR id — с --verbose
  console.log(`  В декрете — не заводим: ${plan.onMaternity.length}`);
  if (v && plan.onMaternity.length) console.log(`    HR id: ${plan.onMaternity.map((p) => p.hrId).join(', ')}`);

  const similar = plan.conflicts.filter((c) => c.kind === 'name_matches_user');
  const fills = new Map(plan.update.filter((u) => u.byName).map((u) => [u.hrId, u] as const));
  console.log(`\n  Похоже, уже есть — совпало имя, email другой (не заводим): ${similar.length}`);
  for (const c of similar) {
    const pair = c.userIds ? c.userIds.map((id) => `#${id}`).join(', ') : `#${c.userId}`;
    const fill = fills.get(c.hrId);
    const note = c.ambiguous
      ? 'неоднозначно — только отчёт'
      : fill
        ? `дозаполним найм${v ? ` ${fill.set.hiredAt}` : ''}`
        : 'однозначно, даты не трогаем';
    console.log(`    HR ${c.hrId}${v && c.email ? ` <${c.email}>` : ''} ↔ user ${pair} · ${note}`);
  }

  console.log(`\n  Деактивируем — в HR ни одной живой учётки: ${plan.deactivate.length}`);
  for (const d of plan.deactivate) {
    const date = d.dismissedAt ? `дата увольнения из HR${v ? ` ${d.dismissedAt}` : ''}` : 'в HR без даты увольнения';
    console.log(`    ${who(d.userId, d.email, d.fullName)} · HR ${d.hrId} · ${date}`);
  }
  console.log(`  Проверьте вручную — ушли по HR, сверка не трогает: ${plan.manualCheck.length}`);
  for (const m of plan.manualCheck) {
    console.log(`    ${who(m.userId, m.email, m.fullName)} · HR ${m.hrId} · админ`);
  }
  console.log(
    `  Не деактивируем: нет в HR — ${s.notInHr}, в декрете — ${s.keptOnLeave}, почасовщики — ${s.keptHourly}`,
  );

  console.log(`\n  Дозаполнить пустые даты: ${plan.update.length}`);
  for (const u of plan.update) {
    const what = [
      u.set.hiredAt && `найм${v ? ` ${u.set.hiredAt}` : ''}`,
      u.set.dismissedAt && `увольнение${v ? ` ${u.set.dismissedAt}` : ''}`,
    ]
      .filter(Boolean)
      .join(', ');
    console.log(`    user #${u.userId}: ${what}${u.byName ? ' (по имени)' : ''}`);
  }

  console.log(`\n  Исключены (ExcludedEmail) — не создаются: ${plan.skipExcluded.length}`);
  printPeople(plan.skipExcluded, v);

  if (plan.skipped.hrIds.length || plan.skipped.userIds.length) {
    console.log(
      `\n  Не тронуто флагами --skip: ` +
        [
          plan.skipped.hrIds.length ? `HR ${plan.skipped.hrIds.join(', ')}` : '',
          plan.skipped.userIds.length ? `user ${plan.skipped.userIds.map((id) => `#${id}`).join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('; '),
    );
  }
  if (plan.skipErrors.hrIds.length || plan.skipErrors.userIds.length) {
    console.log(
      `\n  Ошибка --skip — таких нет ни в HR, ни в Грейдах: ` +
        [...plan.skipErrors.hrIds.map((id) => `HR ${id}`), ...plan.skipErrors.userIds.map((id) => `user #${id}`)].join(
          ', ',
        ),
    );
  }

  const rest = plan.conflicts.filter((c) => c.kind !== 'name_matches_user');
  console.log(`\n  Расхождения: ${rest.length}`);
  const kinds = Array.from(new Set(rest.map((c) => c.kind))) as Array<keyof typeof CONFLICT_LABEL>;
  for (const kind of kinds) {
    const list = rest.filter((c) => c.kind === kind);
    console.log(`    ${CONFLICT_LABEL[kind]}: ${list.length}`);
    for (const c of list) {
      const email = v && c.email ? ` <${c.email}>` : '';
      console.log(`      HR ${c.hrId}${email}${c.userId !== undefined ? ` · user #${c.userId}` : ''}`);
    }
  }
}

/**
 * Отпечаток плана — то, что запишет --apply: новые карточки, даты,
 * деактивации. --apply пишет, только если отпечаток совпал с отчётом.
 */
export function planFingerprint(plan: RegistryPlan): string {
  const payload = {
    create: plan.create.map((c) => [
      c.email,
      c.fullName,
      c.active,
      c.role,
      c.department,
      c.buildCode,
      c.hiredAt,
      c.dismissedAt,
      c.employmentType,
    ]),
    update: plan.update.map((u) => [u.userId, u.set.hiredAt ?? null, u.set.dismissedAt ?? null]),
    deactivate: plan.deactivate.map((d) => [d.userId, d.dismissedAt]),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 10);
}

/** Есть ли что записывать. */
export const planHasWork = (plan: RegistryPlan) =>
  plan.create.length > 0 || plan.update.length > 0 || plan.deactivate.length > 0;

// ── Запись ──────────────────────────────────────────────────────────────

const toDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null);

/** Пометка в «Действиях» для деактиваций сверкой. */
export const HR_SYNC_REASON = 'Сверка с HR';

/**
 * План — одной транзакцией: всё или ничего. Новые карточки — createMany
 * (сотня одиночных INSERT через внешнее соединение не уложилась бы в
 * таймаут транзакции), записи в «Действия» — пишем здесь же, через tx, а не
 * writeAudit: тот ходит мимо транзакции и глотает ошибки.
 */
export async function applyPlan(
  plan: RegistryPlan,
  actorId: number,
  buildIdByCode: Map<string, number>,
  // Клиент — параметром: тест подставляет поддельный и проверяет запись без БД
  db: PrismaClient = prisma,
  // Сегодня по Москве, полночь UTC — дата увольнения, если в HR её нет
  today: Date = new Date(`${todayMoscowIso()}T00:00:00.000Z`),
) {
  return db.$transaction(
    async (tx) => {
      let created = 0;
      if (plan.create.length) {
        const byEmail = new Map<string, RegistryCreate>(plan.create.map((c) => [c.email, c]));
        const r = await tx.user.createMany({
          data: plan.create.map((c) => ({
            email: c.email,
            fullName: c.fullName,
            role: c.role,
            buildId: c.buildCode ? buildIdByCode.get(c.buildCode) ?? null : null,
            department: c.department,
            hiredAt: toDate(c.hiredAt),
            dismissedAt: toDate(c.dismissedAt),
            active: c.active,
            employmentType: c.employmentType,
            // Без пароля: неактивному войти нельзя, активному — пока админ не задаст
            passwordHash: null,
          })),
        });
        created = r.count;
        const rows = await tx.user.findMany({
          where: { email: { in: Array.from(byEmail.keys()) } },
          select: { id: true, email: true },
        });
        await tx.auditLog.createMany({
          data: rows.map((u) => {
            const c = byEmail.get(u.email)!;
            return {
              actorId,
              action: AUDIT_ACTIONS.USER_IMPORTED_FROM_HR,
              targetType: 'user',
              targetId: u.id,
              // Роль и даты — без денег, типа и причины ухода: журнал видит лид
              details: {
                after: {
                  role: c.role,
                  active: c.active,
                  employmentType: c.employmentType,
                  department: c.department,
                  hiredAt: c.hiredAt,
                  dismissedAt: c.dismissedAt,
                },
                reason: 'Из HR-портала',
                hrId: c.hrId,
              },
            };
          }),
        });
      }

      // Только если поле всё ещё пустое — правку из интерфейса не перетираем
      let updated = 0;
      for (const u of plan.update) {
        const after: { hiredAt?: string; dismissedAt?: string } = {};
        if (u.set.hiredAt) {
          const r = await tx.user.updateMany({
            where: { id: u.userId, hiredAt: null },
            data: { hiredAt: toDate(u.set.hiredAt) },
          });
          if (r.count) after.hiredAt = u.set.hiredAt;
        }
        if (u.set.dismissedAt) {
          const r = await tx.user.updateMany({
            where: { id: u.userId, active: false, dismissedAt: null },
            data: { dismissedAt: toDate(u.set.dismissedAt) },
          });
          if (r.count) after.dismissedAt = u.set.dismissedAt;
        }
        if (!after.hiredAt && !after.dismissedAt) continue;
        updated++;
        await tx.auditLog.create({
          data: {
            actorId,
            action: AUDIT_ACTIONS.USER_DATES_FROM_HR,
            targetType: 'user',
            targetId: u.userId,
            details: {
              before: Object.fromEntries(Object.keys(after).map((k) => [k, null])),
              after,
              reason: 'Из HR-портала',
              hrId: u.hrId,
              ...(u.byName && { match: 'name' }),
            },
          },
        });
      }

      // Деактивация — как кнопкой в интерфейсе (lib/deactivation). Человек
      // ещё активен и не стал админом — иначе его поправили в интерфейсе
      // после отчёта, не трогаем. Права — те же, что у интерфейса.
      let deactivated = 0;
      let unchanged = 0;
      const actor = { id: actorId, role: 'admin' };
      for (const d of plan.deactivate) {
        const u = await tx.user.findUnique({
          where: { id: d.userId },
          select: { id: true, role: true, active: true, leadId: true, hiredAt: true, dismissedAt: true },
        });
        if (!u || !u.active || u.role === 'admin' || !canDeactivateUser(actor, u)) {
          unchanged++;
          continue;
        }
        const w = deactivationWrites(u, {
          actorId,
          today,
          hrDismissedAt: toDate(d.dismissedAt),
          note: { reason: HR_SYNC_REASON, hrId: d.hrId },
        });
        const r = await tx.user.updateMany({ where: { id: u.id, active: true }, data: w.data });
        if (!r.count) {
          unchanged++;
          continue;
        }
        await tx.auditLog.createMany({ data: w.audits });
        deactivated++;
      }
      return { created, updated, deactivated, unchanged };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}

async function resolveActor(email: string | null): Promise<number> {
  const actor = await prisma.user.findFirst({
    where: {
      role: 'admin',
      active: true,
      ...(email ? { email: { equals: email, mode: 'insensitive' as const } } : {}),
    },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  if (!actor) {
    throw new Error(email ? 'Активный админ с этим email не найден (--actor)' : 'В Грейдах нет активного админа');
  }
  return actor.id;
}

// ── Точка входа ─────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const today = todayMoscowIso();

  // Сначала HR: нет ни живого, ни слепка — дальше не идём
  const dataset = await loadHrDataset();
  const hr = dataset.employees.map(toHrPerson);
  // Пустой набор — скорее сломанный запрос или не та база, чем «все ушли»
  if (!hr.length) throw new Error('В наборе HR нет ни одной учётки — проверь источник');

  const [users, excluded, builds] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        active: true,
        role: true,
        employmentType: true,
        hiredAt: true,
        dismissedAt: true,
      },
    }),
    prisma.excludedEmail.findMany({ select: { email: true } }),
    prisma.build.findMany({ select: { id: true, code: true } }),
  ]);

  const plan = planRegistrySync({
    hr,
    users: users.map((u) => ({
      ...u,
      hiredAt: u.hiredAt?.toISOString() ?? null,
      dismissedAt: u.dismissedAt?.toISOString() ?? null,
    })),
    excluded: excluded.map((e) => e.email),
    options: {
      today,
      departedSince: args.departedSince,
      skipHrIds: args.skipHrIds,
      skipUserIds: args.skipUserIds,
    },
  });
  printReport(plan, {
    verbose: args.verbose,
    today,
    departedSince: args.departedSince,
    source: describeSource(dataset),
  });
  const fingerprint = planFingerprint(plan);
  console.log(`\n  Отпечаток плана: ${fingerprint}`);

  if (!args.apply) {
    console.log(
      planHasWork(plan)
        ? `\nРежим просмотра — ничего не записано. Записать этот план: --apply --confirm=${fingerprint}\n`
        : '\nРежим просмотра — делать нечего: состав сходится с HR.\n',
    );
    return;
  }
  // Оператор исключал конкретных людей, а id не тот — не пишем и остальное
  if (plan.skipErrors.hrIds.length || plan.skipErrors.userIds.length) {
    throw new Error('--skip-…: есть id, которых нет ни в HR, ни в Грейдах (см. отчёт) — ничего не записано');
  }
  if (!planHasWork(plan)) {
    console.log('\nДелать нечего — состав сходится с HR.\n');
    return;
  }
  if (!args.confirm) {
    throw new Error(`--apply пишет только подтверждённый план: добавь --confirm=${fingerprint} после проверки отчёта`);
  }
  if (args.confirm !== fingerprint) {
    throw new Error('План изменился с отчёта (отпечаток не тот) — ничего не записано. Запусти отчёт снова');
  }
  const actorId = await resolveActor(args.actor);
  const buildIdByCode = new Map(builds.map((b) => [b.code, b.id]));
  const r = await applyPlan(plan, actorId, buildIdByCode);
  console.log(
    `\nЗаписано: карточек ${r.created}, дозаполнено дат ${r.updated}, деактивировано ${r.deactivated}` +
      (r.unchanged ? ` (не тронуто — поправили после отчёта: ${r.unchanged})` : '') +
      '. Повторный запуск без --apply должен показать пустой план.\n',
  );
}

// Только при запуске скриптом (tsx — CommonJS): тест импортирует
// printReport и applyPlan, и там require/module может не быть
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  main()
    .catch((e) => {
      console.error(`\nОшибка: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
