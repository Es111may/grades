export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/session';
import AppHeader from '@/components/AppHeader';

export default async function LeadLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['lead', 'admin']);
  return (
    <>
      <AppHeader
        user={{ fullName: user.name ?? user.email ?? '—', role: user.role }}
        navItems={[
          { href: '/lead', label: 'Мои дизайнеры' },
          { href: '/lead/assessments', label: 'Все оценки' },
        ]}
      />
      {children}
    </>
  );
}
