export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/session';
import AppHeader from '@/components/AppHeader';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['admin', 'lead']);
  return (
    <>
      <AppHeader
        user={{ fullName: user.name ?? user.email ?? '—', role: user.role }}
        navItems={[
          { href: '/lead', label: 'Мои дизайнеры' },
          { href: '/admin/users', label: 'Пользователи' },
          { href: '/admin/matrix', label: 'Матрица' },
          { href: '/admin/grades', label: 'Грейды' },
          { href: '/lead/assessments', label: 'Оценки' },
        ]}
      />
      {children}
    </>
  );
}
