import { redirect } from 'next/navigation';
import { getCurrentUser, getDashboardForRole } from '@/lib/session';

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user || !user.role) {
    redirect('/auth/signin');
  }
  redirect(getDashboardForRole(user.role));
}
