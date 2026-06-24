'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import Avatar from '@/components/Avatar';
import { ChevronDownIcon } from '@/components/icons';
import { MarkdownContent } from '@/components/Markdown';

type Build = { id: number; code: string; name: string };
type UserRow = {
  id: number;
  fullName: string;
  role: string;
  build: Build | null;
  active: boolean;
  avatarUrl?: string | null;
  effectiveGrade?: string | null;
};

const GRADE_SHORT: Record<string, string> = {
  junior: 'Джун',
  junior_plus: 'Джун+',
  premiddle: 'Пре-мидл',
  middle: 'Мидл',
  middle_plus: 'Мидл+',
  senior: 'Синьор',
};

type Level = 'low' | 'mid' | 'high';
type Placement = {
  userId: number;
  potentialLevel: Level;
  performanceLevel: Level;
};

type CellMeta = {
  potential: Level;
  performance: Level;
  title: string;
  highlighted: boolean;
};

const CELLS: CellMeta[] = [
  { potential: 'high', performance: 'low', title: 'Проблемные гении', highlighted: true },
  { potential: 'high', performance: 'mid', title: 'Высокий потенциал', highlighted: false },
  { potential: 'high', performance: 'high', title: 'Звёзды', highlighted: false },
  { potential: 'mid', performance: 'low', title: 'Зона особого внимания', highlighted: false },
  { potential: 'mid', performance: 'mid', title: 'Основа команды', highlighted: true },
  { potential: 'mid', performance: 'high', title: 'Высокая производительность', highlighted: false },
  { potential: 'low', performance: 'low', title: 'Ошибка подбора', highlighted: false },
  { potential: 'low', performance: 'mid', title: 'Зона особого внимания', highlighted: false },
  { potential: 'low', performance: 'high', title: 'Рабочие лошадки', highlighted: true },
];

const UNASSIGNED_ID = 'unassigned';
const cellId = (potential: Level, performance: Level) => `cell-${potential}-${performance}`;
const parseCellId = (id: string): { potential: Level; performance: Level } | null => {
  const m = id.match(/^cell-(low|mid|high)-(low|mid|high)$/);
  if (!m) return null;
  return { potential: m[1] as Level, performance: m[2] as Level };
};

const buildColor = (code: string) =>
  code === 'creator' ? '#00ca48' : code === 'visioner' ? '#7c3aed' : '#0ea5e9';

function UserCard({
  user,
  ghosting = false,
  showGrade = false,
}: {
  user: UserRow;
  ghosting?: boolean;
  showGrade?: boolean;
}) {
  return (
    <div
      className={`bg-snow border border-cloud rounded-[10px] px-2.5 py-1.5 shadow-soft flex items-center gap-2 ${
        ghosting ? 'opacity-30' : ''
      }`}
    >
      <Avatar name={user.fullName} avatarUrl={user.avatarUrl} size={24} />
      <span className="text-xs font-medium leading-tight truncate flex-1">
        {user.fullName}
      </span>
      {showGrade && user.effectiveGrade && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-pill bg-cloud/60 text-stone font-medium shrink-0 leading-none">
          {GRADE_SHORT[user.effectiveGrade] ?? user.effectiveGrade}
        </span>
      )}
      {user.build && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: buildColor(user.build.code) }}
          title={user.build.name}
        />
      )}
    </div>
  );
}

function DraggableUser({
  user,
  ghosting,
  showGrade = false,
}: {
  user: UserRow;
  ghosting: boolean;
  showGrade?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `user-${user.id}`,
    data: { userId: user.id },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-30' : ''}`}
    >
      <UserCard
        user={user}
        ghosting={ghosting && !isDragging}
        showGrade={showGrade}
      />
    </div>
  );
}

function MatrixCell({
  meta,
  users,
  saving,
}: {
  meta: CellMeta;
  users: UserRow[];
  saving: Set<number>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId(meta.potential, meta.performance) });
  return (
    <div
      ref={setNodeRef}
      className={`relative flex flex-col rounded-[14px] border transition-all duration-150 min-h-[180px] p-3 ${
        isOver
          ? 'border-sky ring-2 ring-sky bg-sky/5'
          : meta.highlighted
            ? 'border-cloud bg-cloud/40'
            : 'border-cloud bg-snow'
      }`}
    >
      <div className="text-[10px]  font-medium text-stone mb-2 leading-tight">
        {meta.title}
      </div>
      <div className="flex flex-col gap-1.5 flex-1">
        {users.map((u) => (
          <DraggableUser key={u.id} user={u} ghosting={saving.has(u.id)} showGrade />
        ))}
      </div>
    </div>
  );
}

function UnassignedZone({
  users,
  saving,
}: {
  users: UserRow[];
  saving: Set<number>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: UNASSIGNED_ID });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-[14px] border transition-all duration-150 p-3 w-[240px] shrink-0 self-start min-h-[200px] ${
        isOver ? 'border-sky ring-2 ring-sky bg-sky/5' : 'border-cloud bg-snow'
      }`}
    >
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-[11px]  font-medium text-stone">
          Не размещены
        </span>
        <span className="text-xs text-ash font-medium tabular-nums">{users.length}</span>
      </div>
      <div className="flex flex-col gap-1.5 flex-1">
        {users.map((u) => (
          <DraggableUser key={u.id} user={u} ghosting={saving.has(u.id)} />
        ))}
        {users.length === 0 && (
          <div className="text-xs text-ash italic text-center py-3">все размещены</div>
        )}
      </div>
    </div>
  );
}

// Документация в раскрывающемся разделе под матрицей. Хранится как markdown
// и рендерится через MarkdownContent (тот же рендер, что для мнений лида/CDO),
// чтобы не плодить вёрстку и легко править текст. Синтаксис рендера: ## / ###
// заголовки, * буллеты, **жирный**, __ — горизонтальная линия.
const NINE_BOX_DOC = `## Оценка перформанса

Оценка перформанса помогает понять не только то, насколько хорошо сотрудник работает сейчас, но и то, какую ставку на него может сделать компания в будущем.

Система должна давать ясные ответы:

* кто действительно двигает компанию вперёд;
* кто способен вырасти;
* кто замедляет команду;
* кому стоит платить больше;
* кого пока нельзя повышать;
* кого важно удерживать;
* кого нужно развивать;
* с кем необходимо расставаться;
* какие руководители умеют строить сильные команды;
* где компания теряет скорость и деньги из-за слабых результатов.

Оценка состоит из четырёх связанных элементов:

* Критерии оценки сотрудника.
* Положение сотрудника в матрице 9-Box.
* Категория A, B или C.
* Управленческое решение и план действий.

__

## Что оценивается

### 1. Результат

Смотрим:

* выполнение целей;
* влияние на деньги, EBITDA и маржу;
* скорость работы;
* качество результата;
* клиентский эффект;
* вклад в продукт;
* снижение рисков;
* выполнение KPI или OKR.

**Главный вопрос:** что изменилось в бизнесе благодаря этому человеку?

### 2. Автономность

Смотрим:

* сколько контроля требует сотрудник;
* умеет ли он самостоятельно планировать работу;
* доводит ли задачи до результата;
* приходит ли с решениями, а не только с проблемами;
* разгружает ли руководителя;
* может ли работать без постоянных напоминаний.

**Главный вопрос:** человек разгружает систему или создаёт для неё дополнительную нагрузку?

### 3. Инициатива и улучшения

Смотрим:

* предлагает ли сотрудник улучшения;
* запускает ли изменения;
* замечает ли новые возможности;
* выходит ли за рамки формального исполнения задач;
* улучшает ли процессы, продукт, команду или клиентский опыт.

**Главный вопрос:** человек двигает компанию вперёд или только выполняет назначенные задачи?

### 4. Поведение и культура

Смотрим:

* ответственность;
* честность;
* зрелость;
* скорость и качество коммуникации;
* отсутствие токсичного поведения;
* умение признавать ошибки;
* умение работать с конфликтами;
* способность принимать и использовать обратную связь.

**Главный вопрос:** с этим человеком команда становится сильнее или слабее?

Высокий результат не компенсирует токсичность, систематическое нарушение договорённостей или разрушительное влияние на команду. Такой сотрудник не должен автоматически попадать в категорию A.

### 5. Потенциал

Смотрим:

* может ли сотрудник взять на себя больше;
* насколько быстро он учится;
* способен ли работать в условиях неопределённости;
* может ли справляться с более высокой сложностью;
* способен ли вырасти в руководителя или эксперта следующего уровня.

**Главный вопрос:** можно ли доверить этому человеку более масштабную роль и большую ответственность?

__

## Матрица потенциала 9-Box

9-Box — инструмент оценки сотрудников по двум осям:

* **производительность** — результаты работы здесь и сейчас;
* **потенциал** — способность расти и справляться с большей сложностью в будущем.

### Ось «Производительность»

Оценка формируется на основании результата, автономности, инициативы и поведения.

**Низкая производительность**

Результаты ниже ожиданий. Сотрудник не достигает целей, требует избыточного контроля или создаёт риски для команды и бизнеса.

**Средняя производительность**

Сотрудник в целом соответствует ожиданиям и выполняет основные задачи, но имеет заметные зоны развития.

**Высокая производительность**

Сотрудник стабильно превышает ожидания, заметно влияет на бизнес и способен самостоятельно обеспечивать результат.

### Ось «Потенциал»

**Низкий потенциал**

Сотрудник хорошо подходит для текущего уровня или роли, но пока не демонстрирует способности или желания брать на себя более высокую сложность.

**Средний потенциал**

Сотрудник может вырасти, но для этого ему нужны дополнительный опыт, обучение или развитие отдельных компетенций.

**Высокий потенциал**

Сотрудник быстро учится, справляется с неопределённостью и способен перейти на следующий уровень ответственности.

__

## Девять позиций в матрице

### Высокая производительность + высокий потенциал

**Звёзды**

Ключевые кандидаты на карьерный рост, лидерские роли и участие в кадровом резерве. Их важно удерживать, развивать и постепенно увеличивать масштаб ответственности.

### Высокая производительность + средний потенциал

**Ключевые игроки**

Стабильно дают сильный результат и могут продолжать расти в своей профессиональной или управленческой роли. Требуют индивидуального плана развития и удержания.

### Высокая производительность + низкий потенциал

**Ключевые эксперты**

Сильны в текущей роли и приносят компании значительную пользу. Необязательно должны становиться руководителями. Для них важны экспертный рост, признание, деньги и интересные задачи.

### Средняя производительность + высокий потенциал

**Кандидаты на рост**

Имеют способности для перехода на следующий уровень, но пока не показывают достаточно стабильного результата. Нуждаются в фокусе, наставничестве и проверке на более сложных задачах.

### Средняя производительность + средний потенциал

**Основа команды**

Соответствуют ожиданиям и обеспечивают устойчивую работу. Могут перейти в более сильную категорию через развитие конкретных навыков и повышение автономности.

### Средняя производительность + низкий потенциал

**Стабильные исполнители**

Надёжно выполняют понятные задачи в рамках текущей роли. Основная задача руководителя — поддерживать качество, мотивацию и соответствие роли потребностям команды.

### Низкая производительность + высокий потенциал

**Нереализованный потенциал**

Способности есть, но они не превращаются в результат. Важно разобраться в причинах: неверная роль, недостаток опыта, низкая мотивация, слабое управление или личная ответственность. Сотруднику нужен короткий и конкретный план улучшения.

### Низкая производительность + средний потенциал

**Зона риска**

Сотрудник не соответствует ожиданиям, а возможность дальнейшего роста пока не подтверждена. Требуются честная обратная связь, конкретные цели и ограниченный срок на исправление ситуации.

### Низкая производительность + низкий потенциал

**Несоответствие роли**

Сотрудник не даёт необходимого результата и не демонстрирует способности к росту в текущей роли. Необходимо рассмотреть перевод на более подходящую позицию или прекращение сотрудничества.

__

## Категории A, B и C

Категории A, B и C не заменяют матрицу 9-Box. Они переводят оценку в конкретное управленческое решение.

### Категория A — растим и удерживаем

Как правило, сюда входят сотрудники с высокой производительностью независимо от типа дальнейшего роста: управленческого, карьерного или экспертного.

Сотрудник категории A может получить:

* рост дохода;
* повышение грейда;
* больше ответственности;
* специальные условия удержания;
* сложные и значимые проекты;
* участие в кадровом резерве;
* экспертную или управленческую траекторию роста.

Категория A не означает автоматическое повышение. Решение должно учитывать масштаб результата, готовность к следующему уровню и потребности компании.

### Категория B — фокусируем и развиваем

Сюда входят сотрудники со стабильным результатом, а также сотрудники с высоким потенциалом, который пока не подтверждён результатами.

Сотрудник категории B получает:

* понятные направления развития;
* наставника или поддержку руководителя;
* ограниченный набор приоритетов;
* план развития на 60–90 дней;
* более сложные задачи для проверки потенциала;
* возможность перейти в категорию A.

Сотрудник категории B не получает повышение или рост дохода авансом. Сначала новый уровень должен быть подтверждён результатом.

### Категория C — исправляем ситуацию или принимаем решение

Сюда входят сотрудники, которые длительное время не соответствуют ожиданиям, требуют избыточного контроля или негативно влияют на результат команды.

Сотрудник категории C получает:

* честную и прямую обратную связь;
* конкретные примеры несоответствия ожиданиям;
* PIP — план улучшения результата;
* короткий срок на исправление;
* итоговое решение по роли или дальнейшему сотрудничеству.

Сотрудник категории C не получает повышение грейда или дохода.

Высокий потенциал сам по себе не защищает от категории C. Если сотрудник систематически не даёт результат, потенциал должен быть подтверждён изменениями в работе.

__

## PIP — план улучшения результата

PIP применяется к сотрудникам категории C, а также в случаях серьёзной или продолжительной просадки результатов.

PIP — это не формальность и не скрытая подготовка к увольнению. Это последняя понятная возможность исправить ситуацию.

В плане должно быть указано:

* что именно не соответствует ожиданиям;
* какие факты и примеры это подтверждают;
* какой результат должен быть достигнут;
* в какой срок он должен быть достигнут;
* как часто будут проходить контрольные встречи;
* какую поддержку получит сотрудник;
* кто отвечает за сопровождение;
* что произойдёт, если необходимого результата не будет.

Критерии PIP должны быть конкретными и проверяемыми. Формулировки вроде «работать лучше», «быть инициативнее» или «повысить вовлечённость» без измеримых признаков результата использовать нельзя.

__

## Как оцениваются руководители

Руководитель оценивается не только по личной работе, но прежде всего по результату своей команды.

Смотрим:

* какие бизнес-результаты даёт команда;
* сколько сотрудников категории A руководитель выращивает;
* сколько сотрудников категории C он продолжает терпеть без действий;
* насколько команда автономна;
* насколько сотрудникам понятны цели и приоритеты;
* насколько быстро принимаются решения;
* как команда влияет на деньги, скорость и качество;
* насколько руководитель умеет давать обратную связь;
* насколько он способен принимать сложные кадровые решения;
* сохраняет ли команда устойчивость при росте и изменениях.

**Главный вопрос:** команда становится сильнее благодаря этому руководителю или остаётся зависимой от его постоянного вмешательства?

Хороший руководитель — не тот, у кого все всегда довольны.

Хороший руководитель — тот, чья команда даёт результат, развивается, сохраняет сильных сотрудников и вовремя решает проблемы со слабыми.

__

## Какие решения помогает принимать система

9-Box и категории A/B/C помогают:

* принимать решения о повышении грейда и дохода;
* формировать кадровый резерв;
* определять сотрудников для сложных проектов;
* строить индивидуальные планы развития;
* находить будущих руководителей и экспертов;
* своевременно замечать просадку результатов;
* оценивать качество руководителей;
* снижать зависимость от субъективного мнения;
* принимать сложные кадровые решения на основании фактов.`;

function AboutAccordion() {
  const [open, setOpen] = useState(false);
  return (
    <div className="card mb-5 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-canvas/60 transition-colors"
      >
        <span className="text-sm font-medium text-ink">Оценка перформанса и матрица 9-Box</span>
        <ChevronDownIcon
          className={`w-4 h-4 text-stone transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <div className="px-5 pb-6 pt-6 border-t border-cloud">
          {/* Выделенное саммари — связка четырёх элементов оценки. */}
          <div className="mb-6 rounded-[12px] bg-lime-dim border border-lime/30 px-4 py-3.5 text-sm leading-relaxed text-graphite">
            <strong className="font-medium text-ink">Критерии</strong> дают оценку,{' '}
            <strong className="font-medium text-ink">9-Box</strong> показывает положение
            сотрудника, <strong className="font-medium text-ink">A/B/C</strong> определяет
            управленческое решение, <strong className="font-medium text-ink">PIP</strong> —
            действие при просадке.
          </div>
          <MarkdownContent text={NINE_BOX_DOC} />
        </div>
      )}
    </div>
  );
}

export default function MatrixView({ users }: { users: UserRow[] }) {
  const eligible = useMemo(
    () => users.filter((u) => (u.role === 'designer' || u.role === 'stardiz') && u.active),
    [users],
  );

  const [placements, setPlacements] = useState<Map<number, { potential: Level; performance: Level }>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [activeUserId, setActiveUserId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/team-matrix')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: Placement[]) => {
        if (cancelled) return;
        const m = new Map<number, { potential: Level; performance: Level }>();
        for (const p of data) {
          m.set(p.userId, { potential: p.potentialLevel, performance: p.performanceLevel });
        }
        setPlacements(m);
      })
      .catch(() => {
        /* fallback: пустые размещения */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const usersByCell = useMemo(() => {
    const map = new Map<string, UserRow[]>();
    const unassigned: UserRow[] = [];
    for (const u of eligible) {
      const p = placements.get(u.id);
      if (!p) {
        unassigned.push(u);
        continue;
      }
      const key = cellId(p.potential, p.performance);
      const arr = map.get(key) ?? [];
      arr.push(u);
      map.set(key, arr);
    }
    return { map, unassigned };
  }, [eligible, placements]);

  const activeUser = activeUserId !== null ? eligible.find((u) => u.id === activeUserId) : null;

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith('user-')) {
      setActiveUserId(parseInt(id.slice(5), 10));
    }
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveUserId(null);
    const activeId = String(e.active.id);
    if (!activeId.startsWith('user-') || !e.over) return;
    const userId = parseInt(activeId.slice(5), 10);
    const overId = String(e.over.id);

    const prev = placements.get(userId) ?? null;

    let next: { potential: Level; performance: Level } | null = null;
    if (overId === UNASSIGNED_ID) {
      next = null;
    } else {
      const parsed = parseCellId(overId);
      if (!parsed) return;
      next = parsed;
    }

    // ничего не меняется
    if (
      (prev === null && next === null) ||
      (prev !== null &&
        next !== null &&
        prev.potential === next.potential &&
        prev.performance === next.performance)
    ) {
      return;
    }

    // optimistic update
    setPlacements((curr) => {
      const m = new Map(curr);
      if (next === null) m.delete(userId);
      else m.set(userId, next);
      return m;
    });
    setSaving((s) => new Set(s).add(userId));

    try {
      const res =
        next === null
          ? await fetch(`/api/team-matrix/${userId}`, { method: 'DELETE' })
          : await fetch(`/api/team-matrix/${userId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                potentialLevel: next.potential,
                performanceLevel: next.performance,
              }),
            });
      if (!res.ok) {
        // rollback
        setPlacements((curr) => {
          const m = new Map(curr);
          if (prev === null) m.delete(userId);
          else m.set(userId, prev);
          return m;
        });
        const j = await res.json().catch(() => ({}));
        alert(`Не удалось сохранить: ${j.error ?? res.statusText}`);
      }
    } catch {
      setPlacements((curr) => {
        const m = new Map(curr);
        if (prev === null) m.delete(userId);
        else m.set(userId, prev);
        return m;
      });
      alert('Ошибка сети — изменение не сохранилось');
    } finally {
      setSaving((s) => {
        const n = new Set(s);
        n.delete(userId);
        return n;
      });
    }
  }

  if (loading) {
    return (
      <>
        <AboutAccordion />
        <div className="flex gap-5 items-start">
          <div className="w-[240px] h-[400px] rounded-[14px] bg-cloud/40 animate-pulse shrink-0" />
          <div className="flex-1 grid grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-[180px] rounded-[14px] bg-cloud/40 animate-pulse" />
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <AboutAccordion />
      <div className="flex gap-5 items-stretch">
        <UnassignedZone users={usersByCell.unassigned} saving={saving} />

        {/* Контейнер матрицы с осями */}
        <div className="flex-1 flex gap-2.5">
          {/* Y-ось: Потенциал */}
          <div className="flex flex-col items-center justify-center w-7 shrink-0">
            <div className="text-[10px]  text-stone font-medium whitespace-nowrap"
                 style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
              Потенциал ↑
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-2">
            {/* 3x3 grid: строки сверху вниз = high, mid, low */}
            <div className="grid grid-cols-3 gap-3 flex-1">
              {CELLS.map((meta) => (
                <MatrixCell
                  key={cellId(meta.potential, meta.performance)}
                  meta={meta}
                  users={usersByCell.map.get(cellId(meta.potential, meta.performance)) ?? []}
                  saving={saving}
                />
              ))}
            </div>
            {/* X-ось: Производительность */}
            <div className="text-center text-[10px]  text-stone font-medium pt-1">
              Производительность →
            </div>
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeUser ? (
          <div className="rotate-2 shadow-soft-md">
            <UserCard user={activeUser} showGrade={!!activeUser.effectiveGrade} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
