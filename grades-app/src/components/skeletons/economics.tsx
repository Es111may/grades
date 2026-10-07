import { Bone, Line } from './Bone';

/**
 * Каркасы «Экономики»: пока сервер ждёт HR (до 8 с) и пока едет chart.js.
 * Геометрия повторяет страницу: заголовок, ряд контролов (h-10), bento
 * 188 px, карточки блоков — страница после загрузки не прыгает.
 */

/** «Динамика по месяцам», пока грузится chart.js: шапка, считывание, три панели. */
export function MonthlySkeleton() {
  return (
    <section className="card p-5 min-w-0" aria-busy="true">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-medium">Динамика по месяцам</h3>
          <Line className="h-2.5 w-40 mt-1.5" />
        </div>
        <Bone className="h-8 w-[148px] rounded-pill" />
      </div>
      <Bone className="mt-4 h-8 rounded-[10px] bg-cloud/50" />
      {/* Панели: 168 + 84 + 114 и подписи над ними */}
      <div className="mt-3 space-y-2">
        {[168, 84, 114].map((h) => (
          <div key={h}>
            <Line className="h-2.5 w-24 ml-[46px] mb-1" />
            <Bone className="rounded-[8px] bg-cloud/30" style={{ height: h }} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Вся страница — loading.tsx маршрута. */
export function EconomicsPageSkeleton() {
  return (
    <main className="max-w-[1240px] mx-auto px-8 pt-[164px] pb-16" aria-busy="true">
      <div className="text-center mb-[164px]">
        <h1 className="font-display text-[64px] leading-none font-medium tracking-[-0.035em]">Экономика</h1>
      </div>
      <div className="flex items-center gap-1.5 mb-5">
        <Bone className="h-10 w-[132px] rounded-pill" />
        <div className="ml-auto flex items-center gap-1.5">
          <Bone className="h-10 w-[214px] rounded-pill" />
          <Bone className="h-10 w-10 rounded-pill" />
        </div>
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-5 min-h-[188px] flex flex-col">
              <Bone className="h-2.5 w-20" />
              <Bone className="h-10 w-32 mt-3" />
              <Line className="h-2.5 w-36 mt-3" />
              <Line className="h-1 w-full mt-auto rounded-full" />
            </div>
          ))}
        </div>
        <section className="card p-5">
          <h3 className="text-base font-medium">Куда ушли деньги с 1 января</h3>
          <div className="mt-8 h-[176px] flex items-end justify-around">
            {[120, 40, 70, 50, 130, 24].map((h, i) => (
              <Bone key={i} className="w-11 rounded-[4px] bg-cloud/50" style={{ height: h }} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-6 mt-[76px] pt-5 border-t border-cloud/60">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <Bone className="h-2.5 w-16" />
                <Bone className="h-6 w-24 mt-3" />
              </div>
            ))}
          </div>
        </section>
        <section className="card overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <h3 className="text-base font-medium">По уровням</h3>
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[57px] border-t border-cloud flex items-center gap-6 px-4">
              <Bone className="h-3 w-20" />
              <Line className="h-3 w-14" />
              <Bone className="h-1.5 flex-1 rounded-full bg-cloud/50" />
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
