/**
 * Шаблон 360-опроса для лидов и стардизов (Phase 22 — PRD §11.14).
 *
 * Респонденты заполняют Google Form, админ выгружает CSV и грузит в систему.
 * Структура опроса — фиксированная константа: 6 категорий с числовыми
 * пунктами (Likert 1–5), 1 шкала eNPS (1–10) и 4 открытых вопроса.
 *
 * Категории взяты из реального отчёта по Артушу Манукяну (декабрь 2025) —
 * формулировки совпадают с теми, что Gemini использует в живой практике.
 *
 * Точные тексты вопросов из CSV — это первичный ключ маппинга. Колонки
 * Google Form именованы человекочитаемо, поэтому сверка идёт по строке.
 *
 * При смене шаблона: поднять SURVEY_VERSION (хранится в LeadReview.surveyVersion),
 * добавить рядом константу LEAD_SURVEY_V2 и развести парсер по версиям.
 */

export const SURVEY_VERSION = 1;

export type ResponderRole = 'designer' | 'manager' | 'lead' | 'frontend' | 'other';

/** Маппинг ответа из колонки «Какая у тебя роль в команде?» на код роли. */
export const ROLE_FROM_CSV: Record<string, ResponderRole> = {
  'Дизайнер': 'designer',
  'Менеджер': 'manager',
  'Лид': 'lead',
  'Лид дизайна': 'lead',
  'Лид фронтенда': 'lead',
  'Фронтенд': 'frontend',
  'Фронтендер': 'frontend',
  'Разработчик': 'frontend',
};

/** Человекочитаемое имя роли (множественное) — для UI группировок. */
export const ROLE_LABEL: Record<ResponderRole, string> = {
  designer: 'Дизайнеры',
  manager: 'Менеджеры',
  lead: 'Лиды',
  frontend: 'Фронтенд',
  other: 'Прочие',
};

/** Человекочитаемое имя роли (единственное) — для подписи к одному ответу. */
export const ROLE_LABEL_ONE: Record<ResponderRole, string> = {
  designer: 'Дизайнер',
  manager: 'Менеджер',
  lead: 'Лид',
  frontend: 'Фронтенд',
  other: 'Другое',
};

export type SurveyItem = {
  id: string;
  /** Точный текст колонки из Google Form CSV (с обрезанными пробелами). */
  question: string;
};

export type SurveyCategory = {
  id: string;
  label: string;
  /** Числовые пункты (Likert 1–5). */
  items: SurveyItem[];
  /** Текстовые открытые ответы внутри категории (например «что помогает / мешает»). */
  openItems: SurveyItem[];
};

export const LEAD_SURVEY_CATEGORIES: SurveyCategory[] = [
  {
    id: 'review_quality',
    label: 'Качество ревью и техническая экспертиза',
    items: [
      {
        id: 'review_high_bar',
        question:
          'Лид помогает держать высокий план по UI (референсы, критика по делу, замечает «очевидки» до клиента)',
      },
      {
        id: 'review_structured',
        question: 'Ревью структурное: чек-лист, критерии, «что/почему/как исправить»',
      },
      {
        id: 'review_returns_minimal',
        question:
          'Возвраты после ревью лида минимальны (редко «после лида прилетает от клиента очевидка»)',
      },
      {
        id: 'review_taste_balance',
        question: 'Лид балансирует вкус/бренд/прибыль, а не уходит в вкусовщину',
      },
      {
        id: 'review_dev_ready',
        question:
          'В макетах заранее учтены разработка/сетка/состояния/паттерны (нет «выяснилось на деве»)',
      },
    ],
    openItems: [
      {
        id: 'review_open_feedback',
        question: 'Что в ревью лида сильнее всего помогает качеству? Что мешает?',
      },
    ],
  },
  {
    id: 'process',
    label: 'Управление процессом и задачами',
    items: [
      {
        id: 'process_estimates',
        question: 'Лид помогает попадать в эстимейты: план, разбиение, риски, защита буфера',
      },
      {
        id: 'process_tails',
        question:
          'Лид контролирует «хвосты» и чётко закрывает итерации (нет вечной доработки одного и того же)',
      },
      {
        id: 'process_checklist',
        question: 'Проверяет: состояния, адаптив, источники, экспорт, описания для фронта',
      },
      {
        id: 'process_pm_front',
        question:
          'Коммуникация с РМ и фронтом прозрачная (вопросы закрываются до релиза)',
      },
    ],
    openItems: [
      { id: 'process_open_feedback', question: 'Где процесс «сыпется» чаще всего? Что бы вы поменяли?' },
    ],
  },
  {
    id: 'growth',
    label: 'Наставничество и развитие команды',
    items: [
      { id: 'growth_goals', question: 'Лид даёт понятные цели роста и регулярную обратную связь' },
      {
        id: 'growth_actionable_feedback',
        question: 'После фидбэка понятно «что сделать по-другому на этой или следующей задаче»',
      },
      {
        id: 'growth_speedup',
        question:
          'Лид помогает ускоряться (шаблоны, приёмы, горячие клавиши, «как сделать быстрее без потери качества»)',
      },
      {
        id: 'growth_role_model',
        question: 'Есть ощущение «у кого учиться»: у лида можно перенять практики и насмотренность',
      },
    ],
    openItems: [
      { id: 'growth_open_feedback', question: 'Чему конкретно вы научились у лида за 3 месяца?' },
    ],
  },
  {
    id: 'product',
    label: 'Продуктовое мышление и защита решений',
    items: [
      {
        id: 'product_goal_clarity',
        question:
          'В задаче лид помогает разобраться в цели экрана/фичи, а не только «сделать красиво»',
      },
      {
        id: 'product_alternatives',
        question: 'Предлагаются идеи и варианты (А/Б), а не «делай как хочешь»',
      },
      {
        id: 'product_defends',
        question: 'Лид умеет отстоять решение перед менеджером/клиентом и объяснить ценность',
      },
    ],
    openItems: [
      {
        id: 'product_open_feedback',
        question: 'Пример, когда лид усилил решение продуктово или функционально',
      },
    ],
  },
  {
    id: 'communication',
    label: 'Коммуникация и софт-скиллы',
    items: [
      {
        id: 'comm_respectful',
        question:
          'В общении уважителен, без пассивной агрессии/сарказма; конфликтные темы проговаривает лично',
      },
      {
        id: 'comm_agreements',
        question: 'Фиксирует договорённости: куда писать, когда ждать ответ/ревью',
      },
      { id: 'comm_availability', question: 'Доступность: отвечает в оговорённые окна, не пропадает' },
      { id: 'comm_support', question: 'Поддерживает команду, снимает лишний стресс' },
    ],
    openItems: [
      { id: 'comm_open_keep', question: 'Что в стиле общения стоит сохранить? Что стоит поменять?' },
      { id: 'comm_open_discomfort', question: 'Пример, когда общение вызывало дискомфорт' },
    ],
  },
  {
    id: 'collaboration',
    label: 'Сотрудничество с разработкой и QA',
    items: [
      {
        id: 'collab_states',
        question: 'На ревью учитываются состояния, ховеры, ошибки, пустые/длинные данные',
      },
      {
        id: 'collab_patterns',
        question:
          'Лид синхронизирует паттерны (модалки, отступы, сетка) — нет разнобоя между экранами',
      },
      {
        id: 'collab_front_qa',
        question:
          'Вопросы фронта/QA закрываются быстро и по делу, не «перекидываются» на дизайнера без контекста',
      },
    ],
    openItems: [{ id: 'collab_open_feedback', question: 'Какие «нестыковки» повторяются?' }],
  },
];

/** Шкала готовности продолжать работу с лидом (1–10). */
export const ENPS_QUESTION: SurveyItem = {
  id: 'enps',
  question: 'Насколько вы хотите продолжить работать с этим лидом?',
};

/** Открытые вопросы вне категорий — общая «обратная связь». */
export const OPEN_QUESTIONS: SurveyItem[] = [
  { id: 'strengths', question: 'Три главные сильные стороны лида' },
  { id: 'growth_areas', question: 'Три самые важные зоны роста с конкретикой' },
  { id: 'first_action', question: 'Если бы вы были на месте лида, что сделали бы первым делом?' },
  {
    id: 'concerns',
    question:
      'Поделись мыслями, которые беспокоят в отношении дизайна в твоей проектной группе (лид, клиенты, проекты, твое развитие и пр.)',
  },
];

/** Колонки служебные — должны быть всегда. */
export const TIMESTAMP_COLUMN = 'Отметка времени';
export const ROLE_COLUMN = 'Какая у тебя роль в команде?';

/** ============ Структура aggregates JSON, который кладём в БД ============= */

export type RoleCounts = Partial<Record<ResponderRole, number>>;

export type ItemAggregate = {
  /** ID пункта (из SurveyItem.id). */
  id: string;
  /** Текст вопроса (для отрисовки без перевязки на код). */
  question: string;
  /** Среднее по всем респондентам (null если ни одного ответа). */
  average: number | null;
  /** Среднее по роли (null если по роли нет ответов). */
  averageByRole: Partial<Record<ResponderRole, number | null>>;
  /** Сколько респондентов ответило (число, не null). */
  answeredCount: number;
};

export type OpenAnswer = {
  role: ResponderRole;
  text: string;
};

export type OpenItemAggregate = {
  id: string;
  question: string;
  answers: OpenAnswer[];
};

export type CategoryAggregate = {
  id: string;
  label: string;
  /** Среднее по всем числовым пунктам категории (null если ни одного ответа). */
  average: number | null;
  averageByRole: Partial<Record<ResponderRole, number | null>>;
  items: ItemAggregate[];
  openItems: OpenItemAggregate[];
};

export type EnpsAggregate = {
  /** Среднее по шкале 1–10. */
  average: number | null;
  averageByRole: Partial<Record<ResponderRole, number | null>>;
  /** Все индивидуальные значения — для гистограммы/разброса. */
  values: number[];
  answeredCount: number;
};

export type LeadReviewAggregates = {
  /** Количество респондентов по ролям. */
  roleCounts: RoleCounts;
  /** Всего респондентов (строк CSV). */
  totalResponses: number;
  categories: CategoryAggregate[];
  enps: EnpsAggregate;
  openQuestions: OpenItemAggregate[];
};
