# Контекст для Claude Code — продолжение работы

> **Этот файл — обязательный к прочтению в начале сессии.** Он содержит полный
> срез того, что было сделано в Cowork, какие приняты архитектурные решения,
> и что нужно делать дальше.

---

## 1. Кто пользователь

**Pavel** — дизайн-директор IDA Project (недвижимость / стройка).
**НЕ разработчик.** Не знает npm, Docker, terminal. Знает Figma, понимает PRD,
владеет Railway на уровне «деплоить свои проекты».

Стиль общения, который он предпочитает (из user_preferences):
- Рациональный стратег с прагматичным цинизмом
- Без наивного оптимизма — обязательно реалити-чек, риски, человеческий фактор
- Конкретные шаги, не общие фразы
- Несколько вариантов с плюсами/минусами + рекомендация
- Структурированно (списки, заголовки), без воды
- Не извиняться излишне, не «прыгать в кодинг» с предположением что он сам разберётся

---

## 2. Цель проекта

Веб-сервис для **автоматического грейдирования дизайнеров**: 51 навык × 3 билда
(Создатель / Визионер / Навигатор) × 6 грейдов (Intern → Senior).

Заменяет существующий Excel-шаблон («Шаблон Скиллсет 2.0.xlsx»), в котором
лиду вручную надо считать XP, проверять гейты, рисовать диаграммы.

**Размер:** 20-50 дизайнеров, 3-7 лидов, 1-2 админа.

**Цикл оценки:** 2 раза в год (апрель и октябрь).

---

## 3. Стек

| Слой | Технология |
|------|-----------|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind |
| Backend | Next.js API routes + Server Components |
| БД | PostgreSQL + Prisma 5 |
| Auth | NextAuth (dev: Credentials no-pass / prod: Keycloak OIDC) |
| Charts | Chart.js (radar) |
| Test | Vitest |
| Dev DB | Docker compose (Postgres 16) |
| Excel | xlsx-parser в Node-скрипте |

**Дизайн-язык:** Base44 (см. `Design Documentation.md`) — Canvas Pearl
#faf9f7 ground, Lime Spritz #ade900 accent, pill buttons 999px, card radius
8-14px, Manrope display + Inter body.

---

## 4. Структура файлов

```
~/Documents/Claude/Projects/Грейды/
├── 00_Контекст_для_Claude_Code.md      ← ЭТОТ ФАЙЛ
├── 01_План_работы.md                    общий план фаз
├── 02_PRD.md                            техзадание v0.3 (13 решений зафиксированы)
├── 03_Мокапы.html                       UI-прототип, 5 view + 2 модалки
├── Design Documentation.md              Base44 дизайн-токены
├── Frontend-design.md                   принципы фронтенд-дизайна
├── Шаблон Скиллсет 2.0.xlsx             исходная матрица 51 навык
└── grades-app/                          ПРИЛОЖЕНИЕ
    ├── README.md                        инструкция запуска
    ├── package.json                     deps + scripts
    ├── docker-compose.yml               local Postgres
    ├── tailwind.config.ts               Base44 tokens
    ├── tsconfig.json
    ├── vitest.config.ts
    ├── .env.example                     шаблон env-переменных
    ├── .gitignore
    ├── next.config.js
    ├── postcss.config.js
    ├── prisma/
    │   ├── schema.prisma                ⭐ 15 моделей БД
    │   └── seed.ts                      тестовые юзеры
    ├── scripts/
    │   └── import-excel.ts              ⭐ импорт матрицы из xlsx
    └── src/
        ├── middleware.ts                edge-гейт для ролевых маршрутов
        ├── types/
        │   └── next-auth.d.ts           type augmentation сессии
        ├── lib/
        │   ├── auth.ts                  NextAuth config
        │   ├── session.ts               getCurrentUser, requireRole
        │   ├── db.ts                    Prisma singleton
        │   ├── grade.ts                 ⭐ чистая логика расчёта
        │   ├── types.ts                 BuildCode, GradeCode etc
        │   └── __tests__/
        │       └── grade.test.ts        15 тестов
        ├── components/
        │   ├── AppHeader.tsx
        │   ├── UserMenu.tsx
        │   └── SessionProvider.tsx
        └── app/
            ├── page.tsx                 редирект по роли
            ├── layout.tsx
            ├── globals.css
            ├── api/auth/[...nextauth]/route.ts
            ├── auth/
            │   ├── signin/{page,SignInForm}.tsx
            │   └── error/page.tsx
            ├── admin/{layout,page}.tsx
            ├── lead/{layout,page}.tsx
            └── designer/{layout,page}.tsx
```

---

## 5. Что сделано (Phase 0 + Phase 1)

### Phase 0 — Дизайн данных ✓
- Полная Prisma schema (15 моделей): MatrixVersion, Build, SkillTaxonomy,
  SkillGroup, Skill (с `active` + `archivedAt`), SkillWeight, MasteryLevel,
  GradeLevel, SkillGate, User (с `gradeFloor` + `gradeFloorReason`),
  DesignerNote, Assessment, AssessmentScore, AssessmentHistory, AuditLog
- Скрипт импорта Excel (538 строк) парсит:
  - 51 навык с описанием (italic), типом CORE/SEC, max уровнем мастерства
  - 153 веса (51 × 3 билда)
  - ~120 уровней мастерства с titles + criteria + пометкой «(З) Заменяемые навыки»
  - 6 грейдов с порогами XP
  - 69 правил гейтов (resolved через alias-словарь — нестыковки имён в шаблоне)
- **Sanity-check проходит точно с Excel:**
  - Σ MAX XP creator = 255, visioner = 244, navigator = 250
- Чистый модуль расчёта (`src/lib/grade.ts`, 181 строка):
  - `calcXp(skills, scores)` — учитывает только активные навыки
  - `calcGrade(input)` — алгоритм с антифармом через гейты
  - `effective_grade = max(calculated, gradeFloor)`
- 15 unit-тестов (Vitest), включая эталонный профиль из листа «Портрет»:
  - Создатель / Мидл / 162 XP / разбивка UI=27, UX=35, PRD=19, IND=43, RES=38

### Phase 1 — Auth + ролевые маршруты ✓
- NextAuth с двумя провайдерами:
  - `dev` — Credentials без пароля (выбор юзера из списка)
  - `keycloak` — OIDC, маппинг по `User.ssoId`
  - Переключение через `AUTH_MODE` в `.env`
- Middleware (`withAuth`) для гейта `/admin/* /lead/* /designer/*`
- Server-side проверки в layout-ах через `requireRole()`
- Сессия типизирована и обогащена: `id`, `role`, `buildId`, `buildCode`,
  `leadId`, `gradeFloor`, `department`
- Sign-in страница с двумя режимами + UserMenu в шапке
- Placeholder dashboards для трёх ролей с реальными данными из БД
  (admin: счётчики, lead: список своих дизайнеров, designer: профиль с floor)
- Seed-скрипт: 1 admin (Pavel) + 2 lead + 5 designer
  - 1 designer (Олег Терехов) с `gradeFloor=middle` для проверки legacy-кейса

---

## 6. Что НЕ сделано (Phase 2-8 — по PRD §8)

| Phase | Что | Дни |
|-------|-----|-----|
| 2 | CRUD пользователей: модалка с floor + notes + audit-логирование изменений floor | 3-4 |
| 3 | Форма оценки: 51 навык, авто-сохранение, live-расчёт, заметки лида (главный экран — мокап готов) | 5-7 |
| 4 | Портрет дизайнера: радар Chart.js, гейты XP, освоенные навыки, snapshot | 4-5 |
| 5 | Админка матрицы: версионирование, toggle active, редактирование навыков, удаление архивных | 4-5 |
| 6 | Подключение реального Keycloak (после согласования с IT) | 2-4 |
| 7 | Тестирование на эталонных профилях | 2-3 |
| 8 | Деплой | 1-2 |

**Итого впереди:** 21-30 рабочих дней.

---

## 7. Текущий блокер

В Cowork (где мы работали) sandbox **не может:**
1. Push в GitHub — нет SSH-ключей Pavel'а (security policy)
2. Удалить файлы из `.git/index.lock` (sandbox restrictions на mounted folders)
3. Помочь с локальным `npm install` / `docker compose` — нет доступа к Mac пользователя

**Cowork успела:** написать весь код Phase 0+1, проверить парсинг Excel,
прогнать smoke-тесты расчёта грейда. Код готов к запуску, но Pavel сам
не запустил его (он не разработчик).

**Pavel дал git-remote:** `git@github.com:Es111may/grades.git` (создал пустой repo).

---

## 8. ⚠ Первое что сделать в Code

### Шаг 1 — Запушить в GitHub

```bash
cd ~/Documents/Claude/Projects/Грейды
git init
git remote add origin git@github.com:Es111may/grades.git
git add -A
git commit -m "Initial commit — PRD, мокапы, Phase 0+1 кода"
git branch -M main
git push -u origin main
```

Если в `.git/` остались артефакты от Cowork (он пробовал git init) —
удали папку: `rm -rf .git` и начни заново.

`.gitignore` в корне уже есть — он исключит `node_modules/`, `.env`,
`.next/`, `.DS_Store`.

### Шаг 2 — Решить с Pavel: локально или Railway?

**Pavel — не разработчик.** Если ему предложить «открой терминал и сделай 9 шагов»
— у него отпадёт желание. Лучшие варианты:

#### Опция А — Запустить локально (для проверки, не для прода)
В `grades-app/README.md` есть подробная инструкция. Тебе нужно вместе с ним:
1. Установить Node.js (через `nvm` или brew)
2. Установить Docker Desktop
3. Пройти 9 шагов из README.

Это займёт **~1-2 часа первый раз**. Будет много мест где он застрянет
(например, NEXTAUTH_SECRET надо сгенерировать, Cyrillic-путь к Excel,
Prisma engines fetch при прокси). Будь готов помочь с каждым.

#### Опция Б — Деплой на Railway (Pavel уже там работает)
1. Railway → New Project → Deploy from GitHub Repo (`Es111may/grades`)
2. Add Plugin → PostgreSQL — даст автоматически `DATABASE_URL`
3. Variables (в Railway UI):
   - `NEXTAUTH_URL` = railway URL (после первого деплоя)
   - `NEXTAUTH_SECRET` = `openssl rand -base64 32`
   - `AUTH_MODE` = `dev`
4. **Build command:** `cd grades-app && npm install && npx prisma migrate deploy && npm run build`
5. **Start command:** `cd grades-app && npx prisma db seed && npx tsx scripts/import-excel.ts && npm start`
   - НО: это запустит seed+import при каждом рестарте, что не идеально.
   - Лучше: первый раз сделать через Railway CLI shell, потом убрать из `start`.
6. Excel-файл — путь `EXCEL_TEMPLATE_PATH` указать как `../Шаблон Скиллсет 2.0.xlsx`
   относительно `grades-app/`. На Railway проверь что файл попал в репо.

⚠ Проблема Railway: `migrate deploy` требует существующие миграции в `prisma/migrations/`.
В коде сейчас миграции **не созданы** — их генерирует `prisma migrate dev` при первом
локальном запуске. Решение: один раз локально запустить `npx prisma migrate dev --name init`
чтобы создать `prisma/migrations/<timestamp>_init/migration.sql`, закоммитить и
запушить, тогда Railway сможет применить.

Альтернатива — использовать `prisma db push` вместо миграций (проще, но без истории
изменений схемы, что для prod не очень). Для MVP — приемлемо.

**Моя рекомендация:** Опция Б (Railway), потому что Pavel уже владеет инструментом.
Локальный запуск ему скорее всего не нужен — он не будет править код, он будет
делать ревью UI и давать продуктовые правки.

### Шаг 3 — После того как заработало
Согласовать с Pavel **Phase 2** (CRUD пользователей) и начать его делать.

---

## 9. Архитектурные решения (НЕ нарушать без обсуждения)

Зафиксировано в PRD §6 и §9, обсуждалось с Pavel:

1. **Матрица — данные, а не код.** Все правки → новая `MatrixVersion`. Опубликованные оценки замораживаются в `Assessment.snapshot` (jsonb) — старые портреты не «съезжают» при правке матрицы.
2. **Skill.active** — мягкое выключение. Деактивированные не учитываются в новых оценках, но остаются в snapshot старых. Удаление возможно только из архива (`active=false`) с предупреждением.
3. **Grade floor** на пользователе — зафиксированный грейд для legacy-кейсов («перешёл со старой системы, обещали уровень не откатывать»). `effective_grade = max(calculated, floor)`. Понижение floor — только Admin + confirm + audit.
4. **Lead не оценивается** в этой системе. У лидов отдельная система оценки, вне scope.
5. **Одноступенчатая публикация** — лид опубликовал → дизайнер видит. Без апрува.
6. **Цикл оценки** — апрель и октябрь.
7. **6 грейдов** с едиными порогами XP: Intern (—), Junior (0+), Junior+ (70+), Middle (120+), Middle+ (180+), Senior (230+).
8. **Антифарм через гейты:** для каждого грейда × билда есть обязательные навыки. Если XP набран, но один из гейтов не освоен — грейд не присваивается, человек откатывается на нижний.
9. **Заметки лида** — приватны, видны только Lead/Admin, не показываются дизайнеру. Привязаны к человеку, переживают циклы.
10. **Audit log** для всех чувствительных действий: создание версии матрицы, понижение grade_floor, удаление навыков из архива.

---

## 10. Тестовые пользователи (после `npm run db:seed`)

| Email | Роль | Билд | Лид | Особенность |
|-------|------|------|-----|-------------|
| pg@idaproject.com | admin | — | — | Pavel |
| lead.improve@idaproject.com | lead | — | — | Анна Лидерова |
| lead.inhouse@idaproject.com | lead | — | — | Сергей Лидеров |
| ip@idaproject.com | designer | Создатель | Сергей | — |
| ma@idaproject.com | designer | Визионер | Сергей | — |
| as@idaproject.com | designer | Навигатор | Анна | — |
| dk@idaproject.com | designer | Создатель | Сергей | новичок (найм апрель 2026) |
| ot@idaproject.com | designer | Визионер | Анна | **gradeFloor = middle** (legacy) |

Логин в dev-режиме: на `/auth/signin` показывается список юзеров — клик
логинит без пароля.

---

## 11. Контрольные числа из Excel-шаблона (для верификации)

При корректном импорте и расчёте должны получаться **точно эти значения**:

- 51 навык, 153 веса (51×3), ~120 уровней мастерства, 69 правил гейтов
- Σ MAX XP по билдам: **Создатель 255, Визионер 244, Навигатор 250**
- Эталонный профиль из листа «Портрет»: **Создатель, 162 XP, грейд Мидл,
  разбивка UI=27, UX=35, PRD=19, IND=43, RES=38**
- До «Мидл+» нужно ещё **18 XP**

Если эти числа не сходятся — что-то поломано в импорте или расчёте.
Не двигайся дальше пока не сойдётся.

---

## 12. Риски, про которые помнить

1. **Лиды саботируют ввод 50 полей** — UX формы оценки критичен. Группировка по 5 скиллам, прогресс-бар, авто-сохранение черновика, частичное заполнение.
2. **Матрица меняется часто** — поэтому версионирование + snapshot. Не пересчитывать опубликованные оценки при правке.
3. **Завышение оценок «своим»** — audit-лог + видимость руководителю отдела статистики выставленных оценок.
4. **Холодный запуск на 50 человек** — запуск на одном отделе → обратная связь → расширение.
5. **Расхождение расчёта с Excel** — Phase 7 обязательна, прогон 2-3 эталонных профилей.

---

## 13. Что Pavel готов и не готов делать сам

**Готов:**
- Давать продуктовые решения, ревью UI
- Использовать GitHub Desktop, Railway UI
- Установить Node/Docker по инструкции (с поддержкой)

**НЕ готов:**
- Сидеть в терминале и отлаживать ошибки
- Читать стек-трейсы и понимать что они значат
- Принимать архитектурные решения по коду

⇒ В Code старайся **минимизировать его шаги в терминале**. Если можешь сделать
сам через bash — делай. Если нужно его действие (push, env vars) —
давай **точную пошаговую инструкцию** с ожидаемым выводом, чтобы он понял
сработало или нет.

---

## 14. Итог

**Сейчас:** код Phase 0+1 готов, лежит в `~/Documents/Claude/Projects/Грейды/`,
не запушен и не запущен.

**Следующее действие:** запушить в `git@github.com:Es111may/grades.git`,
потом помочь Pavel'у решить — локальный прогон или Railway-деплой.

Удачи 🚀
