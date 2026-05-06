# Грейды — веб-сервис грейдирования дизайнеров

Standalone Next.js 14 приложение для дизайн-лидов: оценивать дизайнеров по матрице компетенций, автоматически считать XP и грейд, давать дизайнеру публичный «портрет».

См. документы выше:
- `../01_План_работы.md` — план фаз
- `../02_PRD.md` — техническое задание
- `../03_Мокапы.html` — интерактивные мокапы
- `../Шаблон Скиллсет 2.0.xlsx` — исходная матрица

---

## Текущее состояние: Phase 0

Реализовано:
- Каркас Next.js 14 + TypeScript + Tailwind (Base44 design tokens из `../Design Documentation.md`)
- Полная Prisma schema (15 моделей по PRD §5)
- Скрипт импорта матрицы из Excel в БД (51 навык, 153 веса, ~69 гейтов)
- Чистый модуль расчёта грейда (`src/lib/grade.ts`) с unit-тестами (vitest)
- Docker-compose для локального Postgres

Не реализовано (следующие фазы):
- Auth (Keycloak / NextAuth) — Phase 1
- CRUD пользователей — Phase 2
- Форма оценки и портрет — Phase 3-4
- Админка матрицы — Phase 5

---

## Запуск (Phase 0)

### Требования
- Node.js ≥ 18.17
- Docker + docker-compose (для локального Postgres)
- npm

### 1. Зависимости

```bash
npm install
```

### 2. Postgres через Docker

```bash
docker compose up -d
```

Postgres поднимется на `localhost:5432` (логин `grades` / пароль `grades_dev` / БД `grades`).
Данные сохраняются в Docker-volume `grades-pgdata` между запусками.

### 3. Конфиг

```bash
cp .env.example .env
```

Отредактируй `.env` если меняешь dev-настройки. По умолчанию `DATABASE_URL` указывает на локальный compose-Postgres.

### 4. Применить миграцию

```bash
npm run db:migrate
```

Имя миграции при первом запуске: `init`.

### 5. Импорт матрицы из Excel

```bash
npm run import:excel
```

Скрипт читает `../Шаблон Скиллсет 2.0.xlsx` (путь задан в `.env` как `EXCEL_TEMPLATE_PATH`) и заполняет БД:
- 5 SkillTaxonomy (UI, UX, PRD, IND, RES)
- 14 SkillGroup
- 3 Build (Создатель, Визионер, Навигатор)
- 1 MatrixVersion с `isCurrent=true`
- 51 Skill + 153 SkillWeight + ~120 MasteryLevel
- 6 GradeLevel (Intern → Senior, единые пороги XP: 0/0/70/120/180/230)
- ~69 SkillGate (обязательные навыки на каждый грейд × билд)

Контрольный вывод в конце:
```
Σ MAX XP (creator):  255
Σ MAX XP (visioner): 244
Σ MAX XP (navigator): 250
```

Если расходится — что-то поломано в парсинге Excel.

### 6. Прогон тестов

```bash
npm test
```

Главный smoke-test — эталонный профиль Создатель/Мидл/162 XP с разбивкой UI=27/UX=35/PRD=19/IND=43/RES=38 (из листа «Портрет» Excel).

### 7. Prisma Studio

```bash
npm run db:studio
```

Открывает http://localhost:5555 — браузерная админка БД. Удобно проверить, что навыки/веса/гейты заехали корректно.

### 8. Dev сервер

```bash
npm run dev
```

Открой http://localhost:3000 — увидишь пустой каркас (на Phase 0 это просто статус-страница).

---

## Структура

```
grades-app/
├── prisma/
│   └── schema.prisma           # 15 моделей: матрица, пользователи, оценки, аудит
├── scripts/
│   └── import-excel.ts         # импорт Шаблон Скиллсет 2.0.xlsx
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx            # placeholder
│   │   └── globals.css         # tailwind base
│   └── lib/
│       ├── db.ts               # Prisma client singleton
│       ├── grade.ts            # ⭐ чистая логика расчёта грейда
│       ├── types.ts            # BuildCode, GradeCode, etc
│       └── __tests__/
│           └── grade.test.ts
├── docker-compose.yml          # local Postgres
├── package.json
├── tailwind.config.ts          # Base44 design tokens
└── tsconfig.json
```

---

## Архитектурные принципы

1. **Матрица — данные, а не код.** Все веса, гейты, уровни мастерства — в БД. Любая правка → новая `MatrixVersion`. Опубликованные оценки не «съезжают» — защищены через `Assessment.snapshot` (jsonb).

2. **Skill.active** — мягкое выключение через тоггл. Удаление возможно только из архива (`active=false`) с явным предупреждением. См. PRD §6.5.

3. **Grade floor** — зафиксированный минимальный грейд для дизайнера. Используется при переходе со старой системы. Понижение — только Admin + подтверждение + audit. См. PRD §6.3.

4. **Чистая логика расчёта** в `src/lib/grade.ts` — без БД-зависимостей. Можно переиспользовать на клиенте для live-калькулятора и на сервере для публикации.

5. **Audit log** для всех чувствительных действий: создание версии матрицы, понижение grade_floor, удаление навыков из архива.

---

## Troubleshooting

**`npm install` зависает** — попробуй `npm install --no-audit --no-fund`. Если проблема в @prisma/engines — установи переменную `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1` (актуально для прокси/закрытых сетей).

**`npm run db:migrate` ругается на «P1001: Can't reach database server»** — Postgres не поднялся. Проверь `docker compose ps`.

**`npm run import:excel` пишет «Лист X не найден»** — путь к Excel неверный. Проверь `EXCEL_TEMPLATE_PATH` в `.env`.

**Гейты импортированы не все** — посмотри в выводе скрипта строки `⚠ Гейт ссылается на ненайденный навык`. Скорее всего, в Excel-таблице «Гейты (билды)» используется немного другое имя навыка, чем в листе «Скиллсет». Добавь алиас в `SKILL_ALIASES` внутри `scripts/import-excel.ts`.

**В БД дубликат MatrixVersion #1 после повторного импорта** — скрипт обнаруживает существующую v1 и пересоздаёт. Если хочешь начать с чистого листа: `npm run db:reset` (удалит ВСЕ данные).

---

## Что дальше — Phase 1 (Auth + каркас)

1. NextAuth.js + dev-провайдер (email magic-link для локальной разработки).
2. Ролевая модель: middleware проверяет роль (admin/lead/designer) и редиректит.
3. Маршруты `/admin/*`, `/lead/*`, `/designer/*` с базовыми layout'ами.
4. Подключение реального Keycloak — отдельной задачей после согласования с IT.


---

## Phase 1 — Auth + ролевые маршруты ✓

### Что добавлено

- **NextAuth** с двумя провайдерами:
  - `dev` (Credentials, без пароля) — выбираешь юзера из списка на `/auth/signin`
  - `keycloak` (OIDC) — для прода. Маппинг по `User.ssoId`
  - Режим выбирается через `AUTH_MODE` в `.env`
- **Middleware** — гейт-проверка `/admin/*`, `/lead/*`, `/designer/*` через `withAuth`
- **Layout-проверки** через `requireRole()` в server components
- **Сессия** обогащена доменными полями: `id`, `role`, `buildId`, `buildCode`, `leadId`, `gradeFloor`, `department` (см. `src/types/next-auth.d.ts`)
- **Страницы:**
  - `/auth/signin` — выбор юзера в dev-режиме / редирект на Keycloak в проде
  - `/auth/error` — отображение ошибок авторизации
  - `/admin` — placeholder dashboard с метриками БД
  - `/lead` — список «моих дизайнеров» из БД
  - `/designer` — мой профиль с grade_floor (если задан)
- **UserMenu** в шапке с sign out

### Тестовые пользователи (после `npm run db:seed`)

| Email | Роль | Билд | Лид |
|---|---|---|---|
| `pg@idaproject.com` | Admin | — | — |
| `lead.improve@idaproject.com` | Lead | — | — |
| `lead.inhouse@idaproject.com` | Lead | — | — |
| `ip@idaproject.com` | Designer | Создатель | Сергей |
| `ma@idaproject.com` | Designer | Визионер | Сергей |
| `as@idaproject.com` | Designer | Навигатор | Анна |
| `dk@idaproject.com` | Designer | Создатель | Сергей |
| `ot@idaproject.com` | Designer | Визионер | Анна (с **grade_floor=middle**) |

### Дополнительные шаги после Phase 0

```bash
# уже сделано в Phase 0
docker compose up -d
npm install
cp .env.example .env
npm run db:migrate
npm run import:excel

# Phase 1 — сидим тестовых пользователей
npm run db:seed

# запуск
npm run dev
# → http://localhost:3000 → редирект на /auth/signin
# → выбираем пользователя → попадаем на /admin /lead /designer
```

### Подключение реального Keycloak (когда IT даст реквизиты)

1. В Keycloak admin: создать realm + client (тип "OpenID Connect", "Confidential", "Authorization Code Flow"). Redirect URI: `https://your-domain/api/auth/callback/keycloak`.
2. Заполнить в `.env`:
   ```
   AUTH_MODE=keycloak
   KEYCLOAK_ISSUER=https://your-keycloak/realms/your-realm
   KEYCLOAK_CLIENT_ID=grades
   KEYCLOAK_CLIENT_SECRET=...
   ```
3. Каждому пользователю в БД проставить `ssoId` равный `sub` из Keycloak (можно через Prisma Studio).
4. Перезапустить app.

⚠ Текущая реализация **не создаёт пользователей автоматически** при логине через Keycloak — это сделано осознанно (см. PRD §2.2: только Admin создаёт юзеров). Если пользователя нет в БД с `ssoId` — он получит ошибку `AccessDenied`.

### Тесты (vitest)

```bash
npm test
```

Прогоняет smoke-тест на эталонном профиле «Создатель/Мидл/162 XP» + проверки антифарма и grade_floor.

