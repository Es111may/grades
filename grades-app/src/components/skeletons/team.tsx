import { ChevronDownIcon } from '@/components/icons';
import { Bone } from './Bone';

/**
 * «Команда»: заглушки лениво загружаемых видов (next/dynamic) — правило то
 * же, что у portrait.tsx: геометрия повторяет загрузку самого вида. Файл
 * без хуков — он в First Load «Команды».
 */

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
              <Bone className="h-2.5 w-24" />
              <Bone className="h-2.5 w-4" />
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
 * Сетка 9-Box без людей: зона «Без позиции» слева и 3×3. Её же MatrixView
 * рисует, пока грузит расстановку, — поэтому каркас и загрузка совпадают.
 */
export function MatrixGridSkeleton() {
  return (
    <div className="flex gap-5 items-start">
      <Bone className="w-[240px] h-[400px] rounded-[14px] bg-cloud/40 shrink-0" />
      <div className="flex-1 grid grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Bone key={i} className="h-[180px] rounded-[14px] bg-cloud/40" />
        ))}
      </div>
    </div>
  );
}

/**
 * 9-Box: свёрнутый аккордеон методики и сетка 3×3 с зоной «Без позиции».
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
      <MatrixGridSkeleton />
    </div>
  );
}
