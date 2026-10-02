// Ссылка на поп-ап 360 на «Команде»: /admin/users?person=<id>. Поп-ап
// открывается и закрывается без перехода — меняем адрес через
// history.replaceState (Next подхватывает его в useSearchParams, сервер не
// перерисовывает страницу). По этому же параметру комментарии к интерфейсу
// понимают, в чьём поп-апе оставлено замечание (lib/uiCommentsShared).
// Без node-модулей — для клиента.

export const PERSON_PARAM = 'person';

/** id — целое > 0, без ведущих нулей: «007», «5.0», «-1» — не id. */
export const PERSON_ID_RE = /^[1-9]\d{0,9}$/;

/** Значение ?person= → id человека или null. */
export function parsePersonParam(raw: string | null | undefined): number | null {
  if (!raw || !PERSON_ID_RE.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

/**
 * Тот же адрес (путь, остальные параметры и hash) с ?person=<id> или без
 * него (id = null). href — абсолютный или от корня.
 */
export function withPersonParam(href: string, id: number | null): string {
  const url = new URL(href, 'http://local');
  if (id == null) url.searchParams.delete(PERSON_PARAM);
  else url.searchParams.set(PERSON_PARAM, String(id));
  return `${url.pathname}${url.search}${url.hash}`;
}
