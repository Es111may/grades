# Handoff для следующего чата

> Краткая шпаргалка по проекту «Грейды». Прочитай первым делом — сохранит время на ориентацию.

## Что это за проект

Веб-приложение для грейдирования дизайнеров в IDA Project. Заменяет Excel-шаблон. ~25 человек: ~5 лидов/админов, ~20 дизайнеров.

- **Repo:** `git@github.com:Es111may/grades.git` (main = prod)
- **Деплой:** Railway, авто-деплой при push в main
- **URL:** уточни у Pavel
- **Стек:** Next.js 14 App Router + TypeScript + Tailwind + Prisma 5 + Postgres + NextAuth

## С кем работаешь

**Pavel G.** — design director в IDA, **не разработчик**. Любит конкретику, не любит лишнюю воду. Пиши на русском (как и весь проект). Не используй эмодзи если не попросит.

## Текущее состояние

См. `02_PRD.md` § 10 — статус по фазам. Кратко:

**Сделано (Phase 0–9)**: каркас, импорт Excel, auth (email+password — Keycloak отвергнут), форма оценки, портрет дизайнера, админ-матрица + грейды + гейты, канбан пользователей, роль stardiz, расширенные права лида, **9-Box матрица потенциала** (вкладка в `/admin/users`, drag-n-drop через `@dnd-kit/core`, модель `TeamMatrixCell`, аккордеон с описанием системы).

**Полировка UI завершена** — все страницы на единых токенах + примитивах (`.btn-*`, `.input`, `.card`, `.chip-*`, `.segmented`). Apple-стиль.

**Бренд** — основной зелёный `#d5ff0c`, точка билда «Создатель» — `#00ca48`.

**Производительность** — кешированы миграции в памяти, `cache()` для сессии, loading-скелетоны на ключевых страницах, DISTINCT ON для последних оценок.

## Что идёт следующим (Phase 10+)

См. `02_PRD.md` § 11. По приоритету:

1. **Phase 10** — Канбан как основной просмотр + popup карточки 360° с 4 действиями. Удалить старый `/lead` («Мои дизайнеры»), интегрировать в `/admin/users` с фильтром «Все/Мои»
2. **Phase 11** — Лидерборд по уровням (заменит вкладку «Таблица»)
3. **Phase 12** — Визуальная доводка формы оценки
4. **Phase 13** — Разделение `Skill.description` и `Skill.confirmationGuide`
5. **Phase 14** — Самооценка дизайнера + загрузка подтверждений (SkillEvidence + SelfAssessment)
6. **Phase 15** — График скорости роста в popup карточки

Дальше: Phase 16 (perf-данные), 17 (ИПР), 18 (карточка-Buildin/Кроксы), 19 (audit-log), 20 (UI Ида.Продукты), Тимс.

## Ключевые файлы

```
02_PRD.md                          — главный док. Полный контекст.
HANDOFF.md                         — этот файл.

grades-app/                        — приложение
  prisma/schema.prisma             — модель данных
  src/lib/
    auth.ts                        — NextAuth, password + dev провайдеры
    session.ts                     — getCurrentUser + requireRole (cached)
    permissions.ts                 — canViewAdmin / canEditMatrix / canGradeDesigner
    grade.ts                       — чистая логика расчёта грейда
    portrait.ts                    — лоадер данных портрета
    types.ts                       — UserRole / GradeCode / BuildCode
    cycle.ts                       — currentCycle helpers
    db.ts                          — Prisma singleton
    oneTimeMigrations.ts           — кешированные миграции в памяти
  src/components/
    AppHeader.tsx, HeaderNav.tsx, UserMenu.tsx
    PageSkeleton.tsx               — скелетоны
  src/app/
    globals.css                    — primitives (.btn-*, .input, .card, .chip-*, .segmented)
    layout.tsx                     — корневой
    page.tsx                       — redirect на dashboard
    auth/signin/                   — login (email+password + dev section)
    admin/users/                   — пользователи: таблица + 3 канбан-вида
      KanbanView.tsx, UserModal.tsx, UsersClient.tsx, page.tsx
    admin/matrix/                  — матрица скиллов
      MatrixClient.tsx, NewSkillModal.tsx, MasteryEditorModal.tsx, page.tsx
    admin/grades/                  — пороги XP + гейты
      GradesClient.tsx, SkillCombobox.tsx, page.tsx
    lead/                          — «Мои дизайнеры» (удалится в Phase 10)
      page.tsx, layout.tsx
      assess/                      — форма оценки
      portrait/                    — просмотр чужого портрета
      assessments/                 — все опубликованные
    designer/                      — свой портрет
      page.tsx, Portrait.tsx, history/

  tailwind.config.ts               — токены: lime #d5ff0c, emerald, blaze, sunset, sky
  package.json                     — version 0.8.x
  scripts/start.ts                 — entry для Railway: prisma push + import + seed + migrate
```

## Договорённости по стилю кода

- **Всё через primitives.** Не пиши `bg-white border border-cloud rounded-card shadow-soft` — пиши `card`. Не пиши `bg-lime border ...` — пиши `btn-accent`. Если нужна кастомизация — оборачивай примитив, а не плодя нового.
- **Шрифты:** `font-display` только для крупных заголовков (h1, h2, KPI-цифры). Обычный текст — body font (Inter).
- **Tabular-nums** на всех числах в таблицах и статистике.
- **Системные акценты** (emerald/sunset/blaze/sky) — для семантики (success/warn/danger/focus). Не путать с брендовым lime.
- **Loading-скелетоны** для всех новых страниц с тяжёлой загрузкой.

## Коммиты и git

- **Default branch: main**, прямой push разрешён.
- **Bcrypt-пароль аккаунта:** Pavel G. (`pg@idaproject.com`) — генерится в админке, в репо не хранится.
- Используй формат коммитов: `тип(scope): описание` + блок «что и почему» в body.
- Подписывай Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>

## Деплой

- Любой push в main → Railway пересобирает. Проверка свежести по `package.json` version.
- **scripts/start.ts** запускается до Next.js: prisma db push, import-excel (skip если matrix используется), seed (idempotent upsert), migrate-grades (skip если уже мигрировано).
- Если деплой завис — `git commit --allow-empty -m "trigger redeploy"` или bump version.

## Известные подводные камни

1. **Render-cache миграций.** При перезапуске контейнера флаги в `oneTimeMigrations.ts` сбрасываются — миграции отрабатывают повторно (идемпотентно). Это нормально.
2. **Cycle-поле в Assessment.** Хранится в БД (YYYY-MM), но в UI не показывается — оценки ad-hoc.
3. **Stardiz** не имеет своего портрета: `/designer/*` для них закрыт. Они только грейдируют подопечных.
4. **`/admin/audit`** не существует — ссылка убрана. Будет в Phase 19.
5. **Грейды:** `intern` удалён, `premiddle` добавлен. Пороги: `0/75/105/135/180/230`.

## Стартовый промпт для следующего чата

```
Привет. Прочитай HANDOFF.md и 02_PRD.md в /Users/pavelg./Documents/Claude/Projects/Грейды/, потом приступим к Phase 9 (или к чему скажу).
```
