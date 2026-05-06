# PRD: Веб-сервис грейдирования дизайнеров

**Версия документа:** 0.3
**Автор:** Pavel + AI
**Обновлено:** 2026-05-05
**Статус:** на согласовании

> **Что изменилось с v0.2:**
> - Добавлен признак `active` на навыке (мягкое выключение через тоггл, удаление только из архива).
> - Зафиксирована политика правок матрицы: любая правка → новая версия (без разделения на «косметические» и «структурные»).
> - Зафиксировано: понижение grade_floor — только Admin с подтверждением и аудитом.
> - Добавлен полный список экранов с пометкой «mockup vs straight-to-code».
> - Сменён референс дизайн-системы на Base44 (см. `Design Documentation.md`).

---

## 1. Контекст и цели

### 1.1 Проблема
Грейдирование сейчас идёт через Excel-шаблон «Скиллсет 2.0». Минусы:
- ~50 полей в одном листе, лид легко ошибается.
- Нет шаринга с дизайнером в виде «портрета».
- Нет версионирования и аудита.
- Любая правка матрицы (вес, гейт, новый навык) — копирование файла, ручной перерасчёт, риск расхождений.

### 1.2 Цели v1
1. Снять с лида рутину расчёта XP, проверки гейтов, формирования диаграмм.
2. Дать дизайнеру прозрачный портрет с понятной картой развития.
3. Сделать матрицу управляемой — Admin меняет в UI, не правит файл.
4. Зафиксировать историю оценок (кто, когда, что менял).
5. Поддержать переход со старой системы грейдов **без отката уровней** (grade floor).

### 1.3 Метрики успеха через 3 месяца после запуска
- ≥80% дизайнеров отдела имеют опубликованную оценку за цикл.
- Время заполнения одной оценки лидом: ≤30 минут.
- 0 расхождений между расчётом приложения и контрольным расчётом в Excel на эталонных профилях.
- Лид не возвращается к Excel-шаблону.

### 1.4 Цикл оценки
**2 раза в год: апрель и октябрь.** Между циклами — черновик и заметки. Публикация → новый «текущий» портрет, предыдущий уходит в архив.

### 1.5 Out of scope для v1
- Самооценка дизайнера + загрузка фигма-файлов как доказательств.
- Иконки навыков, кастомная инфографика.
- ИПР с уровня Мидл.
- Интеграция с Tims / 1С / другими HR.
- Mobile-приложение.
- Push/email-уведомления (кроме служебных от Keycloak).
- Перерасчёт публикованных оценок при правке матрицы (snapshot защищает).

---

## 2. Роли и доступы

### 2.1 Роли
| Роль | Кто | Кол-во | Грейдируется в системе? |
|------|-----|--------|--------------------------|
| **Admin** | Дизайн-директор / HR-админ | 1–2 | Нет |
| **Lead** | Дизайн-лид отдела | 3–7 | **Нет — у лидов отдельная система оценки, не входит в этот сервис** |
| **Designer** | Дизайнер любого билда | 20–50 | Да |

### 2.2 Матрица прав
| Действие | Admin | Lead | Designer |
|----------|-------|------|----------|
| Импорт матрицы из Excel | ✅ | ❌ | ❌ |
| Редактировать матрицу (веса, гейты, навыки, активность) | ✅ | ❌ | ❌ |
| Удалять навыки из архива (безвозвратно) | ✅ | ❌ | ❌ |
| CRUD пользователей | ✅ | ❌ | ❌ |
| Назначать/менять лида дизайнеру | ✅ | ❌ | ❌ |
| Создавать/редактировать оценку (черновик) | ✅ | ✅ (только своих) | ❌ |
| Публиковать оценку | ✅ | ✅ (только своих) | ❌ |
| Видеть портрет дизайнера | ✅ | ✅ (только своих) | ❌ |
| Видеть свой портрет | ✅ | ❌ | ✅ |
| Писать заметки про дизайнера | ✅ | ✅ | ❌ |
| Устанавливать grade_floor | ✅ | ✅ | ❌ |
| **Понижать grade_floor** | ✅ (с подтверждением) | ❌ | ❌ |
| Снимать grade_floor | ✅ | ❌ | ❌ |
| Видеть аудит-лог | ✅ | ❌ | ❌ |

---

## 3. Use cases (краткие)

См. v0.2 PRD — все use cases актуальны. Новое:

### UC7: Admin деактивирует/удаляет навык
1. Admin открывает матрицу, видит навык как «Активен» (тоггл включен).
2. Выключает тоггл → навык переходит в «Архив».
   - В форме оценки больше не показывается.
   - В существующих snapshot-портретах остаётся (там данные заморожены).
   - В новых оценках не учитывается.
3. **Удаление возможно только из архивных навыков**, кнопкой «Удалить N архивных навыков» в матрице.
4. При удалении: предупреждение «Это удалит навык и из старых snapshot-оценок. Старые портреты могут немного измениться, XP пересчитается без них». Требует явного подтверждения.

### UC8: Admin понижает grade_floor дизайнера
1. Admin открывает карточку дизайнера в `/admin/users/[id]`.
2. Видит текущий grade_floor (например, «Мидл»).
3. Меняет на более низкий (например, «Джун+»).
4. Confirm: «Это понизит зафиксированный грейд. Действие логируется. Продолжить?».
5. Изменение пишется в audit log с до/после/обоснованием.

---

## 4. Экраны (полный перечень)

### Будут ли мокапы перед кодом?
| Экран | URL | Сложность UX | Mockup в `03_Мокапы.html`? |
|-------|-----|---|---|
| Login (Keycloak SSO) | `/login` | n/a | нет — стандарт |
| Dashboard (редирект по роли) | `/` | n/a | нет |
| **Lead: мои дизайнеры** | `/lead` | средняя | **да** |
| **Lead: оценка дизайнера** | `/lead/assessment/[id]` | **высокая** | **да** |
| **Designer: портрет** | `/designer/portrait` | высокая | **да** |
| Designer: история оценок | `/designer/portrait/history` | низкая | нет — стандарт |
| **Admin: пользователи** | `/admin/users` | средняя | **да** |
| **Admin: карточка пользователя (модал)** | `/admin/users/[id]` | средняя | **да** (модал в /admin/users) |
| **Admin: матрица** | `/admin/matrix` | высокая | **да** |
| **Admin: редактирование навыка (модал)** | `/admin/matrix/skill/[id]` | высокая | **да** (модал в /admin/matrix) |
| Admin: история версий матрицы + diff | `/admin/matrix/versions` | средняя | нет — straight-to-code |
| Admin: импорт Excel (wizard) | `/admin/matrix/import` | средняя | нет — straight-to-code |
| Admin: все оценки в системе | `/admin/assessments` | низкая | нет — стандарт |
| Admin: аудит-лог | `/admin/audit` | низкая | нет — стандарт |

---

## 5. Модель данных (Prisma schema, обновлённая)

```prisma
model MatrixVersion {
  id        Int       @id @default(autoincrement())
  number    Int       @unique
  createdAt DateTime  @default(now())
  createdBy Int
  comment   String?
  isCurrent Boolean   @default(false)
}

model Build {
  id          Int    @id @default(autoincrement())
  code        String @unique  // "creator" | "visioner" | "navigator"
  name        String
  description String?
}

model SkillTaxonomy {
  id        Int    @id @default(autoincrement())
  code      String @unique  // UI / UX / PRD / IND / RES
  name      String
  sortOrder Int
}

model SkillGroup {
  id          Int    @id @default(autoincrement())
  taxonomyId  Int
  name        String
  sortOrder   Int
}

model Skill {
  id              Int     @id @default(autoincrement())
  matrixVersionId Int
  groupId         Int
  name            String
  description     String  // italic
  type            String  // "CORE" | "SEC"
  maxMasteryLevel Int     // 1..5
  replaceableNote String? // "Заменяемые навыки (З)..."
  active          Boolean @default(true)  // NEW: soft toggle
  archivedAt      DateTime?               // NEW: when deactivated
}

model SkillWeight {
  matrixVersionId Int
  skillId         Int
  buildId         Int
  weight          Float
  @@unique([matrixVersionId, skillId, buildId])
}

model MasteryLevel {
  id              Int    @id @default(autoincrement())
  matrixVersionId Int
  skillId         Int
  level           Int    // 1..N
  title           String
  criteria        String
}

model GradeLevel {
  id              Int    @id @default(autoincrement())
  matrixVersionId Int
  code            String // "intern" | "junior" | "junior_plus" | "middle" | "middle_plus" | "senior"
  name            String
  sortOrder       Int
  xpThresholds    Json   // { "creator": 230, "visioner": 230, "navigator": 230 }
}

model SkillGate {
  matrixVersionId Int
  gradeLevelId    Int
  buildId         Int
  skillId         Int
  requiredMastery Int
  @@unique([matrixVersionId, gradeLevelId, buildId, skillId])
}

model User {
  id          Int       @id @default(autoincrement())
  email       String    @unique
  fullName    String
  ssoId       String?   @unique
  role        String    // "admin" | "lead" | "designer"
  buildId     Int?
  department  String?
  leadId      Int?
  hiredAt     DateTime?
  active      Boolean   @default(true)
  gradeFloor  String?   // "junior" | "junior_plus" | "middle" | "middle_plus" | "senior"
  gradeFloorReason String?
}

model DesignerNote {
  id         Int      @id @default(autoincrement())
  designerId Int
  authorId   Int
  text       String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  // приватно: Lead/Admin
}

model Assessment {
  id              Int       @id @default(autoincrement())
  designerId      Int
  leadId          Int
  matrixVersionId Int
  cycle           String    // "2026-04" | "2026-10"
  status          String    // "draft" | "published" | "archived"
  createdAt       DateTime  @default(now())
  publishedAt     DateTime?
  totalXp         Float?
  calculatedGrade String?
  effectiveGrade  String?   // max(calculated, designer.gradeFloor)
  snapshot        Json?
}

model AssessmentScore {
  assessmentId Int
  skillId      Int
  masteryLevel Int      // 0..N
  comment      String?
  evidenceUrl  String?
  updatedAt    DateTime @updatedAt
  @@unique([assessmentId, skillId])
}

model AssessmentHistory {
  id           Int      @id @default(autoincrement())
  assessmentId Int
  changedById  Int
  changedAt    DateTime @default(now())
  action       String
  diff         Json
}

// NEW: общий аудит-лог для всех чувствительных действий
model AuditLog {
  id          Int      @id @default(autoincrement())
  actorId     Int
  action      String   // "matrix_version_created" | "grade_floor_changed" | "skill_deactivated" | "skill_deleted" | ...
  targetType  String   // "user" | "skill" | "matrix" | "assessment"
  targetId    Int?
  details     Json     // { before: ..., after: ..., reason: "..." }
  createdAt   DateTime @default(now())
}
```

---

## 6. Бизнес-логика

### 6.1 Расчёт XP
```
xp_per_skill = (skill.active ? mastery_level × weight[designer.build] : 0)
total_xp = sum(xp_per_skill) по всем активным навыкам
```
**Деактивированные навыки выключены из расчёта.** Это значит: если навык был активен в момент публикации старой оценки и есть в snapshot — там он остаётся как есть (snapshot заморожен). В новой оценке он просто не появится в форме.

### 6.2 Пороги XP (entry to grade) — единые для всех билдов
| Грейд | Порог XP |
|-------|----------|
| Intern | < 0 (не начато) |
| Junior | 0+ |
| Junior+ | 70+ |
| Middle | 120+ |
| Middle+ | 180+ |
| Senior | 230+ |

### 6.3 Effective grade и grade floor
```
effective_grade = max_by_sort(calculated_grade, designer.grade_floor)
```
**Правила:**
- Floor задаёт Lead или Admin при создании/редактировании дизайнера.
- Floor можно **повысить** (Lead/Admin) и **снять** (Admin).
- **Понижение floor — только Admin, с явным подтверждением + audit-лог запись (action: `grade_floor_lowered`, before/after/reason).**
- Снятие floor — только Admin, с подтверждением + audit-лог (`grade_floor_removed`).

### 6.4 Версионирование матрицы
- **Любая правка матрицы → новая MatrixVersion.** Нет деления на «косметические» и «структурные» — всё одинаково (упрощает аудит).
- Опубликованные оценки **не пересчитываются** — snapshot защищает.
- Черновики на старой версии получают плашку «Матрица обновлена. Перенести на v[N+1]?».
- При переносе черновика: если в новой версии каких-то навыков нет (удалены) — показать предупреждение «N оценок будут потеряны» с подтверждением.

### 6.5 Жизненный цикл навыка
1. **Создан** → `active = true`, в текущей версии матрицы.
2. **Деактивирован** (тоггл) → `active = false, archivedAt = now()`.
   - Не показывается в форме оценки.
   - Не учитывается в расчёте XP в новых оценках.
   - В старых snapshot-портретах остаётся.
3. **Удалён** (только из архива, кнопкой «Удалить N архивных навыков»):
   - Каскадно удаляется из всех таблиц текущей версии (Skill, SkillWeight, MasteryLevel, SkillGate).
   - В старых snapshot-портретах — навык исчезает (XP пересчитывается без него; **видимость портрета может измениться**, дизайнеру показывается короткое уведомление в портрете).
   - Запись в audit-лог с указанием, какие snapshot-портреты были затронуты.

### 6.6 Заметки лида
- Свободный текст до 5000 знаков.
- Видны только Lead/Admin. Не видны дизайнеру.
- Привязка к designer, не к assessment — переживают циклы.
- Изменения логируются в DesignerNote с историей.

---

## 7. Нефункциональные требования

| Требование | Значение |
|------------|----------|
| **Auth** | Keycloak OIDC через NextAuth.js. Группы Keycloak → роли. |
| **Локализация** | ru-only. |
| **Производительность** | До 50 одновременных пользователей. |
| **Дизайн-язык** | См. `Design Documentation.md` (Base44-стиль): Canvas Pearl #faf9f7 ground, Snowdrift White cards, Lime Spritz / Light Lime для primary CTA, Ash Border, system-ui display с generous letter-spacing, pill buttons 999px, card radius 7-14px, subtle shadow. |
| **Бэкапы** | Ежедневный pg_dump, ретенция 30 дней. |
| **Логи** | Структурные JSON-логи (pino). |
| **Безопасность** | HTTPS обязателен, секреты в Vault. CSRF в NextAuth. |
| **Браузеры** | Chrome/Edge/Firefox/Safari последние версии. |
| **Хостинг** | Внутренний сервер компании, Docker-compose: app + Postgres + reverse-proxy. |

---

## 8. Этапы и критерии приёмки

| Фаза | Длительность | Критерий приёмки |
|------|---|------------------|
| 0. Дизайн данных | 3–5 дней | Prisma-схема с Skill.active, AuditLog — миграция применяется, импорт Excel заполняет БД с активными навыками. |
| 1. Каркас + Auth | 3–4 дня | Keycloak (на dev — заглушка), доступ к /admin /lead /designer. |
| 2. Управление пользователями | 3–4 дня | Admin создал 3 пользователей, привязал лиду, задал 1 дизайнеру grade_floor с заметкой. Понижение floor требует подтверждения и пишется в аудит. |
| 3. Форма оценки | 5–7 дней | Лид заполнил все 51 навык, описание+критерии видны полностью, заметка сохраняется, расчёт совпадает с Excel-шаблоном до копейки. Деактивированные навыки не показываются. |
| 4. Портрет | 4–5 дней | Грейд, XP, radar, гейты, освоенные навыки, баннер floor. Совпадает с листом «Портрет» Excel. |
| 5. Админ-панель матрицы | 4–5 дней | Создана версия 2 с правкой одного веса. Старая опубликованная оценка не изменилась. Можно деактивировать навык, потом удалить из архива. Audit-лог пишется. |
| 6. Корп. SSO | 2–4 дня | Реальный Keycloak подключён. |
| 7. Тестирование | 2–3 дня | 2 эталонных профиля из Excel прогнаны через систему — все цифры совпадают. |
| 8. Деплой | 1–2 дня | Развёрнуто на внутреннем сервере, бэкап работает. |

**Итого:** 27–39 рабочих дней (~6–8 недель чистого времени, реально 2,5–3 месяца с учётом основной работы).

---

## 9. Открытые вопросы (закрытые)

| # | Вопрос | Решение |
|---|--------|---------|
| 1 | Хранение комментариев и evidence URL | Текст до 2000, URL не валидируем. |
| 2 | Что делать с дизайнером ниже Junior-порога? | **Intern** (новый грейд). |
| 3 | Реассигн дизайнера на нового лида | Старая оценка остаётся в архиве. Новый лид правит на следующих циклах. |
| 4 | Гейт «UX/Компоненты и лейауты» | Стандартный механизм через SkillGate. |
| 5 | MAX XP различается между билдами | Только абсолютные значения. |
| 6 | Кто оценивает лида | **Не оценивается в этой системе.** |
| 7 | Двухступенчатая публикация | **Одноступенчатая.** |
| 8 | Цикл оценки | **Апрель и октябрь.** |
| 9 | Переход со старой системы | Механизм **grade floor**. |
| 10 | Косметические vs структурные правки матрицы | **Любая правка → новая версия.** |
| 11 | Удаление навыка | **Только через архив (тоггл active).** Удаление архивных — отдельная кнопка с предупреждением. |
| 12 | Видит ли дизайнер свой grade_floor? | **Да** — баннер «Грейд зафиксирован при переходе со старой системы». |
| 13 | Понижение grade_floor | **Только Admin + подтверждение + аудит.** |

---

## 10. Что дальше

1. **HTML-мокапы (готово)** — `03_Мокапы.html`. Открыть, прощёлкать 5 view, собрать обратку.
2. **Инициализация репозитория** Next.js + Prisma + миграции (1–2 дня).
3. **Скрипт импорта Excel→БД** (1 день) — приоритетно, чтобы матрица заехала корректно.
4. **Фаза 1: Auth + каркас** (3–4 дня).

---

## 11. Связанные документы

- `01_План_работы.md` — общий план фаз и архитектура
- `03_Мокапы.html` — интерактивные мокапы (5 view: Lead-list, Lead-form, Designer-portrait, Admin-users, Admin-matrix; 2 модалки: User-edit, Skill-edit)
- `Шаблон Скиллсет 2.0.xlsx` — исходная матрица (51 навык)
- `Design Documentation.md` — дизайн-токены (Base44-стиль: Canvas Pearl, Lime Spritz, pill buttons, card 7-14px radius)
- `Frontend-design.md` — принципы фронтенд-дизайна (избегать generic AI aesthetics)

