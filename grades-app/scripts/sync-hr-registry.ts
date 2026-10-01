/**
 * Сверка реестра с HR-порталом (Phase 23.6a): у каждого, кто в HR числится на
 * дизайнерской позиции, должна быть карточка в Грейдах. Нынешние совпадают
 * по email; ушедшие заводятся неактивными, без пароля (войти нельзя). Правила
 * плана — в src/lib/hrRegistry.ts, здесь только выборка, отчёт и запись.
 *
 * Запуск — вручную. На деплое не выполняется (в scripts/start.ts его нет).
 *
 *   npx tsx scripts/sync-hr-registry.ts
 *       Отчёт без записи: числа и id (HR id, user id), без имён и email.
 *   npx tsx scripts/sync-hr-registry.ts --verbose
 *       То же с именами, email и датами — только в свой терминал, не в общие логи.
 *   npx tsx scripts/sync-hr-registry.ts --apply
 *       Записать план одной транзакцией: ушедших — неактивными карточками,
 *       пустые даты найма и увольнения — из HR; на каждую новую карточку и
 *       каждое дозаполнение — запись в «Действия».
 *   npx tsx scripts/sync-hr-registry.ts --apply --include-active-missing
 *       Плюс завести активных в HR, которых нет в Грейдах, — активными, без
 *       пароля: войти смогут, когда админ задаст пароль. Без флага они только
 *       перечисляются в отчёте.
 *   npx tsx scripts/sync-hr-registry.ts --apply --include-hr-id=<uuid>[,<uuid>…]
 *       То же, но только для перечисленных (HR id из отчёта; флаг можно
 *       повторить). Id не из списка «активные, нет в Грейдах» (опечатка, уже
 *       в Грейдах, в декрете, Lite…) — ошибка в отчёте, и --apply тогда не
 *       пишет ничего: исправь список и запусти снова.
 *   --actor=<email>
 *       От чьего имени записи в «Действия» (активный админ). По умолчанию —
 *       первый активный админ.
 *   --departed-since=YYYY-MM-DD
 *       С какой даты увольнения заводить ушедших (включительно). По умолчанию
 *       2025-01-01 (REGISTRY_DEPARTED_SINCE): ушедшие раньше и без даты
 *       увольнения не создаются, в отчёте — числом. Существующих людей
 *       граница не касается.
 *
 * Нужны переменные: DATABASE_URL (Postgres Грейдов) и CLICKHOUSE_HOST,
 * CLICKHOUSE_PORT, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD (HR-портал).
 *
 * Вне контура дизайна и не создаются: отдел Lite и позиция 29 «Дизайн-
 * инженер» (в отчёте — числом), активные в декрете (числом, HR id —
 * с --verbose) — ни по каким флагам.
 *
 * Повторный запуск безопасен: созданные совпадут по email, заполненные даты
 * не трогаются — план будет пустым (кроме справок и нерешённых расхождений).
 * Тот же --include-hr-id при повторе — ошибка «уже в Грейдах»: флаг убрать.
 * Запись проверяет «пусто ли поле» ещё раз внутри транзакции: правку,
 * сделанную в интерфейсе между отчётом и записью, скрипт не перетрёт.
 *
 * Тип и причину ухода скрипт не ставит — их переносят из таблички отдельно.
 * Персональные данные в git не попадают: скрипт читает их из HR и пишет в БД.
 */

import type { PrismaClient } from '@prisma/client';
import { prisma } from '../src/lib/db';
import { chQuery } from '../src/lib/clickhouse';
import { AUDIT_ACTIONS } from '../src/lib/audit';
import { todayMoscowIso } from '../src/lib/dates';
import {
  HR_REGISTRY_POSITION_IDS,
  REGISTRY_DEPARTED_SINCE,
  normalizeHrDate,
  planRegistrySync,
  type HrPerson,
  type RegistryConflictKind,
  type RegistryCreate,
  type RegistryIncludeErrorReason,
  type RegistryPerson,
  type RegistryPlan,
} from '../src/lib/hrRegistry';

const FLAGS = ['--apply', '--verbose', '--include-active-missing'] as const;

const INCLUDE_FLAG = '--include-hr-id=';

const VALUE_FLAGS = ['--actor=', '--departed-since=', INCLUDE_FLAG] as const;

/** HR id — UUID, как его отдаёт toString(e.id). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseArgs(argv: string[]) {
  const value = (flag: string) => argv.find((a) => a.startsWith(flag))?.slice(flag.length).trim() || null;
  const unknown = argv.filter(
    (a) => !(FLAGS as readonly string[]).includes(a) && !VALUE_FLAGS.some((f) => a.startsWith(f)),
  );
  if (unknown.length) {
    throw new Error(
      `Неизвестные аргументы: ${unknown.join(' ')}. Есть: ${FLAGS.join(' ')} --include-hr-id=<uuid>[,<uuid>…] ` +
        '--actor=<email> --departed-since=YYYY-MM-DD',
    );
  }
  const sinceArg = value('--departed-since=');
  const departedSince = sinceArg ? normalizeHrDate(sinceArg) : REGISTRY_DEPARTED_SINCE;
  if (!departedSince) throw new Error('--departed-since — дата в формате YYYY-MM-DD');

  // --include-hr-id: через запятую и/или флагом несколько раз
  const includeArgs = argv.filter((a) => a.startsWith(INCLUDE_FLAG));
  const includeHrIds = Array.from(
    new Set(
      includeArgs
        .flatMap((a) => a.slice(INCLUDE_FLAG.length).split(','))
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  if (includeArgs.length && !includeHrIds.length) throw new Error('--include-hr-id — без id');
  const notUuid = includeHrIds.filter((id) => !UUID_RE.test(id));
  if (notUuid.length) throw new Error(`--include-hr-id — HR id в виде UUID; не UUID: ${notUuid.join(', ')}`);

  return {
    apply: argv.includes('--apply'),
    verbose: argv.includes('--verbose'),
    includeActiveMissing: argv.includes('--include-active-missing'),
    includeHrIds,
    actor: value('--actor='),
    departedSince,
  };
}

/** «2025» для 1 января, иначе «2025-03-01» — в «ушли с …» / «ушли до …». */
const sinceLabel = (since: string) => (since.endsWith('-01-01') ? since.slice(0, 4) : since);

// ── Выборка ─────────────────────────────────────────────────────────────

/**
 * Все учётки HR на позициях дизайна и дизайн-инженеров — и живые, и
 * ушедшие, с дублями: склейку и контур (без Lite и дизайн-инженеров) делает
 * планировщик, дизайн-инженеров выбираем, только чтобы посчитать. Отдел —
 * через команду. Даты — как в lib/hrSalary (toDate → строка; «нет даты»
 * в HR — 1970-01-01).
 */
async function fetchHr(): Promise<HrPerson[]> {
  // id позиций — числа из нашего же справочника, в SQL подставляем как есть
  const positions = HR_REGISTRY_POSITION_IDS.map((n) => String(Math.trunc(n))).join(', ');
  return chQuery<HrPerson>(
    `SELECT toString(e.id) AS id,
            e.email AS email,
            e.first_name_ru AS firstNameRu,
            e.last_name_ru AS lastNameRu,
            e.first_name AS firstName,
            e.last_name AS lastName,
            e.position_id AS positionId,
            d.name AS department,
            toString(toDate(e.date_of_employee)) AS hiredAt,
            toString(toDate(e.date_of_dismissal)) AS dismissedAt,
            e.is_archive AS isArchive,
            e.is_hourly AS isHourly,
            e.maternity_leave AS maternityLeave
       FROM hr_portal_current.employee_employee AS e
       LEFT JOIN hr_portal_current.employee_team AS t ON t.id = e.team_id
       LEFT JOIN hr_portal_current.employee_department AS d ON d.id = t.department_id
      WHERE e.position_id IN (${positions})`,
  );
}

// ── Отчёт ───────────────────────────────────────────────────────────────

const CONFLICT_LABEL: Record<RegistryConflictKind, string> = {
  no_email: 'В HR нет email — не с чем сопоставить',
  no_name: 'В HR нет имени — карточку не заводим',
  name_matches_user:
    'Нет по email, но есть тёзка в Грейдах (старая учётка или сменённый email) — не создаём. ' +
    'Старую учётку — в ExcludedEmail или разобрать руками',
  duplicate_name_in_hr: 'Несколько учёток HR с одним именем — не создаём ни одну, решить руками',
  dismissal_before_hire: 'В HR увольнение раньше найма — не создаём и дату не ставим',
  active_in_hr_inactive_in_grades: 'Справка: в HR работает, в Грейдах неактивен — не активируем',
  dismissed_in_hr_active_in_grades: 'Справка: в HR уволен, в Грейдах активен — не деактивируем',
};

const INCLUDE_ERROR_LABEL: Record<RegistryIncludeErrorReason, string> = {
  not_found: 'нет в выборке HR (позиции 9, 20, 29) — опечатка или другая позиция',
  merged: 'склеена с другой учёткой того же email — нужен HR id из отчёта',
  outside_contour: 'Lite или дизайн-инженер — вне контура дизайна',
  in_grades: 'уже в Грейдах',
  excluded: 'в ExcludedEmail',
  on_maternity: 'в декрете — не добавляем',
  departed: 'ушёл — активной карточкой не заводим',
  conflict: 'расхождение — сначала разобрать (см. «Расхождения»)',
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

export function printReport(
  plan: RegistryPlan,
  opts: {
    verbose: boolean;
    includeActiveMissing: boolean;
    /** Id из --include-hr-id: был ли флаг — чтобы подписать «нет в Грейдах». */
    includeHrIds?: readonly string[];
    today: string;
    departedSince?: string;
  },
) {
  const since = opts.departedSince ?? REGISTRY_DEPARTED_SINCE;
  const s = plan.stats;
  const departed = plan.create.filter((c) => !c.active);
  const activeCreate = plan.create.filter((c) => c.active);
  const byIds = !opts.includeActiveMissing && !!opts.includeHrIds?.length;
  console.log(`\nСверка реестра с HR-порталом · ${opts.today}`);
  console.log(
    `  HR: строк на позициях дизайна и дизайн-инженеров ${s.hrRows - s.ignoredPositions}` +
      (s.ignoredPositions ? ` (вне их пропущено ${s.ignoredPositions})` : '') +
      `, людей ${s.people}, склеено дублей по email ${s.mergedDuplicates}`,
  );
  // Вне контура дизайна (Pavel, 01.10.2026) — только числом
  console.log(`  Lite (дизайн-инженеры) — пропущено: ${s.skippedLite}`);
  console.log(`  Дизайн-инженеры (позиция) — пропущено: ${s.skippedEngineer}`);
  console.log(`  Совпали с Грейдами по email: ${s.matched}`);

  console.log(`\n  Создать неактивными (ушли с ${sinceLabel(since)}): ${departed.length}`);
  if (departed.length) {
    console.log(`    Роли: ${breakdown(departed, (c) => ROLE_LABEL[c.role] ?? c.role)}`);
    console.log(`    Отделы: ${breakdown(departed, (c) => c.department ?? 'без отдела')}`);
    const hourly = departed.filter((c) => c.employmentType === 'hourly').length;
    if (hourly) console.log(`    Почасовщиков: ${hourly}`);
    printPeople(departed, opts.verbose);
  }
  // Граница ушедших (Pavel: трекаем с начала 2025) — одной строкой-счётчиком;
  // имена — только с --verbose
  console.log(`  Пропущено: ушли до ${sinceLabel(since)} — ${plan.skipDepartedBefore.length}`);
  if (opts.verbose) printPeople(plan.skipDepartedBefore, true);
  if (plan.skipDepartedUndated.length) {
    console.log(`  Пропущено: ушли без даты увольнения — ${plan.skipDepartedUndated.length}`);
    printPeople(plan.skipDepartedUndated, opts.verbose);
  }

  console.log(
    `\n  Активные в HR, нет в Грейдах: ${plan.activeMissing.length}` +
      (plan.activeMissing.length
        ? opts.includeActiveMissing
          ? ' — будут созданы активными, без пароля'
          : byIds
            ? ` — по --include-hr-id создаём активными, без пароля: ${activeCreate.length}, остальные не создаются`
            : ' — не создаются (нужен --include-active-missing или --include-hr-id)'
        : ''),
  );
  if (plan.activeMissing.length) {
    console.log(`    Отделы: ${breakdown(plan.activeMissing, (c) => c.department ?? 'без отдела')}`);
    printPeople(plan.activeMissing, opts.verbose);
  }
  if (byIds && activeCreate.length) {
    console.log('    Создаём:');
    printPeople(activeCreate, opts.verbose);
  }
  if (plan.includeErrors.length) {
    console.log(`\n  Ошибка --include-hr-id — не из «нет в Грейдах», не создаём: ${plan.includeErrors.length}`);
    for (const e of plan.includeErrors) {
      // Декрет рядом с HR id — только с --verbose, как и список ниже
      const why =
        e.reason === 'on_maternity' && !opts.verbose ? 'не создаём (причина — с --verbose)' : INCLUDE_ERROR_LABEL[e.reason];
      console.log(`    HR ${e.hrId}: ${why}`);
    }
  }

  // Декрет — личное: по умолчанию только число, HR id — с --verbose
  console.log(`\n  В декрете — не добавляем: ${plan.onMaternity.length}`);
  if (opts.verbose && plan.onMaternity.length) {
    console.log(`    HR id: ${plan.onMaternity.map((p) => p.hrId).join(', ')}`);
  }

  console.log(`\n  Дозаполнить пустые даты: ${plan.update.length}`);
  for (const u of plan.update) {
    const what = [
      u.set.hiredAt && `найм${opts.verbose ? ` ${u.set.hiredAt}` : ''}`,
      u.set.dismissedAt && `увольнение${opts.verbose ? ` ${u.set.dismissedAt}` : ''}`,
    ]
      .filter(Boolean)
      .join(', ');
    console.log(`    user #${u.userId}: ${what}`);
  }

  console.log(`\n  Исключены (ExcludedEmail) — не создаются: ${plan.skipExcluded.length}`);
  printPeople(plan.skipExcluded, opts.verbose);

  console.log(`\n  Расхождения: ${plan.conflicts.length}`);
  const kinds = Array.from(new Set(plan.conflicts.map((c) => c.kind)));
  for (const kind of kinds) {
    const list = plan.conflicts.filter((c) => c.kind === kind);
    console.log(`    ${CONFLICT_LABEL[kind]}: ${list.length}`);
    for (const c of list) {
      const who = opts.verbose && c.email ? ` <${c.email}>` : '';
      console.log(`      HR ${c.hrId}${who}${c.userId !== undefined ? ` · user #${c.userId}` : ''}`);
    }
  }
}

// ── Запись ──────────────────────────────────────────────────────────────

const toDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null);

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
            },
          },
        });
      }
      return { created, updated };
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

  // Сначала HR: недоступен — в БД Грейдов не ходим вовсе
  const hr = await fetchHr();
  // Пустая выборка — скорее сломанный запрос или не та база, чем «все ушли»
  if (!hr.length) throw new Error('HR не вернул ни одной учётки на дизайнерских позициях — проверь запрос');

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
      includeActiveMissing: args.includeActiveMissing,
      includeHrIds: args.includeHrIds,
      departedSince: args.departedSince,
    },
  });
  printReport(plan, {
    verbose: args.verbose,
    includeActiveMissing: args.includeActiveMissing,
    includeHrIds: args.includeHrIds,
    today,
    departedSince: args.departedSince,
  });

  if (!args.apply) {
    console.log('\nРежим просмотра — ничего не записано. Записать: --apply\n');
    return;
  }
  // Оператор ждал конкретных людей, а id не тот — не пишем и остальное:
  // список поправить и запустить снова
  if (plan.includeErrors.length) {
    throw new Error('--include-hr-id: есть id не из «нет в Грейдах» (см. отчёт) — ничего не записано');
  }
  if (!plan.create.length && !plan.update.length) {
    console.log('\nДелать нечего — реестр сходится с HR.\n');
    return;
  }
  const actorId = await resolveActor(args.actor);
  const buildIdByCode = new Map(builds.map((b) => [b.code, b.id]));
  const r = await applyPlan(plan, actorId, buildIdByCode);
  console.log(
    `\nЗаписано: карточек ${r.created}, дозаполнено дат ${r.updated}. ` +
      'Повторный запуск без --apply должен показать пустой план.\n',
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
