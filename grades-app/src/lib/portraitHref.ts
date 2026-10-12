// Куда ведёт «Портрет» человека: кнопка в поп-апе 360 и настоящий href у
// строк и карточек «Команды» — чтобы портрет открывался в соседней вкладке
// (Cmd/Ctrl-клик, колесо, контекстное меню), а обычный клик, как и раньше,
// открывал поп-ап (Pavel, 12.10.2026).
//
// Права — те же, что проверяют сами страницы. Без них страница вернула бы
// в «Команду», а мёртвых ссылок не даём — тогда null:
//  • дизайнер → /lead/portrait?id= — админ, лид или стардиз этого
//    дизайнера (lead/portrait/page.tsx; раздел /lead — admin/lead/stardiz);
//  • лид и стардиз → портрет 360 /admin/lead-reviews?userId= — админ или
//    сам человек (admin/lead-reviews/page.tsx).
// Неактивных никуда не ведём — как и прежняя кнопка «Портрет» в поп-апе.
// Без node-модулей — для клиента.

export type PortraitHrefPerson = {
  id: number;
  role: string;
  active: boolean;
  leadId: number | null;
  stardizId: number | null;
};

export type PortraitHrefViewer = { id: number; role: string } | null;

/** Портрет дизайнера (и стардиза — страница пускает и его) для лида и админа. */
export function designerPortraitHref(id: number): string {
  return `/lead/portrait?id=${id}`;
}

/** Портрет 360 лида или стардиза. */
export function leadPortraitHref(id: number): string {
  return `/admin/lead-reviews?userId=${id}`;
}

export function portraitHref(
  person: PortraitHrefPerson,
  viewer: PortraitHrefViewer,
): string | null {
  if (!viewer || !person.active) return null;
  if (person.role === 'designer') {
    const canView =
      viewer.role === 'admin' ||
      ((viewer.role === 'lead' || viewer.role === 'stardiz') &&
        (person.leadId === viewer.id || person.stardizId === viewer.id));
    return canView ? designerPortraitHref(person.id) : null;
  }
  if (person.role === 'lead' || person.role === 'stardiz') {
    const canView = viewer.role === 'admin' || viewer.id === person.id;
    return canView ? leadPortraitHref(person.id) : null;
  }
  return null;
}
