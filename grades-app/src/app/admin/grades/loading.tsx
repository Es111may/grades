import { HeaderSkeleton } from '@/components/PageSkeleton';

export default function Loading() {
  return (
    <main className="max-w-[1200px] mx-auto px-8 pt-10 pb-16">
      <HeaderSkeleton />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-6">
            <div className="grid grid-cols-[200px_1fr_auto] gap-6 items-center">
              <div className="h-6 w-24 bg-cloud rounded animate-pulse" />
              <div className="grid grid-cols-3 gap-4">
                <div className="h-8 bg-cloud/60 rounded animate-pulse" />
                <div className="h-8 bg-cloud/60 rounded animate-pulse" />
                <div className="h-8 bg-cloud/60 rounded animate-pulse" />
              </div>
              <div className="h-7 w-24 bg-cloud rounded-pill animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
