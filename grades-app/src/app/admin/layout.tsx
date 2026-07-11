export const dynamic = 'force-dynamic';

import { requireRole } from '@/lib/session';
import { ensureBuildNames, ensureProjectsSeeded } from '@/lib/oneTimeMigrations';
import AppHeader from '@/components/AppHeader';
import AssessmentReminder from '@/components/AssessmentReminder';
import DraftsReminder from '@/components/DraftsReminder';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Phase 10: stardiz получает доступ к /admin/users — пускаем его
  // в layout. Подстраницы /admin/matrix и /admin/grades делают
  // дополнительный role-guard через canEditMatrix.
  const user = await requireRole(['admin', 'lead', 'stardiz']);
  // Билды переименовали в названия отделов (май 2026) — миграция
  // идемпотентная, мгновенный no-op после первого срабатывания.
  await ensureBuildNames();
  // Справочник проектов: один раз при первом запуске заливает
  // начальный список (Phase 24). Дальше — управляется через UI.
  await ensureProjectsSeeded();
  const isAdminish = user.role === 'admin' || user.role === 'lead';
  const isLeadLike = user.role === 'lead' || user.role === 'stardiz';
  const navItems = isAdminish
    ? [
        { href: '/admin/users', label: 'Команда' },
        { href: '/admin/matrix', label: 'Матрица' },
        { href: '/admin/grades', label: 'Грейды' },
        { href: '/lead/assessments', label: 'Оценки' },
        // Аудит-лог (Phase 19) — admin и lead. Стардизам не показываем,
        // как договорились с Pavel'ом.
        { href: '/admin/audit', label: 'Аудит' },
        ...(isLeadLike ? [{ href: '/admin/lead-reviews', label: 'Мой портрет' }] : []),
      ]
    : [
        { href: '/admin/users', label: 'Команда' },
        { href: '/lead/assessments', label: 'Все оценки' },
        ...(isLeadLike ? [{ href: '/admin/lead-reviews', label: 'Мой портрет' }] : []),
      ];
  return (
    <>
      <AppHeader
        user={{ id: user.id, fullName: user.name ?? user.email ?? '—', role: user.role }}
        navItems={navItems}
      />
      {/* Капсулы-уведомления живут ПОД Dynamic Island-хедером.
          pt-3 = 12px компенсирует sticky-сдвиг острова (`top-3`): его
          flow-бокс на 12px выше визуального положения, без поправки
          капсула заезжала бы под остров. Внутри капсулы держат зазор
          8px (mt-2). DraftsReminder — асинхронный server-component,
          сам fetch'ит зависшие черновики; возвращает null, если их нет. */}
      <div className="pt-3">
        <AssessmentReminder />
        <DraftsReminder />
      </div>
      {children}
    </>
  );
}
