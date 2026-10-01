export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/session';
import { prisma } from '@/lib/db';
import { isGradingExempt } from '@/lib/employment';
import AppHeader from '@/components/AppHeader';
import SelfAssessmentReminder from '@/components/SelfAssessmentReminder';

export default async function DesignerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['designer', 'admin']);
  // Самооценка — подготовка к грейдированию: почасовщику и билду без
  // грейдов («Коммуникации») напоминание ни к чему. Билд и формат — из БД,
  // а не из сессии: в токене билд остаётся тем, что был при входе.
  const exempt =
    user.role === 'designer'
      ? await prisma.user
          .findUnique({
            where: { id: user.id },
            select: { employmentType: true, build: { select: { code: true } } },
          })
          .then((u) => !!u && isGradingExempt(u))
          .catch(() => false)
      : false;
  return (
    <>
      <AppHeader
        user={{ id: user.id, fullName: user.name ?? user.email ?? '—', role: user.role }}
        navItems={[
          { href: '/designer', label: 'Мой портрет' },
          { href: '/designer/history', label: 'История' },
        ]}
      />
      {/* Phase 14: сезонная капсула дизайнеру — обнови самооценку */}
      {user.role === 'designer' && !exempt && <SelfAssessmentReminder />}
      {children}
    </>
  );
}
