export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { todayMoscowIso } from '@/lib/dates';
import { avatarSrc } from '@/lib/avatar';
import { loadHrEconomics } from '@/lib/hrEconomics';
import { loadSettings } from '@/lib/settings';
import { displayEconomics, loadDisplayRates } from '@/lib/salaryOverride';
import { buildEconomicsDataset, inEconomicsContour, type GradesOverlay } from '@/lib/economics';
import EconomicsView from './EconomicsView';

/**
 * /admin/economics — «Экономика» дизайна (Phase 23.6b). Только админ: суммы
 * всей истории и причины ухода никому больше не уходят — проверка здесь, на
 * сервере, а пункт меню у остальных не рисуется (admin/layout).
 *
 * Контур — люди «Команды» (designer/stardiz/lead: работают или ушли не
 * раньше TRACK_SINCE), даты — из Грейдов. Ставки и журнал — из HR по их
 * email (lib/hrEconomics, кэш + бюджет PAGE_BUDGET_MS). HR не ответил —
 * последняя удачная выборка с меткой «Данные от …» или пустое состояние.
 * Набор из слепка HR (lib/hrDataset) — с подписью «Данные HR на …».
 * Ставки — какими их видит этот зритель (lib/salaryOverride): выборка в
 * кэше общая, копию под зрителя делаем здесь.
 */

const MOSCOW_TIME = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const iso = (d: Date | null) => d?.toISOString() ?? null;

const MOSCOW_DAY = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long' });
const MOSCOW_YEAR = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', year: 'numeric' });

/** «Данные HR на 27 ноября» — для набора из слепка; год — только не текущий. */
function snapshotLabel(takenAt: string, today: string): string {
  const d = new Date(takenAt);
  const year = MOSCOW_YEAR.format(d);
  return `Данные HR на ${MOSCOW_DAY.format(d)}${year === today.slice(0, 4) ? '' : ` ${year}`}`;
}

export default async function EconomicsPage() {
  const me = await requireRole('admin');
  const today = todayMoscowIso();

  // Люди — первыми: по их email идём в HR, параллельно с остальными чтениями
  const usersP = Promise.resolve(
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        department: true,
        build: { select: { code: true } },
        employmentType: true,
        active: true,
        hiredAt: true,
        dismissedAt: true,
        avatarUrl: true,
        dismissalType: true,
        dismissalReason: true,
        plannedRaiseSetAt: true,
        plannedRaiseBaselineAt: true,
        plannedRaiseAt: true,
        plannedRaiseSalary: true,
      },
    }),
  );
  const hrP = usersP.then((list) =>
    loadHrEconomics(
      list
        .filter((u) => inEconomicsContour({ role: u.role, active: u.active, dismissedAt: iso(u.dismissedAt) }))
        .map((u) => u.email),
    ),
  );

  const [users, hr, grades, settings, rates] = await Promise.all([
    usersP,
    hrP,
    // Грейд — последней опубликованной оценки, как в «Команде»
    prisma.$queryRaw<Array<{ designerId: number; effectiveGrade: string | null }>>`
      SELECT DISTINCT ON ("designerId") "designerId", "effectiveGrade"
      FROM assessments
      WHERE status = 'published' AND "effectiveGrade" IS NOT NULL
      ORDER BY "designerId", "publishedAt" DESC
    `,
    loadSettings(),
    // Не прочитались — как недоступный HR: без ставок
    loadDisplayRates(me).catch((err: unknown) => {
      console.error('[economics] HR unavailable:', err);
      return null;
    }),
  ]);
  const raw = hr.raw && rates ? displayEconomics(hr.raw, rates) : null;

  const gradeById = new Map(grades.map((g) => [g.designerId, g.effectiveGrade]));
  const overlay: GradesOverlay[] = users.map((u) => ({
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    department: u.department,
    buildCode: u.build?.code ?? null,
    employmentType: u.employmentType,
    active: u.active,
    // Дата по Москве: полночь UTC в БД — та же календарная дата
    hiredAt: iso(u.hiredAt),
    dismissedAt: iso(u.dismissedAt),
    grade: gradeById.get(u.id) ?? null,
    avatarUrl: avatarSrc(u),
    dismissalType: u.dismissalType,
    dismissalReason: u.dismissalReason,
    plannedRaise: u.plannedRaiseSetAt
      ? {
          setAt: u.plannedRaiseSetAt.toISOString(),
          baselineAt: iso(u.plannedRaiseBaselineAt),
          at: iso(u.plannedRaiseAt),
          salary: u.plannedRaiseSalary,
        }
      : null,
  }));

  const dataset = raw ? buildEconomicsDataset({ raw, grades: overlay, today }) : null;
  const asOfLabel = raw ? MOSCOW_TIME.format(new Date(raw.fetchedAt)) : null;
  // Набор из слепка — дата данных рядом с цифрами
  const hrDateLabel = raw?.source === 'snapshot' ? snapshotLabel(raw.fetchedAt, today) : null;

  return (
    <EconomicsView
      dataset={dataset}
      initialSettings={settings}
      asOfLabel={asOfLabel}
      stale={hr.stale}
      hrDateLabel={hrDateLabel}
    />
  );
}
