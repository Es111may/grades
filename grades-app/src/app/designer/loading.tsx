export default function Loading() {
  return (
    <main className="max-w-[1300px] mx-auto px-8 pt-8 pb-16">
      <div className="h-10 w-64 bg-cloud rounded-card animate-pulse mb-2" />
      <div className="h-4 w-96 bg-cloud/60 rounded animate-pulse mb-6" />
      <div className="card p-7 mb-6 h-32 animate-pulse" />
      <div className="grid grid-cols-5 gap-3 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card h-24 animate-pulse" />
        ))}
      </div>
      <div className="card h-96 animate-pulse" />
    </main>
  );
}
