/**
 * Начальный справочник проектов — Phase 24.
 *
 * Список выдал Pavel 24.05.2026. Заливается в БД один раз
 * (ensureProjectsSeeded в oneTimeMigrations.ts) при первом старте,
 * если таблица projects пустая. Дальше — добавляются и редактируются
 * через UI, seed больше не вмешивается.
 *
 * Категории:
 *   developer    — компании-застройщики
 *   project      — конкретные ЖК / БЦ
 *   ida_product  — продукты Ида (тег зелёный #D5FF0C)
 *   other        — выставки, события, технологии, прочее
 */

export type ProjectCategory = 'developer' | 'project' | 'ida_product' | 'other';

export const PROJECT_CATEGORY_LABELS: Record<ProjectCategory, string> = {
  developer: 'Девелопер',
  project: 'Проект (ЖК/БЦ)',
  ida_product: 'Продукт Иды',
  other: 'Другое',
};

export const PROJECT_CATEGORY_ORDER: ProjectCategory[] = [
  'developer',
  'project',
  'ida_product',
  'other',
];

export const INITIAL_PROJECTS: { name: string; category: ProjectCategory }[] = [
  // Девелопер
  { name: 'Брусника', category: 'developer' },
  { name: 'Самолет', category: 'developer' },
  { name: 'Level', category: 'developer' },
  { name: 'СберСити', category: 'developer' },
  { name: 'Абсолют Недвижимость', category: 'developer' },
  { name: 'Абсолют Премиум', category: 'developer' },
  { name: 'Аквилон', category: 'developer' },
  { name: 'РСТИ', category: 'developer' },
  { name: 'Арбан', category: 'developer' },
  { name: 'Мармакс', category: 'developer' },
  { name: 'Новая', category: 'developer' },
  { name: 'ФСК Москва', category: 'developer' },
  { name: 'ФСК Петербург', category: 'developer' },
  { name: 'ДСК', category: 'developer' },
  { name: 'Первый трест', category: 'developer' },
  { name: 'Унистрой', category: 'developer' },
  { name: 'РГ-Девелопмент', category: 'developer' },
  { name: 'Крост', category: 'developer' },
  { name: 'Гранель', category: 'developer' },
  { name: 'Parametr', category: 'developer' },
  { name: 'Разум', category: 'developer' },
  { name: 'Новая эра', category: 'developer' },
  { name: 'ПСК', category: 'developer' },
  { name: 'ЛСР', category: 'developer' },
  { name: 'BI Group', category: 'developer' },
  { name: 'LeePrime', category: 'developer' },
  { name: 'Галс', category: 'developer' },
  { name: 'Стройтек', category: 'developer' },
  { name: 'Global Vision', category: 'developer' },
  { name: 'Sezar Group', category: 'developer' },
  { name: 'SFERA Group', category: 'developer' },
  { name: 'St.Michael', category: 'developer' },
  { name: '3S Group', category: 'developer' },
  { name: '4D', category: 'developer' },
  { name: 'Практика', category: 'developer' },
  { name: 'СК10', category: 'developer' },
  { name: 'ВКБ', category: 'developer' },
  { name: 'Dogma', category: 'developer' },
  { name: 'СКАТ', category: 'developer' },
  { name: 'Каскад Недвижимость', category: 'developer' },
  { name: 'РОСТ', category: 'developer' },
  { name: 'Полис', category: 'developer' },
  { name: 'Pioneer', category: 'developer' },
  { name: 'PROGRESS', category: 'developer' },
  { name: 'Dominanta', category: 'developer' },
  { name: 'Навигатор', category: 'developer' },
  { name: 'Энергожилстрой', category: 'developer' },
  { name: 'Железно', category: 'developer' },
  { name: 'Родина', category: 'developer' },
  { name: 'Федерация', category: 'developer' },
  { name: 'Расцветай', category: 'developer' },
  { name: 'Unikey', category: 'developer' },
  { name: 'Capital Group', category: 'developer' },
  { name: 'А101', category: 'developer' },
  { name: 'GloraX', category: 'developer' },
  { name: 'ND Group', category: 'developer' },

  // Проект (ЖК/БЦ)
  { name: 'Городской бор', category: 'project' },
  { name: 'ЮТУ', category: 'project' },
  { name: 'Сансара', category: 'project' },
  { name: 'Массандра Парк', category: 'project' },
  { name: 'MAX', category: 'project' },
  { name: 'Река', category: 'project' },
  { name: 'Balance', category: 'project' },
  { name: 'Береговой', category: 'project' },
  { name: 'Lunar', category: 'project' },
  { name: 'Файв Тауэрс', category: 'project' },
  { name: 'АЛИА', category: 'project' },
  { name: 'Новые Ватутинки', category: 'project' },
  { name: 'Сретенка 13/26', category: 'project' },
  { name: 'Onest 1905', category: 'project' },
  { name: 'PRIDE', category: 'project' },
  { name: 'OPUS', category: 'project' },
  { name: 'Новая Щербинка', category: 'project' },
  { name: 'Премьер-парк', category: 'project' },
  { name: 'Уфа-Сити', category: 'project' },
  { name: 'Широта 54', category: 'project' },

  // Продукт Иды
  { name: 'Ида.Лайт', category: 'ida_product' },
  { name: 'Ида.Бид', category: 'ida_product' },
  { name: 'Ида.Бук', category: 'ida_product' },
  { name: 'Ида.Чат', category: 'ida_product' },
  { name: 'Ида.Брок', category: 'ida_product' },
  { name: 'Ида.Бейз', category: 'ida_product' },
  { name: 'Ида.Блоки', category: 'ida_product' },
  { name: 'Ида.Тимс', category: 'ida_product' },
  { name: 'Рисовалка', category: 'ida_product' },
  { name: 'Ида.Сайт', category: 'ida_product' },
  { name: 'Коммуникации', category: 'ida_product' },

  // Другое
  { name: 'Движение', category: 'other' },
  { name: 'Intermark', category: 'other' },
  { name: 'Города', category: 'other' },
  { name: 'DEED', category: 'other' },
  { name: 'Landy', category: 'other' },
];
