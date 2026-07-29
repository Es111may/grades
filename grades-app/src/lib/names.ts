// Работа с именами: сокращения и падежи.
//
// Нужно для селектора команд в «Команде»: Pavel просил подписи вида
// «Все / Мои / Никиты / Саши / Артуша / Полины / Эли» — то есть имя
// владельца команды в родительном падеже.

/** Первое слово из ФИО — имя. «Никита Хахай» → «Никита». */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

// Шипящие и заднеязычные: после них «-а» переходит в «-и», а не в «-ы»
// (Саша → Саши, Маша → Маши), в отличие от Никита → Никиты.
const HUSH_AND_VELAR = 'жшчщгкх';

/**
 * Имя в родительном падеже: «Никита» → «Никиты», «Саша» → «Саши»,
 * «Артуш» → «Артуша», «Полина» → «Полины», «Эля» → «Эли».
 *
 * Покрывает регулярные русские имена — их в команде почти все. Для
 * незнакомой формы возвращаем имя как есть: в подписи фильтра лучше
 * неидеальный падеж, чем искажённое имя.
 */
export function genitiveFirstName(fullName: string): string {
  const name = firstName(fullName);
  if (name.length < 2) return name;

  const last = name[name.length - 1].toLowerCase();
  const stem = name.slice(0, -1);
  const beforeLast = stem[stem.length - 1]?.toLowerCase() ?? '';

  switch (last) {
    case 'а':
      return stem + (HUSH_AND_VELAR.includes(beforeLast) ? 'и' : 'ы');
    case 'я':
      return stem + 'и';
    case 'й':
    case 'ь':
      return stem + 'я';
    // Имена на прочие гласные (Отто, Нико, Мери) не склоняем.
    case 'о':
    case 'е':
    case 'ё':
    case 'и':
    case 'у':
    case 'ю':
    case 'ы':
    case 'э':
      return name;
    default:
      // Согласная на конце — мужское имя: Артуш → Артуша, Денис → Дениса.
      return name + 'а';
  }
}
