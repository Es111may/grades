export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/session';
import AppHeader from '@/components/AppHeader';

export default async function DesignerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['designer', 'admin', 'lead', 'stardiz']);
  return (
    <>
      <AppHeader
        user={{ fullName: user.name ?? user.email ?? '—', role: user.role }}
        navItems={[
          { href: '/designer', label: 'Мой портрет' },
          { href: '/designer/history', label: 'История' },
        ]}
      />
      {children}
    </>
  );
}
