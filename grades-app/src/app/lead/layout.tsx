export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/session';
import AppHeader from '@/components/AppHeader';

export default async function LeadLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['lead', 'admin', 'stardiz']);
  const isAdminish = user.role === 'admin' || user.role === 'lead';
  // Lead/admin: видят админский набор плюс «Мои дизайнеры».
  // Stardiz: только свои подопечные + свой портрет.
  const navItems = isAdminish
    ? [
        { href: '/lead', label: 'Мои дизайнеры' },
        { href: '/admin/users', label: 'Пользователи' },
        { href: '/admin/matrix', label: 'Матрица' },
        { href: '/admin/grades', label: 'Грейды' },
        { href: '/lead/assessments', label: 'Оценки' },
      ]
    : [
        { href: '/lead', label: 'Мои дизайнеры' },
        { href: '/lead/assessments', label: 'Все оценки' },
        { href: '/designer', label: 'Мой портрет' },
      ];
  return (
    <>
      <AppHeader
        user={{ fullName: user.name ?? user.email ?? '—', role: user.role }}
        navItems={navItems}
      />
      {children}
    </>
  );
}
