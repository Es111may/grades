// «Позвать на самооценку» (меню «⋯» поп-апа 360): лид копирует сообщение со
// ссылкой на портрет дизайнера. Раньше копировали адрес «Команды»
// (/admin/users?person=…) — дизайнера оттуда выкидывало: раздел не его.
//
// Свой портрет у дизайнера — /designer; ?self=1 прокручивает его к навыкам,
// как кнопка «Добавить самооценку». Самооценка живёт в навыках, а они есть
// только у портрета с опубликованной оценкой — без неё параметр молча
// игнорируется (PortraitPending). Через вход параметр доживает сам:
// middleware NextAuth кладёт путь с query в callbackUrl.
// Без node-модулей — для клиента.

import { firstName } from './names';

export const SELF_PARAM = 'self';

/** Путь портрета дизайнера с прокруткой к самооценке. */
export const SELF_ASSESSMENT_PATH = `/designer?${SELF_PARAM}=1`;

/** Значение ?self= → прокрутить ли к самооценке. */
export function isSelfParam(raw: string | string[] | null | undefined): boolean {
  return raw === '1';
}

/** Текст приглашения: «Привет, Маша! Оцени себя, пожалуйста, в Грейдах: <ссылка>». */
export function selfAssessmentInvite(fullName: string, origin: string): string {
  const name = firstName(fullName);
  const link = `${origin.replace(/\/+$/, '')}${SELF_ASSESSMENT_PATH}`;
  return `Привет, ${name}! Оцени себя, пожалуйста, в Грейдах: ${link}`;
}

/**
 * Тот же адрес без ?self= — после прокрутки: перезагрузка и копия адреса
 * не должны снова тянуть страницу к навыкам. href — абсолютный или от корня.
 */
export function withoutSelfParam(href: string): string {
  const url = new URL(href, 'http://local');
  url.searchParams.delete(SELF_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
