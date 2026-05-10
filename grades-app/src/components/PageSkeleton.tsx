/**
 * Скелетоны загрузки. Показываются пока серверный компонент тянет данные —
 * пользователь видит каркас интерфейса сразу, без белого экрана.
 */

export function HeaderSkeleton() {
  return (
    <div className="flex items-end justify-between mb-6 gap-4">
      <div className="h-10 w-48 bg-cloud rounded-card animate-pulse" />
      <div className="h-9 w-44 bg-cloud rounded-pill animate-pulse" />
    </div>
  );
}

export function ToolbarSkeleton() {
  return (
    <div className="flex items-center gap-3 mb-5 flex-wrap">
      <div className="h-9 w-[360px] bg-cloud rounded-pill animate-pulse" />
      <div className="h-9 w-[320px] bg-cloud rounded-pill animate-pulse" />
      <div className="h-9 w-[280px] ml-auto bg-cloud rounded-card animate-pulse" />
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
          <div className="w-8 h-8 rounded-pill bg-cloud animate-pulse" />
          <div className="flex-1">
            <div className="h-3.5 w-40 bg-cloud rounded animate-pulse mb-1.5" />
            <div className="h-2.5 w-56 bg-cloud/60 rounded animate-pulse" />
          </div>
          <div className="h-3 w-20 bg-cloud animate-pulse rounded" />
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
            <div className="w-11 h-11 rounded-pill bg-cloud animate-pulse" />
            <div className="flex-1">
              <div className="h-4 w-44 bg-cloud rounded animate-pulse mb-1.5" />
              <div className="h-3 w-28 bg-cloud/60 rounded animate-pulse" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-cloud">
            <div className="h-6 bg-cloud/60 rounded animate-pulse" />
            <div className="h-6 bg-cloud/60 rounded animate-pulse" />
            <div className="h-6 bg-cloud/60 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PageSkeleton({
  variant = 'list',
}: {
  variant?: 'list' | 'grid';
}) {
  return (
    <main className="max-w-[1400px] mx-auto px-8 pt-10 pb-16">
      <HeaderSkeleton />
      <ToolbarSkeleton />
      {variant === 'grid' ? <GridCardsSkeleton /> : <CardListSkeleton />}
    </main>
  );
}
