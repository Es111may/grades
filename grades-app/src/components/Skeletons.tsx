import { ChevronDownIcon } from '@/components/icons';

/**
 * Заглушки для лениво загружаемых кусков (next/dynamic): пока едет код
 * компонента, на его месте каркас той же высоты — страница не прыгает.
 *
 * Правило: геометрия (отступы, высоты строк, рамки) повторяет состояние
 * загрузки самого компонента. Когда код приехал, компонент первым кадром
 * рисует свою загрузку — и она ложится ровно на каркас. Меняешь разметку
 * загрузки у компонента — поправь и заглушку здесь.
 *
 * Файл без хуков и тяжёлых импортов: он попадает в First Load страниц.
 * Тон — как у PageSkeleton: bg-cloud + animate-pulse.
 */

/** Полоска-заглушка вместо строки текста или контрола. */
function Bar({ className = '' }: { className?: string }) {
  return <div className={`bg-cloud rounded animate-pulse ${className}`} />;
}

// ─── Портрет дизайнера ────────────────────────────────────────────────

/**
 * Радар (chart.js) — пока грузится chart.js. Контейнер с высотой задаёт
 * родитель (320 у профиля навыков, 180/240 у мини-радаров групп), круг
 * занимает его середину — примерно там, где встанет пятиугольник.
 */
export function RadarSkeleton() {
  return (
    <div className="h-full w-full flex items-center justify-center" aria-busy="true">
      <div className="h-4/5 aspect-square rounded-full bg-cloud/40 animate-pulse" />
    </div>
  );
}

/**
 * Карточка «Перформанс» (PerformanceDashboard) в состоянии загрузки:
 * шапка с заголовком и строкой описания, ряд контролов (высота сегмента —
 * h-10) и строка «Загрузка данных…» с тем же py-12.
 */
export function PerformanceSkeleton() {
  return (
    <section className="card mb-6 overflow-hidden" aria-busy="true">
      <div className="px-6 py-4 border-b border-cloud bg-canvas/30">
        <h3 className="text-base font-medium text-ink leading-tight">Перформанс</h3>
        {/* Строка описания: text-xs · leading-relaxed = 19.5px */}
        <div className="mt-1.5 h-[19.5px] flex items-center">
          <Bar className="h-2.5 w-[440px] max-w-full bg-cloud/60" />
        </div>
      </div>
      <div className="px-6 py-5 space-y-5">
        {/* Период · дропдаун · фильтры */}
        <div className="flex items-center gap-3">
          <Bar className="h-10 w-[172px] rounded-pill" />
          <Bar className="h-9 w-[120px] rounded-card" />
          <Bar className="h-9 w-[104px] rounded-card" />
        </div>
        <div className="py-12 text-center text-sm text-stone italic">Загрузка данных…</div>
      </div>
    </section>
  );
}

/** Карточка «ИПР» (ChecklistsSection) — один в один её состояние загрузки. */
export function ChecklistsSkeleton() {
  return (
    <section className="card mb-6 overflow-hidden" aria-busy="true">
      <div className="px-6 py-4 border-b border-cloud bg-canvas/30 flex items-center justify-between">
        <h3 className="text-base font-medium text-ink leading-tight">ИПР</h3>
      </div>
      <div className="px-6 py-5 text-sm text-stone italic">Загрузка…</div>
    </section>
  );
}

/**
 * Карточка «Зарплата» (SalaryCard) — один в один её вид, пока идёт запрос
 * компенсаций. salary-sensitive обязателен: при скрытых зарплатах заглушки
 * тоже нет, и позиция 9-Box сразу растягивается на весь слот.
 */
export function SalaryCardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`salary-sensitive card flex gap-3 px-5 pt-[13px] pb-4 ${className}`}
      aria-busy="true"
    >
      <div className="flex-1 min-w-0">
        <div className="min-h-6 flex items-center gap-2 flex-wrap">
          <span className="label-mono text-stone">Зарплата</span>
        </div>
        <div className="mt-1.5 min-h-[25px] flex items-center">
          <span className="block h-4 w-32 rounded bg-cloud animate-pulse">
            <span className="sr-only">Загрузка</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Страница «Команда» ───────────────────────────────────────────────

/**
 * Канбан (Отделы · Лиды · Уровни): колонки 280px с карточками людей.
 * minHeight — высота прежнего вида: пока грузится код, страница не
 * схлопывается и скролл не прыгает.
 */
export function KanbanSkeleton({ minHeight }: { minHeight?: number }) {
  return (
    <div style={{ minHeight }} aria-busy="true">
      <div className="flex gap-3 pb-2 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-[280px] shrink-0 rounded-card bg-cloud/40">
            <div className="px-3.5 pt-3 pb-2 h-[37px] flex items-center justify-between">
              <Bar className="h-2.5 w-24" />
              <Bar className="h-2.5 w-4" />
            </div>
            <div className="px-2 pb-2 space-y-1.5">
              {/* 4/3/4/3 карточки — колонки разной длины, как в жизни */}
              {Array.from({ length: 4 - (i % 2) }).map((_, j) => (
                <div
                  key={j}
                  className="h-[62px] rounded-[10px] border border-cloud bg-snow/70 animate-pulse"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 9-Box: свёрнутый аккордеон методики и сетка 3×3 с зоной «Без позиции» —
 * та же сетка, что MatrixView показывает, пока грузит расстановку.
 * minHeight — как у KanbanSkeleton.
 */
export function MatrixSkeleton({ minHeight }: { minHeight?: number }) {
  return (
    <div style={{ minHeight }} aria-busy="true">
      <div className="card mb-5 overflow-hidden">
        <div className="w-full flex items-center justify-between px-5 py-3.5">
          <span className="text-sm font-medium text-ink">Оценка перформанса и матрица 9-Box</span>
          <ChevronDownIcon className="w-4 h-4 text-stone" />
        </div>
      </div>
      <div className="flex gap-5 items-start">
        <div className="w-[240px] h-[400px] rounded-[14px] bg-cloud/40 animate-pulse shrink-0" />
        <div className="flex-1 grid grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-[180px] rounded-[14px] bg-cloud/40 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
