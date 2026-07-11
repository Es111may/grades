# Handoff для следующего чата

> Краткая шпаргалка по проекту «Грейды». Прочитай первым делом — сохранит время на ориентацию.

## ⚠️ САМОЕ АКТУАЛЬНОЕ (11.07.2026, версия 0.53.x)

Ниже по файлу состояние на май — оно устарело, но полезно для истории.
Свежее:

- **Редизайн по концептам ЗАВЕРШЁН** (0.35 → 0.53): «Команда» (bento
  NIPC/в срок/рост/сезон с фикс-высотой и целями 20/35/50, подиум топ-3,
  карта потенциала, «Требует внимания», скоуп-агрегаты «Мои»), портреты
  дизайнера и лида/стардиза (hero по центру, glass-чипы/кнопки, дата
  публикации чипом), Dynamic Island-хедер (бургер-меню из центра капсулы,
  аватар-меню по ховеру с грейс-периодом), капсулы-уведомления, экран
  входа. Хитмап навыков и фазы 28-30 — ОТМЕНЕНЫ Pavel'ом 11.07.
- **Шейдерная аврора** за заголовками страниц: `TitleAurora.tsx` — WebGL,
  4 капли-градиента (лайм/изумруд/небо; светлая тема — мята вместо неба),
  канвас 1920×964, пауза вне вьюпорта, reduced-motion → статичный кадр.
- **Логотип**: `BrandLogo.tsx` — фирменный SVG (`public/logo-gr.svg`)
  с currentColor + видео лаймовой 3D-спирали в круге
  (`public/logo-spiral.mp4`, 35KB). PNG-логотипы удалены.
- **Темы**: тёмная дефолт + Onest; светлая — фон-градиент white→#F3F3F3
  (первые 720px), подложки #F3F3F3. Тумблер в шапке (`ThemeToggle`).
- **Закрыты фазы**: 25 — динамика NIPC (`nipc_snapshots`, дельта «за
  цикл» от 16.04/16.10; снапшот НЕ пишется стардизом — у него обрезанная
  выборка); 26 — аудит (иконки типов событий + группировка по дням);
  27 — `EmptyState` на пустых экранах (лидерборд/оценки/аудит/скиллы).
- **Единые компоненты**: `SearchInput` (пилюля, 13px как сегменты, иконка
  `.search-icon` — #fff в тёмной/#000 в светлой), `EmptyState`,
  `.select-pill`, `.title-halo`, подиум-чипы h-6/10px.
- **Откат по визуалу**: тег `v0.53.2-redesign-done` (стабильный итог).
  Старые: `v0.34.1-pre-concept-redesign`, `v0.24.1-pre-portrait-redesign`.
- **Railway**: прод — проект `selfless-inspiration` (IDA), домен
  `grades-production-1547.up.railway.app`. Дубль `zealous-patience`
  (`...-d9b2`, отдельная БД!) удалён 29.06. Диагностика:
  `/api/admin/diag-leaderboard` (admin). CLI: `railway deployment list
  --service grades`; лог упавшего билда: `railway logs --service grades
  --build <id>`. ВАЖНО: билды падают молча — после push ПРОВЕРЯЙ статус
  (ловили FAILED из-за `*/` внутри JSDoc и дубля иконки).
- **«В срок»**: расследование «у всех 100%» закрыто 11.07 — данные CH
  честные (разброс 52–100), виновата старая сборка + малые выборки.

## Что это за проект

Веб-приложение для грейдирования дизайнеров в IDA Project. Заменяет Excel-шаблон. ~25 человек: 3 лида + 2 стардиза + 20 дизайнеров + 1 админ (Pavel).

- **Repo:** `git@github.com:Es111may/grades.git` (main = prod)
- **Деплой:** Railway, авто-деплой при push в main
- **Стек:** Next.js 14 App Router + TypeScript + Tailwind + Prisma 5 + Postgres + NextAuth

## С кем работаешь

**Pavel G.** — design director в IDA, **не разработчик**, локально код не запускает (нет npm/node в PATH). Любит конкретику, не любит лишнюю воду. Пиши на русском. Не используй эмодзи если не попросит. На push в main даёт право без подтверждения (написано прямо: «прямой push разрешён»).

## Текущее состояние (на 11.05.2026)

**Закрыто (Phase 0–12, 22.1):**
- 0–8: каркас, импорт Excel, auth (email+password — Keycloak отвергнут), форма оценки, портрет, админ-матрица, грейды, гейты, канбан, stardiz, расширенные права лида.
- **9** — 9-Box матрица потенциала (`@dnd-kit/core`, `TeamMatrixCell`, аккордеон с описанием).
- **10** — Канбан как основной просмотр + popup-карточка 360° с 4 действиями. `/lead/page.tsx` стал редиректом на `/admin/users`. Stardiz получил доступ к `/admin/users` (видит только своих). Фильтр «Все/Мои» для admin/lead.
- **11** — Лидерборд по уровням. Заменил «Таблицу» в segmented control. Колонки: Имя/Билд/Грейд/XP+прогресс-бар/UI/UX/PRD/IND/RES/Стаж/Активен. Сортировка по клику.
- **12** — Визуальная доводка формы оценки. Radio-список уровней с criteria всегда видимыми (по макету Pavel'a, SVG).
- **22.1** — 360-оценка лидов и стардизов: модель `LeadReview` + парсер CSV из Google Form + страницы `/admin/lead-reviews{,/[id],/new}`. Шаблон опроса v1 (6 категорий, eNPS, 4 открытых) — `src/lib/leadSurvey.ts`. Респонденты анонимны: показываем только роль (Дизайнер/Менеджер/...). Лид/стардиз получили вкладку «Мой портрет» в шапке. ИИ-сводка и CDO-блок — простые markdown-textarea, Pavel заполняет вручную.

**Параллельно закрытое (поверх Phase 10–12):**
- Bulk-импорт 25 реальных дизайнеров из `data/team.csv` (потом отключён — пересоздавал удалённых).
- Аватары в БД (data URL JPEG 256×256, sharp на сервере для импорта из `data/user-avatar/*.png`).
- Hard-delete с переносом для лида/стардиза (`reassignTo`), cascade для designer.
- Чёрный список emails `ExcludedEmail` — чтобы удалённых не возвращали ни seed, ни import-team.
- Сезонный ремайндер «До 15 апреля/октября назначь даты грейдирования» (component `AssessmentReminder`).
- Единые `chip-*` примитивы, кириллица отделов (Инхаус/Криэйт/Импрув), иконки из `components/icons.tsx` (Edit/Plus/Calendar/Close/ChevronDown).
- Аватар в UserMenu/AppHeader (тянется из БД при каждом SSR-рендере, актуальные имя+avatar даже после правок в админке).
- Стиль `font-display` убран из мест где не нужен.

**Версия в `package.json`:** 0.24.0 (Phase 19 — расширенный аудит-лог: страница + покрытие ключевых мутаций).

**Phase 19 закрыто (0.24.0):**
- `src/lib/audit.ts` — единый хелпер `writeAudit({actor, action, target, before?, after?, reason?, extra?})`. Падение записи не валит основной запрос. Словари `AUDIT_ACTIONS`, `AUDIT_ACTION_LABEL`, `AUDIT_TARGET_TYPE_LABEL` для UI.
- Покрытие логированием в API: смена пароля, публикация/удаление/reopen оценки, импорт/правка/удаление 360-опроса, создание/правка/удаление чек-листа ИПР, создание проекта. Существующее логирование `grade_floor_*` оставлено как было.
- `/admin/audit` (`page.tsx` + `AuditView.tsx`) — таблица с фильтрами (actor / action / targetType / диапазон дат), пагинация 50/стр + «Загрузить ещё», раскрытие details (JSON before/after).
- `/api/audit` — endpoint для фильтрации и пагинации, со scope: admin видит всё, lead — свои действия + события про подопечных, остальные — Forbidden.
- HeaderNav: пункт «Аудит» для admin и lead.
- Не покрыто этим кругом: мутации матрицы (skills/weights/mastery/gates/grade-levels), team-matrix (9-Box), правки общих полей юзера в `/api/users/[id]` PATCH (кроме gradeFloor — это уже логировалось).



**Phase 17 закрыто (0.23.0):**
- Две Prisma-модели: `Checklist` (owner + createdBy + createdByRole snapshot) и `ChecklistItem` (text + checked + sortOrder).
- `src/lib/checklistPermissions.ts` — pure-логика прав. Иерархия `admin > lead > stardiz > designer`. Создание по матрице (admin → всем, lead → designer+stardiz+себе, stardiz → designer+себе, designer → только себе). Структурное редактирование = автор + любая роль строго старше `createdByRole`. Отметка `checked` = все, кто видит портрет (включая владельца, иначе ИПР бесполезен).
- API: `GET/POST /api/users/[id]/checklists`, `PATCH/DELETE /api/checklists/[id]` (целиком title + items атомарно), `PATCH /api/checklist-items/[id]` (только `checked` — отдельный endpoint, чтобы дизайнер мог отмечать выполнение, но не менять текст).
- UI: `src/components/checklists/{ChecklistsSection,ChecklistCard}.tsx`. Карточки в стиле Telegram-чек-листа: title inline-edit, badge кто создал, чекбоксы с мгновенным `PATCH`, inline «+ добавить пункт», двухступенчатая кнопка «Удалить».
- Интеграция: секция «ИПР» с якорем `#ipr` в SectionNav. На портрете дизайнера/стардиза — после блока «Выводы» (мнение лида/стардиза). На портрете лида (`LeadReviewView`) — после «Блока CDO».
- Чек-листы, созданные владельцем сами себе, прозрачны для старших ролей (Pavel подтвердил).



**Phase 16 закрыто (0.22.0):**
- Композитный score `0.6·(xp/maxXp) + 0.4·(onTime/100)` в `src/lib/perfScore.ts`. Для creator (Инхаус) / без данных / выборки < 5 задач — берётся только xpNorm. Дефолтная сортировка лидерборда теперь по composite.
- Чип «В срок (6 мес)» в hero-карточке портрета (3-я колонка `grid-cols-[auto_1fr_auto]`). Цвет: ≥85% emerald · 70–84% amber · <70% blaze. Для creator и лидов — не рендерится.
- Колонка «В срок» в лидерборде между XP и UI; ячейка `OnTimeCell` с цветовой подсветкой. Сортируется отдельно или участвует в дефолтной composite-сортировке. Подпись над таблицей объясняет формулу.
- Batched ClickHouse-запрос для всей команды (`src/lib/clickhousePerfBatch.ts`): один SQL с `WHERE email IN (...)` и `subtractMonths(today(), 6)` окном. Фильтры зашиты (эстимейт + завершённые + ≥50% + оба источника).
- In-memory cache TTL 15 мин (`src/lib/perfCache.ts`). После рестарта Railway первый заход — 5–8 сек, дальше моментально.
- `/api/performance/leaderboard` — endpoint на будущее; server-side рендер админ-страницы тянет данные напрямую через `fetchOnTimeStatsByEmail`.
- `showPerformance` на портрете определяется ролью target user: только `designer` и `stardiz` (стардизы работают руками), для `lead`/`admin` блок и чип не рисуются.

**Phase 16 MVP закрыто (0.21.0):**
- ClickHouse-коннектор на TypeScript через официальный `@clickhouse/client` (`src/lib/clickhousePerf.ts`) — порт Python-сервиса `ida.team/backend/analytics/services/time_manage.py` под направление `design`.
- API `/api/performance/tasks?userId=...` с проверкой прав (admin / self / lead / stardiz), `src/app/api/performance/tasks/route.ts`.
- React-порт `ProfilePerformanceDashboard.vue` (`src/components/performance/{PerformanceDashboard,PerformanceSummaryTable,PerformanceCharts,PerformanceTasksTable}.tsx`).
- Чистая агрегация по периодам в `src/lib/performanceAggregation.ts` (порт `useTimeManageAggregation.ts`).
- Дашборд встроен в `Portrait.tsx` после блока «Проекты», добавлен якорь `#performance` в SectionNav.
- Композитная формула `α·XP + β·Perf − γ·Cost` пока не реализована — это была Phase 16 в полном виде, MVP закрывает только визуализацию перформанса.

Креды ClickHouse — `CLICKHOUSE_HOST=158.160.85.201`, `CLICKHOUSE_PORT=8123`, `CLICKHOUSE_USER=designgrades`. Дефолты захардкожены в `clickhousePerf.ts`/`clickhouse.ts`, но на Railway лучше выставить через Variables.

## Что в очереди (Phase 13+)

См. `02_PRD.md` § 11. По приоритету:

1. ~~Phase 13~~ — ОТМЕНЕНА Pavel'ом 11.07.2026.
2. **Phase 14** — Самооценка дизайнера + подтверждения-ссылки. **В РАБОТЕ с 11.07.2026**, план согласован: `design-concepts/phase-14-self-assessment.md` (только ссылки, окно всегда открыто, видимость у всех сторон; самооценка НЕ влияет на расчёт XP).
3. **Phase 15** — Sparkline-график скорости роста в popup карточки.
4. **Phase 16** — Подгрузка перформанса **и стоимости** дизайнера в оценку + композитная формула лидерборда `score = α·XP + β·Perf − γ·Cost`. Решения зафиксированы (см. PRD §11.8).
5. **Phase 17** — ИПР.
6. ~~Phase 18~~ — ОТМЕНЕНА Pavel'ом 11.07.2026.
7. **Phase 19** — Расширенный audit-log.
8. ~~Phase 20~~ — ОТМЕНЕНА Pavel'ом 11.07.2026.
9. **Phase 21** — Метрическая система оценки команды (концепт, 4 категории — Эффективность/Траст/Dream Team/Качество результата).
10. **Phase 22** — 360-оценка лидов и стардизов. **22.1 закрыта** (модель + импорт CSV + портрет). Дальше:
    - 22.2 — sparkline-прогрессия между циклами на странице портрета лида
    - 22.3 — автоматическая ИИ-генерация сводки (сейчас Pavel вставляет руками)
    - 22.4 — структурированный CDO/KPI-блок (сейчас просто markdown)
    - 22.5 — PDF-экспорт + reminder для лидов на испытательном (каждые 3 мес)

## Ключевые файлы

```
02_PRD.md                          — главный док. Полный контекст.
HANDOFF.md                         — этот файл.

grades-app/
  prisma/schema.prisma             — модель данных (см. ExcludedEmail, TeamMatrixCell)
  data/team.csv                    — реальная команда (импортирована, скрипт отключён)
  data/user-avatar/*.png           — фотки команды (распакованы из zip)
  scripts/
    start.ts                       — entry для Railway (db push + import + seed + cleanup + migrate)
    import-team.ts                 — отключён из start.ts, можно запускать вручную
    cleanup-team.ts                — удаляет inactive, переименовывает Inhouse→Инхаус, проставляет отдел по билду
    import-excel.ts, migrate-grades.ts
  src/lib/
    auth.ts                        — NextAuth, password + dev провайдеры
    session.ts                     — getCurrentUser (cached), requireRole, getDashboardForRole → /admin/users
    permissions.ts                 — canAccessUsers (admin/lead/stardiz), canManageUsers (admin/lead), canEditMatrix, canGradeDesigner
    grade.ts, portrait.ts, types.ts, cycle.ts, db.ts, oneTimeMigrations.ts
  src/components/
    AppHeader.tsx (async, тянет user из БД)
    UserMenu.tsx, HeaderNav.tsx
    Avatar.tsx                     — img или fallback на инициалы
    AssessmentReminder.tsx         — сезонная плашка
    icons.tsx                      — Edit / Plus / Calendar / Close / ChevronDown
    PageSkeleton.tsx
  src/lib/
    leadSurvey.ts                  — Phase 22: шаблон 360-опроса v1 (категории, маппинг колонок CSV → вопросы) + типы агрегатов
    parseLeadReviewCsv.ts          — Phase 22: парсер CSV-выгрузки Google Form, считает средние по пунктам/категориям/ролям
  src/app/
    globals.css                    — primitives (.btn-*, .input, .card, .chip-build, .chip-neutral/accent/warn/danger/info, .segmented)
    admin/lead-reviews/            — Phase 22.1
      page.tsx                     — точка входа: ?userId=X → редирект на свежую LeadReview или empty state
      [id]/page.tsx, LeadReviewView.tsx — портрет лида с переключателем циклов, eNPS, категории, открытые ответы, AI-сводка, CDO
      new/page.tsx, NewLeadReviewForm.tsx — форма загрузки CSV (admin only)
    layout.tsx, page.tsx (redirect)
    auth/signin/
    admin/layout.tsx               — пропускает admin/lead/stardiz, matrix/grades делают доп-guard
    admin/users/                   — основной экран
      UsersClient.tsx              — корневой client, scope-фильтр, segmented view, modals
      LeaderboardView.tsx          — таблица-лидерборд (Phase 11)
      KanbanView.tsx               — 3 канбан-вида
      MatrixView.tsx               — 9-Box с DnD (Phase 9)
      UserModal.tsx                — большая форма редактирования + удаление навсегда с reassign
      UserCard360.tsx              — popup карточки
      page.tsx                     — server query (users, builds, latestGrades, gradeThresholds)
    admin/matrix/                  — матрица скиллов
    admin/grades/                  — пороги XP + гейты
    lead/                          — page.tsx = redirect, assess/portrait/assessments остались
      assess/AssessmentForm.tsx    — radio-список уровней по макету Pavel'a
    designer/
      Portrait.tsx                 — портрет (стиль radio-list, чипы в header, цветные progress-bars по таксономии)

  tailwind.config.ts               — токены: lime #d5ff0c, ash #a1a1a6 (поднят для контраста), emerald, blaze, sunset, sky
  package.json                     — версия в шапке = индикатор свежести деплоя
```

## Договорённости по стилю кода

- **Через primitives.** Не плодить `bg-white border border-cloud rounded-card` — пиши `card`. Не плодить `bg-lime border ...` — пиши `btn-accent`. Кастомизация — через override классов, не через новый набор.
- **`font-display`** только для больших заголовков (h1, h2, KPI). Обычный текст — body.
- **Tabular-nums** на всех числах в таблицах.
- **Системные акценты** (emerald/sunset/blaze/sky) — для семантики (success/warn/danger/focus). Брендовый — lime.
- **Без uppercase tracking-widest** — Pavel однажды попросил убрать глобально (старая привычка из ранних фаз).
- **`.chip-build` мельче `.chip-neutral`** (10px vs 11px) — билд второстепенен в плотных списках. Но на странице оценки и портрете билд вёрстан inline-чипом `.chip-neutral` с точкой внутри — там размеры равны.
- **Иконки** — только из `components/icons.tsx`, не плодить inline-SVG.

## Коммиты и git

- **Default branch: main**, прямой push разрешён. Используем worktree-флоу.
- Формат коммитов: `тип(scope): описание` + тело с «что и почему».
- Подписывай: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- Bump `package.json` version при заметных изменениях — это индикатор свежести деплоя.

## Деплой

- Любой push в main → Railway пересобирает. Pavel смотрит версию в шапке, чтобы понять прокатилось ли.
- `scripts/start.ts` запускается до Next.js: `prisma db push` + `import-excel` + `seed` (idempotent + уважает ExcludedEmail) + `cleanup-team` + `migrate-grades`.
- `import-team.ts` **отключён** из start.ts. Запускать вручную если нужно (хоть и не нужно после первичного импорта).
- Если деплой завис — `git commit --allow-empty -m "trigger redeploy"` или bump version.
- Sharp как dep работает на Railway Linux x64 из коробки (prebuilt binaries).

## Подводные камни

1. **Render-cache миграций.** При перезапуске контейнера флаги в `oneTimeMigrations.ts` сбрасываются — миграции отрабатывают повторно (идемпотентно). ОК.
2. **JWT-сессия NextAuth** хранит fullName/role на 8 часов. AppHeader тянет fresh данные из БД на каждом SSR-рендере (чтоб правки админа сразу появлялись).
3. **Stardiz** не имеет своего портрета (нет в `/designer/*`). У него только доступ к `/admin/users` (только свои подопечные) и к форме оценки.
4. **/admin/matrix и /admin/grades** требуют `canEditMatrix(role)` — admin/lead. Stardiz туда не пройдёт.
5. **Грейды:** `intern` удалён, `premiddle` добавлен. Пороги XP: `0/75/105/135/180/230` (могут отличаться по билду).
6. **ExcludedEmail** — единственный механизм блокировки воссоздания удалённых через seed/import-team. И seed, и import-team уважают этот список.

## Стартовый промпт для нового чата

```
Привет. Прочитай /Users/pavelg./Documents/Claude/Projects/Грейды/HANDOFF.md
и 02_PRD.md, потом приступим к следующей задаче.
```

После этого можешь сказать «делаем Phase 13» / «у меня правка по UI портрета» / etc — новый Claude поднимет контекст за пару секунд.
