import { Bone, Line } from './Bone';

/**
 * Заглушки лениво загружаемых кусков портрета (next/dynamic): пока едет код
 * компонента, на его месте каркас той же высоты — страница не прыгает.
 *
 * Правило: геометрия (отступы, высоты строк, рамки) повторяет состояние
 * загрузки самого компонента. Когда код приехал, компонент первым кадром
 * рисует свою загрузку — и она ложится ровно на каркас. Меняешь разметку
 * загрузки у компонента — поправь и заглушку здесь.
 *
 * Файл без хуков и тяжёлых импортов: он попадает в First Load страниц.
 */

/**
 * Радар (chart.js) — пока грузится chart.js. Контейнер с высотой задаёт
 * родитель (320 у профиля навыков, 180/240 у мини-радаров групп), круг
 * занимает его середину — примерно там, где встанет пятиугольник.
 */
export function RadarSkeleton() {
  return (
    <div className="h-full w-full flex items-center justify-center" aria-busy="true">
      <Bone className="h-4/5 aspect-square rounded-full bg-cloud/40" />
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
          <Line className="h-2.5 w-[440px] max-w-full" />
        </div>
      </div>
      <div className="px-6 py-5 space-y-5">
        {/* Период · дропдаун · фильтры */}
        <div className="flex items-center gap-3">
          <Bone className="h-10 w-[172px] rounded-pill" />
          <Bone className="h-9 w-[120px] rounded-card" />
          <Bone className="h-9 w-[104px] rounded-card" />
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
 * компенсаций (SalaryHeadline, variant card). salary-sensitive обязателен:
 * при скрытых зарплатах заглушки тоже нет, и позиция 9-Box сразу
 * растягивается на весь слот.
 */
export function SalaryCardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`salary-sensitive card flex gap-3 px-5 py-[13px] ${className}`}
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
