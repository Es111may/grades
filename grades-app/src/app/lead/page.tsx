import { redirect } from 'next/navigation';

// Phase 10: «Мои дизайнеры» удалены как отдельная страница, заменены
// фильтром «Все/Мои» в /admin/users. Страница оставлена как редирект,
// чтобы старые ссылки и привычки лидов работали.
export default function LeadIndexRedirect() {
  redirect('/admin/users');
}
