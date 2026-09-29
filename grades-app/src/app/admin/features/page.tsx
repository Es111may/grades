export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { sectionsFor, updatesFor, type FeatureRole } from '@/lib/features';
import FeaturesView from './FeaturesView';

/**
 * /admin/features — «Функционал»: что нового и что умеет сервис, под роль.
 * Админ, лид и стардиз (доступ — admin/layout). Фильтрация по роли — здесь,
 * на сервере: стардизу записи про зарплаты даже не уходят.
 */
export default async function FeaturesPage() {
  const me = await getCurrentUser();
  if (!me?.id) redirect('/auth/signin');
  const role = me.role as FeatureRole;
  if (role !== 'admin' && role !== 'lead' && role !== 'stardiz') redirect('/');
  return <FeaturesView role={role} updates={updatesFor(role)} sections={sectionsFor(role)} />;
}
