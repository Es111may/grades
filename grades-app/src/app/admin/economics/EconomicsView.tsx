'use client';

/**
 * «Экономика» (Phase 23.6b) — клиентская часть страницы /admin/economics.
 *
 * Сервер (page.tsx) отдаёт людей с журналом ставок и наложенными данными
 * Грейдов; всё остальное считается здесь чистыми функциями lib/economics —
 * фильтр «Отдел» применяется ко всей странице сразу.
 *
 * Суммы — «на руки», как в HR; «Для компании» умножает их на 1 + налоговую
 * нагрузку из настроек. Выбор режима — в localStorage. Каждая сумма — через
 * Money: кнопка-глаз в шапке прячет рубли, проценты и численность остаются.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import TitleAurora from '@/components/TitleAurora';
import FilterDropdown, { type FilterOption } from '@/components/FilterDropdown';
import Tooltip from '@/components/Tooltip';
import Segmented from '@/components/Segmented';
import EmptyState from '@/components/EmptyState';
import { GearIcon, InfoIcon, SearchIcon } from '@/components/icons';
import {
  avgHireSalary,
  bandSummary,
  bridge,
  churn,
  cohortMedianChange,
  companyFotAt,
  companyTurnover,
  coverage,
  econWindow,
  fmtDate,
  inDept,
  isActiveAt,
  levelRows,
  monthKey,
  monthlySeries,
  nf,
  plural,
  addDays,
  showYoY,
  snapshot,
  taxMultiplier,
  type DeptFilter,
  type EconDept,
  type EconomicsDataset,
  type MoneyMode,
} from '@/lib/economics';
import type { EconomicsSettings } from '@/lib/settings';
import { DEPT_LABEL, KContext } from './ui';
import Bento from './Bento';
import MoneyBridge from './MoneyBridge';
import LevelsTable from './LevelsTable';
import ChurnCard from './ChurnCard';
import SettingsDialog from './SettingsDialog';
import { MonthlySkeleton } from './skeletons';

// chart.js — тяжёлый и читает CSS-переменные из DOM: только в браузере
const MonthlyCard = dynamic(() => import('./MonthlyCard'), { ssr: false, loading: () => <MonthlySkeleton /> });

const MODE_KEY = 'economics-money';
const DEPTS: EconDept[] = ['navigator', 'visioner', 'creator', 'leads'];

function readMode(): MoneyMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'company' ? 'company' : 'hand';
  } catch {
    return 'hand';
  }
}

function writeMode(m: MoneyMode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    // приватный режим — выбор просто не переживёт перезагрузку
  }
}

export default function EconomicsView({
  dataset,
  initialSettings,
  asOfLabel,
  stale,
}: {
  /** null — HR не ответил, а удачной выборки ещё не было. */
  dataset: EconomicsDataset | null;
  initialSettings: EconomicsSettings;
  /** «01.10.2026, 09:40» — когда пришли данные HR. */
  asOfLabel: string | null;
  /** HR сейчас не ответил — показываем последнюю удачную выборку. */
  stale: boolean;
}) {
  const router = useRouter();
  const [dept, setDept] = useState<DeptFilter>('all');
  const [mode, setModeState] = useState<MoneyMode>('hand');
  const [settings, setSettings] = useState(initialSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement | null>(null);

  // Режим сумм — после гидрации: на сервере localStorage нет
  useEffect(() => setModeState(readMode()), []);
  const setMode = (m: MoneyMode) => {
    setModeState(m);
    writeMode(m);
  };
  const k = taxMultiplier(mode, settings.payrollTaxRate);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    gearRef.current?.focus();
  }, []);

  const today = dataset?.today ?? '';
  const w = useMemo(() => (today ? econWindow(today) : null), [today]);

  const deptOptions = useMemo<FilterOption<DeptFilter>[]>(() => {
    if (!dataset) return [{ value: 'all', label: 'Все' }];
    const active = dataset.people.filter((p) => isActiveAt(p, dataset.today));
    const count = (f: DeptFilter) => active.filter((p) => inDept(p, f)).length;
    const opts: FilterOption<DeptFilter>[] = [
      { value: 'all', label: 'Все', count: count('all') },
      ...DEPTS.map((d) => ({ value: d as DeptFilter, label: DEPT_LABEL[d], count: count(d) })),
    ];
    // «Без отдела» — только если такие есть (или выбран)
    const none = count('none');
    if (none || dept === 'none') opts.push({ value: 'none', label: 'Без отдела', count: none });
    return opts;
  }, [dataset, dept]);

  const view = useMemo(() => {
    if (!dataset || !w) return null;
    const people = dataset.people.filter((p) => inDept(p, dept));
    const series = monthlySeries(people, dataset.company, w.today);
    const b = bridge(people, w);
    const rows = levelRows(people, w);
    const now = snapshot(people, w.today);
    const ago = snapshot(people, w.yearAgo);
    const { banded, above } = bandSummary(rows);
    const companyNow = companyFotAt(dataset.company, monthKey(w.today));
    const companyAgo = companyFotAt(dataset.company, monthKey(w.yearAgo));
    return {
      people,
      series,
      b,
      rows,
      bento: {
        now,
        ago,
        yoy: showYoY(now, ago),
        series,
        bridge: b,
        targetRate: settings.fotGrowthTarget,
        banded,
        above,
        cohort: cohortMedianChange(people, w.jan1, w.today),
        companyFotNow: companyNow,
        shareNow: companyNow ? (now.fot / companyNow) * 100 : null,
        shareAgo: companyAgo ? (ago.fot / companyAgo) * 100 : null,
      },
      churn: churn(people, dataset.reasons, w, series),
      hireAvg: avgHireSalary(people, w),
      coverage: coverage(people, w.today),
      companyTurnover: companyTurnover(dataset.company, w.today),
    };
  }, [dataset, w, dept, settings.fotGrowthTarget]);

  const filtered = dept !== 'all';
  const empty = view != null && view.bento.now.count === 0 && view.b.startCount === 0;

  return (
    <KContext.Provider value={k}>
      <main className="max-w-[1240px] mx-auto px-8 pt-[164px] pb-16">
        <div data-comment-anchor="page-title" className="text-center mb-[164px] animate-fade-up title-halo">
          <TitleAurora />
          <h1 className="font-display text-[64px] leading-none font-medium tracking-[-0.035em] text-balance">
            Экономика
          </h1>
        </div>

        {/* Ряд контролов, как на «Команде»: фильтр слева, суммы и настройки справа */}
        <div
          data-comment-anchor="economics-controls"
          className="flex items-center gap-1.5 mb-5 flex-wrap animate-fade-up"
          style={{ animationDelay: '70ms' }}
        >
          {dataset && <FilterDropdown label="Отдел" value={dept} options={deptOptions} onChange={setDept} />}
          {filtered && (
            <button
              type="button"
              onClick={() => setDept('all')}
              className="btn-ghost h-10 py-0 text-[13px] active:scale-[0.96]"
            >
              Сбросить
            </button>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <Segmented
              label="Суммы"
              press
              value={mode}
              onChange={setMode}
              options={[
                { value: 'hand', label: 'На руки' },
                {
                  value: 'company',
                  label: 'Для компании',
                  wrap: (item) => (
                    <Tooltip
                      align="right"
                      maxWidth={260}
                      text={`С налогами и взносами: на руки × ${nf(1 + settings.payrollTaxRate, 2)}. Коэффициент — в настройках.`}
                    >
                      {item}
                    </Tooltip>
                  ),
                },
              ]}
            />
            <Tooltip text="Настройки" align="right">
              <button
                ref={gearRef}
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-label="Настройки экономики"
                aria-haspopup="dialog"
                className="w-10 h-10 rounded-pill bg-ink/5 border border-ink/5 text-stone flex items-center justify-center
                           hover:text-ink hover:bg-ink/10 active:scale-[0.96]
                           transition-[color,background-color,transform] duration-150"
              >
                <GearIcon className="w-[18px] h-[18px]" />
              </button>
            </Tooltip>
          </div>
        </div>

        {stale && asOfLabel && (
          <div className="flex items-center gap-2 mb-4 text-xs text-stone animate-fade-in" role="status">
            <InfoIcon className="w-3.5 h-3.5 text-sunset shrink-0" />
            HR-портал сейчас не отвечает — показываем данные от {asOfLabel}
          </div>
        )}

        {!dataset || !view ? (
          <div className="card py-6 animate-fade-in">
            <EmptyState
              icon={<InfoIcon className="w-5 h-5" />}
              title="HR-портал не ответил"
              hint="Экономика считается из HR. Запрос дорабатывает в фоне — обновите страницу через минуту."
              action={
                <button type="button" onClick={() => router.refresh()} className="btn-secondary btn-sm active:scale-[0.96]">
                  Обновить
                </button>
              }
            />
          </div>
        ) : empty ? (
          <div className="card py-6 animate-fade-in">
            <EmptyState
              icon={<SearchIcon className="w-5 h-5" />}
              title="В этом отделе никого нет"
              hint="Ни сейчас, ни на 1 января — цифр для этого фильтра нет"
              action={
                <button type="button" onClick={() => setDept('all')} className="btn-secondary btn-sm active:scale-[0.96]">
                  Сбросить фильтр
                </button>
              }
            />
          </div>
        ) : (
          <div className="space-y-4">
            <Bento d={view.bento} />
            <MoneyBridge b={view.b} targetRate={settings.fotGrowthTarget} today={w!.today} coverage={view.coverage} />
            {view.rows.length > 0 && <LevelsTable rows={view.rows} ceiling={settings.salaryCeiling} />}
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_440px] gap-3 items-start">
              <MonthlyCard series={view.series} today={w!.today} />
              <ChurnCard
                c={view.churn}
                companyTurnoverPct={view.companyTurnover}
                ytd={{ hires: view.b.hireCount + view.b.inOut, exits: view.b.leaverCount + view.b.inOut }}
                hireAvg={view.hireAvg}
                windowLabel={`${fmtDate(addDays(w!.yearAgo, 1))} — ${fmtDate(w!.today)}`}
              />
            </div>
          </div>
        )}

        <p className="text-center text-[11px] text-ash mt-10 text-pretty tabular-nums">
          {asOfLabel ? `Данные HR-портала от ${asOfLabel}` : 'Данных HR-портала нет'} ·{' '}
          {mode === 'hand' ? 'Суммы на руки' : `Суммы для компании, × ${nf(k, 2)}`} · Видно только админам
          {dataset && dataset.notes.missingInHr > 0 && (
            <>
              <br />
              {dataset.notes.missingInHr} {plural(dataset.notes.missingInHr, ['человек', 'человека', 'человек'])} из
              «Команды» нет в HR — в цифры не {dataset.notes.missingInHr === 1 ? 'входит' : 'входят'}
            </>
          )}
          {dataset && dataset.notes.hrOnlyDesign > 0 && (
            <>
              <br />В HR на дизайнерских позициях, но нет в «Команде»: {dataset.notes.hrOnlyDesign}
            </>
          )}
        </p>
      </main>

      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onClose={closeSettings}
          onSaved={(s) => setSettings(s)}
        />
      )}
    </KContext.Provider>
  );
}
