export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/session';
import AppHeader from '@/components/AppHeader';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('admin');
  return (
    <>
      <AppHeader
        user={{ fullName: user.name ?? user.email ?? '—', role: user.role }}
        navItems={[
          { href: '/admin/users', label: 'Пользователи' },
          { href: '/admin/matrix', label: 'Матрица' },
          { href: '/admin/assessments', label: 'Оценки' },
          { href: '/admin/audit', label: 'Аудит-лог' },
        ]}
      />
      {children}
    </>
  );
}
