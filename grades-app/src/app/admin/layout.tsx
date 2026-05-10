export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/session';
import AppHeader from '@/components/AppHeader';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Phase 10: stardiz получает доступ к /admin/users — пускаем его
  // в layout. Подстраницы /admin/matrix и /admin/grades делают
  // дополнительный role-guard через canEditMatrix.
  const user = await requireRole(['admin', 'lead', 'stardiz']);
  const isAdminish = user.role === 'admin' || user.role === 'lead';
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
      <AppHeader
        user={{ fullName: user.name ?? user.email ?? '—', role: user.role }}
        navItems={navItems}
      />
      {children}
    </>
  );
}
