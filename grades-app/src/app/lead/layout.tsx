export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/session';
import AppHeader from '@/components/AppHeader';
import AssessmentReminder from '@/components/AssessmentReminder';

export default async function LeadLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['lead', 'admin', 'stardiz']);
  const isAdminish = user.role === 'admin' || user.role === 'lead';
  // Phase 10: «Мои дизайнеры» удалены — заменены фильтром «Все/Мои»
  // внутри /admin/users. Stardiz получил доступ к /admin/users (видит
  // только своих подопечных по серверному фильтру).
  const navItems = isAdminish
    ? [
        { href: '/admin/users', label: 'Пользователи' },
        { href: '/admin/matrix', label: 'Матрица' },
        { href: '/admin/grades', label: 'Грейды' },
        { href: '/lead/assessments', label: 'Оценки' },
      ]
    : [
        { href: '/admin/users', label: 'Пользователи' },
        { href: '/lead/assessments', label: 'Все оценки' },
      ];
  return (
    <>
      <AssessmentReminder />
      <AppHeader
        user={{ id: user.id, fullName: user.name ?? user.email ?? '—', role: user.role }}
        navItems={navItems}
      />
      {children}
    </>
  );
}
