export default function Loading() {
  return (
    <main className="max-w-[1400px] mx-auto px-8 pt-8 pb-16">
      <div className="h-3 w-40 bg-cloud rounded mb-3 animate-pulse" />
      <div className="h-10 w-64 bg-cloud rounded-card animate-pulse mb-6" />
      <div className="grid grid-cols-12 gap-8">
        <aside className="col-span-3">
          <div className="card p-5 h-80 animate-pulse" />
        </aside>
        <main className="col-span-6 space-y-5">
          <div className="card h-64 animate-pulse" />
          <div className="card h-64 animate-pulse" />
        </main>
        <aside className="col-span-3">
          <div className="card h-96 animate-pulse" />
        </aside>
      </div>
    </main>
  );
}
