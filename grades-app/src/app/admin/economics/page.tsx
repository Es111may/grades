export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { todayMoscowIso } from '@/lib/dates';
import { avatarSrc } from '@/lib/avatar';
import { loadHrEconomics } from '@/lib/hrEconomics';
import { loadSettings } from '@/lib/settings';
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

export default async function EconomicsPage() {
  await requireRole('admin');
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

  const [users, hr, grades, settings] = await Promise.all([
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
  ]);

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

  const dataset = hr.raw ? buildEconomicsDataset({ raw: hr.raw, grades: overlay, today }) : null;
  const asOfLabel = hr.raw ? MOSCOW_TIME.format(new Date(hr.raw.fetchedAt)) : null;

  return <EconomicsView dataset={dataset} initialSettings={settings} asOfLabel={asOfLabel} stale={hr.stale} />;
}
