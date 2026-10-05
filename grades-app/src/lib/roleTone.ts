// Роли в интерфейсе — подпись и тон чипа роли. Один источник для поп-апа
// 360, канбана, меню пользователя, журнала «Действия», ИПР и модалки
// «Изменить». Раньше словарь и тона жили копиями в каждом файле.
//
// Чистый модуль без React. Сами тона — классы .chip-role-* в globals.css:
// только фон и цвет текста, размер чипа задаёт место (.chip h-6 в поп-апе,
// px-1.5 py-0.5 10px в карточке канбана).

/** Подпись роли в единственном числе: «Админ», «Лид», «Стардиз», «Дизайнер». */
export const ROLE_LABEL: Readonly<Record<string, string>> = {
  admin: 'Админ',
  lead: 'Лид',
  stardiz: 'Стардиз',
  designer: 'Дизайнер',
};

/** Подпись роли; неизвестная роль — как есть (код), чтобы не потерять её молча. */
export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

// Полные имена классов — литералами: Tailwind оставляет в сборке только те
// классы @layer components, что встречает в исходниках.
const ROLE_TONE_CLASS: Readonly<Record<string, string>> = {
  admin: 'chip-role-admin',
  lead: 'chip-role-lead',
  stardiz: 'chip-role-stardiz',
  designer: 'chip-role-designer',
};

/** Класс тона чипа роли. Неизвестная роль — нейтральный тон дизайнера. */
export function roleToneClass(role: string): string {
  return ROLE_TONE_CLASS[role] ?? ROLE_TONE_CLASS.designer;
}
