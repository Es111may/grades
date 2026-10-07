import { Bone, CardBone, Line } from './Bone';

/**
 * Каркасы целых страниц — для loading.tsx маршрутов. Показываются, пока
 * серверный компонент тянет данные: пользователь сразу видит каркас
 * интерфейса, без белого экрана.
 */

export function HeaderSkeleton() {
  return (
    <div className="flex items-end justify-between mb-6 gap-4">
      <Bone className="h-10 w-48 rounded-card" />
      <Bone className="h-9 w-44 rounded-pill" />
    </div>
  );
}

export function ToolbarSkeleton() {
  return (
    <div className="flex items-center gap-3 mb-5 flex-wrap">
      <Bone className="h-9 w-[360px] rounded-pill" />
      <Bone className="h-9 w-[320px] rounded-pill" />
      <Bone className="h-9 w-[280px] ml-auto rounded-card" />
    </div>
  );
}

export function CardListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="px-5 py-3.5 border-b border-cloud last:border-0 flex items-center gap-3"
        >
          <Bone className="w-8 h-8 rounded-pill" />
          <div className="flex-1">
            <Bone className="h-3.5 w-40 mb-1.5" />
            <Line className="h-2.5 w-56" />
          </div>
          <Bone className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function GridCardsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <Bone className="w-11 h-11 rounded-pill" />
            <div className="flex-1">
              <Bone className="h-4 w-44 mb-1.5" />
              <Line className="h-3 w-28" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-cloud">
            <Line className="h-6" />
            <Line className="h-6" />
            <Line className="h-6" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** «Команда», матрица скиллов (list) и раздел лида (grid). */
export default function PageSkeleton({
  variant = 'list',
}: {
  variant?: 'list' | 'grid';
}) {
  return (
    <main className="max-w-[1240px] mx-auto px-8 pt-10 pb-16">
      <HeaderSkeleton />
      <ToolbarSkeleton />
      {variant === 'grid' ? <GridCardsSkeleton /> : <CardListSkeleton />}
    </main>
  );
}

/** Портрет дизайнера — и свой (/designer), и глазами лида (/lead/portrait). */
export function PortraitPageSkeleton() {
  return (
    <main className="max-w-[1300px] mx-auto px-8 pt-8 pb-16">
      <Bone className="h-10 w-64 rounded-card mb-2" />
      <Line className="h-4 w-96 mb-6" />
      <CardBone className="p-7 mb-6 h-32" />
      <div className="grid grid-cols-5 gap-3 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <CardBone key={i} className="h-24" />
        ))}
      </div>
      <CardBone className="h-96" />
    </main>
  );
}

/** Форма оценки: навигация по группам, скиллы, итог. */
export function AssessPageSkeleton() {
  return (
    <main className="max-w-[1240px] mx-auto px-8 pt-8 pb-16">
      <Bone className="h-3 w-40 mb-3" />
      <Bone className="h-10 w-64 rounded-card mb-6" />
      <div className="grid grid-cols-12 gap-8">
        <aside className="col-span-3">
          <CardBone className="p-5 h-80" />
        </aside>
        <main className="col-span-6 space-y-5">
          <CardBone className="h-64" />
          <CardBone className="h-64" />
        </main>
        <aside className="col-span-3">
          <CardBone className="h-96" />
        </aside>
      </div>
    </main>
  );
}

/** Пороги грейдов: строка на грейд — название, пороги билдов, гейты. */
export function GradesPageSkeleton() {
  return (
    <main className="max-w-[1240px] mx-auto px-8 pt-10 pb-16">
      <HeaderSkeleton />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-6">
            <div className="grid grid-cols-[200px_1fr_auto] gap-6 items-center">
              <Bone className="h-6 w-24" />
              <div className="grid grid-cols-3 gap-4">
                <Line className="h-8" />
                <Line className="h-8" />
                <Line className="h-8" />
              </div>
              <Bone className="h-7 w-24 rounded-pill" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
