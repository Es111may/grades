export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/session';
import AppHeader from '@/components/AppHeader';
import AssessmentReminder from '@/components/AssessmentReminder';
import DraftsReminder from '@/components/DraftsReminder';

export default async function LeadLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['lead', 'admin', 'stardiz']);
  const isAdminish = user.role === 'admin' || user.role === 'lead';
  const isLeadLike = user.role === 'lead' || user.role === 'stardiz';
  // Phase 10: «Мои дизайнеры» удалены — заменены фильтром «Все/Мои»
  // внутри /admin/users. Stardiz получил доступ к /admin/users (видит
  // только своих подопечных по серверному фильтру).
  // Phase 22: лид/стардиз получают пункт «Мой портрет» — должен быть
  // виден на всех страницах (в т.ч. /lead/*), не только в /admin/*.
  const navItems = isAdminish
    ? [
        { href: '/admin/users', label: 'Пользователи' },
        { href: '/admin/matrix', label: 'Матрица' },
        { href: '/admin/grades', label: 'Грейды' },
        { href: '/lead/assessments', label: 'Оценки' },
        // Аудит-лог (Phase 19) — admin и lead. Стандартный пункт нав-меню.
        { href: '/admin/audit', label: 'Аудит' },
        ...(isLeadLike ? [{ href: '/admin/lead-reviews', label: 'Мой портрет' }] : []),
      ]
    : [
        { href: '/admin/users', label: 'Пользователи' },
        { href: '/lead/assessments', label: 'Все оценки' },
        ...(isLeadLike ? [{ href: '/admin/lead-reviews', label: 'Мой портрет' }] : []),
      ];
  return (
    <>
      <AssessmentReminder />
      <DraftsReminder />
      <AppHeader
        user={{ id: user.id, fullName: user.name ?? user.email ?? '—', role: user.role }}
        navItems={navItems}
      />
      {children}
    </>
  );
}
