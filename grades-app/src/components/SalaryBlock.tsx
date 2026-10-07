'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon, CloseIcon } from '@/components/icons';
import Tooltip from '@/components/Tooltip';
import Collapse from '@/components/Collapse';
import InlineEditor from '@/components/InlineEditor';
import { elapsedSince, formatDateShort, todayLocalIso } from '@/lib/dates';
import {
  formatPct,
  formatThousands,
  groupEventsByYear,
  pctChange,
  type CompEvent,
  type CompensationView,
  type PlannedRaiseState,
} from '@/lib/compensation';
import type { PlannedRaiseRow } from '@/components/PlannedRaiseBadge';

type ApiView = CompensationView | { state: 'hr_unavailable' };
type OkView = Extract<CompensationView, { state: 'ok' }>;
type Planned = {
  state: PlannedRaiseState;
  setAt: string | null;
  at: string | null;
  salary: number | null;
  note: string | null;
  setBy: string | null;
};
/** Ответ /api/users/[id]/compensation. */
export type CompensationData = {
  view: ApiView;
  /** Почасовщик: в HR выведен из штата, «уволен» для него — норма. */
  hourly?: boolean;
  planned: Planned;
  can: { editPlanned: boolean; editBonuses: boolean };
};

/** Данные блока и перечитывание — одни на карточку портрета и её поп-ап. */
export type Compensation = {
  data: CompensationData | null;
  loading: boolean;
  error: boolean;
  reload: () => Promise<void>;
};

const tys = (rub: number) => `${formatThousands(rub)} тыс.`;

/** «1 мар.» — в истории по годам: год уже в подписи группы. */
function formatDayMonth(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/**
 * Компенсации человека из /api/users/[id]/compensation. userId = null — не
 * грузить: блок получил данные снаружи (source).
 */
export function useCompensation(userId: number | null): Compensation {
  const [data, setData] = useState<CompensationData | null>(null);
  const [loading, setLoading] = useState(userId !== null);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    if (userId === null) return;
    setLoading(true);
    setError(false);
    try {
      const r = await fetch(`/api/users/${userId}/compensation`);
      if (!r.ok) throw new Error(String(r.status));
      setData(await r.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return useMemo(() => ({ data, loading, error, reload }), [data, loading, error, reload]);
}

/**
 * Можно ли сейчас внести премию: сервер разрешил и история загружена.
 * Без HR-данных истории нет — пункт меню открывал бы пустоту.
 */
export function canAddBonusNow(data: CompensationData | null): boolean {
  return data?.view.state === 'ok' && data.can.editBonuses;
}

/**
 * Ставка и вилка — шапка блока. Одна на оба места:
 *  • row  — строка «лейбл — значение» в поп-апе (под ней подробности);
 *  • card — карточка на странице дизайнера: подпись с чипом вилки, под ней
 *           ставка крупно. Подробностей ниже нет — поэтому, если цифр нет,
 *           причина коротко пишется прямо вместо ставки.
 */
export function SalaryHeadline({
  comp,
  label = 'Зарплата',
  variant = 'row',
  inactive = false,
}: {
  comp: Pick<Compensation, 'data' | 'loading' | 'error'>;
  label?: string;
  variant?: 'row' | 'card';
  /** Ушедший (Phase 23.6a): ставка — последняя, вилка к ней не относится. */
  inactive?: boolean;
}) {
  const { data, loading, error } = comp;
  const view = data?.view;
  // У ушедшего HR иногда обнуляет ставку в карточке, а журнала нет — «0 тыс.»
  // читалось бы как зарплата; показываем «Нет данных»
  const ok = view?.state === 'ok' && !(inactive && view.current <= 0) ? view : null;

  if (variant === 'row') {
    return (
      <Row label={label}>
        {loading && !data && <span className="text-stone italic">Загрузка…</span>}
        {error && <span className="text-ash italic">Не удалось загрузить</span>}
        {ok && (
          <>
            <span className="text-ink">{tys(ok.current)} ₽/мес</span>
            {!inactive && <BandChip view={ok} />}
          </>
        )}
        {view && !ok && <span className="text-ash">Нет данных</span>}
      </Row>
    );
  }

  return (
    <div className="min-w-0">
      {/* Ряд подписи — 24px, как у позиции 9-Box над карточкой: с чипом и
          без него ставка на месте. Чип компактный (20px) и стоит по центру
          ряда вместе с подписью; полный чип в узкой колонке bento не влезал
          в строку и падал под подпись. */}
      <div className="min-h-6 flex items-center gap-x-2 gap-y-1 flex-wrap">
        <span className="label-mono text-stone">{label}</span>
        {ok && !inactive && <BandChip view={ok} size="sm" />}
      </div>
      <div className="mt-1.5 min-h-[25px] flex items-center">
        {ok ? (
          <span className="font-display text-xl leading-tight font-medium tracking-tight tabular-nums">
            {tys(ok.current)} ₽/мес
          </span>
        ) : data ? (
          <span className="text-sm text-ash">{briefReason(data)}</span>
        ) : loading ? (
          <span className="block h-4 w-32 rounded bg-cloud animate-pulse">
            <span className="sr-only">Загрузка</span>
          </span>
        ) : error ? (
          <span className="text-sm text-ash">Не удалось загрузить</span>
        ) : null}
      </div>
    </div>
  );
}

/** Почему цифр нет — коротко, для карточки. Полный текст — в поп-апе. */
function briefReason(data: CompensationData): string {
  const v = data.view;
  if (v.state === 'hr_unavailable') return 'HR-портал недоступен';
  if (v.state === 'no_hr') return 'Нет данных в HR';
  if (v.state === 'hr_dismissed') return data.hourly ? 'Почасовщик, вне штата HR' : 'В HR — увольнение';
  return '';
}

/**
 * Чип вилки: почасовка, выше вилки на N, в вилке или ниже.
 * md — в строке поп-апа (24px, как соседние чипы); sm — у моно-подписи
 * карточки (20px, текст 10px — как компактные чипы-метки).
 */
function BandChip({ view, size = 'md' }: { view: OkView; size?: 'md' | 'sm' }) {
  const sz = size === 'sm' ? 'h-5 px-2 py-0 text-[10px] leading-none whitespace-nowrap' : 'h-6';
  if (view.hourly) return <span className={`chip-neutral ${sz}`}>Почасовка</span>;
  if (!view.band) return null;
  return view.band.state === 'above' ? (
    <span className={`chip-danger ${sz}`}>Выше вилки на {formatThousands(view.band.overBy)}</span>
  ) : (
    <span className={`chip-success ${sz}`}>
      {view.band.state === 'within' ? 'В вилке' : 'Ниже вилки'}
    </span>
  );
}

/**
 * Блок «Зарплата» (Phase 23.4) — в поп-апе 360 и в поп-апе карточки
 * «Зарплата» на странице дизайнера (по «+»). Ставка и вилка, рост,
 * давность последнего пересмотра («1 год 3 мес. назад», дата — в хинте);
 * история свёрнута, открывается «История» в строке последнего пересмотра.
 * Линию и заголовок секции ставит сам поп-ап.
 * Пересмотр и премию запускает меню «⋯» того поп-апа, где блок стоит
 * (editSignal, bonusSignal).
 *
 * Данные — из /api/users/[id]/compensation; права проверяет сервер, блок
 * рендерят только админу и лиду по своим людям. Прятать суммы при показе
 * экрана — глобальный выключатель в шапке: корень помечен salary-sensitive.
 *
 * Суммы изменений (+30) не показываем — только «было → стало» и процент.
 *
 * У ушедшего (inactive, Phase 23.6a) — последняя ставка и история из HR:
 * без вилки и роста «с начала года» (они про нынешнюю работу) и без
 * планового пересмотра — его у ушедших не планируют.
 */
export default function SalaryBlock({
  userId,
  source,
  label,
  inactive = false,
  editSignal = 0,
  bonusSignal = 0,
  onPlannedChange,
  onBonusReadyChange,
}: {
  userId: number;
  /** Вариант остался один — поп-ап; проп не обязателен. */
  variant?: 'popup';
  /**
   * Данные снаружи (карточка на портрете уже загрузила): блок не грузит
   * свои, правки перечитывают общие — и карточка обновляется вместе с ним.
   */
  source?: Compensation;
  /** Подпись строки ставки. Под заголовком «Зарплата» — «Ставка». */
  label?: string;
  /** Человек неактивен — показываем только последнюю ставку и историю. */
  inactive?: boolean;
  /** Растёт при «Запланировать пересмотр» в меню «⋯» — открывает редактор. */
  editSignal?: number;
  /** Растёт при «Добавить премию» в меню «⋯» — раскрывает историю с формой. */
  bonusSignal?: number;
  onPlannedChange?: (planned: PlannedRaiseRow | null) => void;
  /** Можно ли сейчас внести премию (см. canAddBonusNow). */
  onBonusReadyChange?: (ready: boolean) => void;
}) {
  const own = useCompensation(source ? null : userId);
  const { data, loading, error, reload: load } = source ?? own;
  const [editing, setEditing] = useState(false);
  // История свёрнута по умолчанию; форма премии — сверху истории
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addingBonus, setAddingBonus] = useState(false);
  const historyId = useId();

  // Меню «⋯» → «Запланировать пересмотр»: сразу редактор и свежие данные.
  // Статус на сервере появится только по «Сохранить» — см. PlannedRow.
  useEffect(() => {
    if (editSignal > 0) {
      setEditing(true);
      void load();
    }
    // load стабилен в рамках userId; реагируем только на новый сигнал
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSignal]);

  // Другой человек в том же поп-апе — история снова свёрнута
  useEffect(() => {
    setHistoryOpen(false);
    setAddingBonus(false);
  }, [userId]);

  // Меню «⋯» → «Добавить премию»: раскрываем историю, форма — сверху
  useEffect(() => {
    if (bonusSignal > 0) {
      setAddingBonus(true);
      setHistoryOpen(true);
    }
  }, [bonusSignal]);

  const view = data?.view;
  const planned = data?.planned;
  const current = view?.state === 'ok' ? view.current : null;
  const events = view?.state === 'ok' ? view.events : [];
  const canBonus = !!data?.can.editBonuses;

  const bonusReady = canAddBonusNow(data);
  useEffect(() => {
    onBonusReadyChange?.(bonusReady);
  }, [bonusReady, onBonusReadyChange]);

  // «История» — куда вернуть фокус, когда закрылась форма премии
  const historyToggleRef = useRef<HTMLButtonElement>(null);

  async function removeBonus(id: number) {
    const res = await fetch(`/api/bonuses/${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  }

  async function bonusSaved() {
    setAddingBonus(false);
    await load();
  }

  const notice =
    view?.state === 'hr_unavailable' ? (
      <p className="text-ash">HR-портал сейчас недоступен — зарплата и история не загрузились.</p>
    ) : view?.state === 'no_hr' ? (
      <p className="text-ash">Нет данных в HR-портале.</p>
    ) : view?.state === 'hr_dismissed' ? (
      data?.hourly ? (
        <p className="text-ash">
          Почасовщик: в штате HR не числится с {formatDateShort(view.dismissedAt)}
        </p>
      ) : (
        <p className="text-ash">
          В HR-портале — увольнение с {formatDateShort(view.dismissedAt)}, актуальных данных нет.
          Если человек вернулся, возвращение нужно оформить в HR.
        </p>
      )
    ) : null;

  const bonusForm =
    addingBonus && canBonus ? (
      <BonusForm
        userId={userId}
        returnFocus={() => historyToggleRef.current}
        onSaved={bonusSaved}
        onCancel={() =>
          // Без событий панель пуста — закрываем её целиком (форма уйдёт
          // по окончании свёртки), иначе убираем только форму
          events.length === 0 ? setHistoryOpen(false) : setAddingBonus(false)
        }
      />
    ) : null;
  // Пока вносят первую премию, «пока нет» под формой не пишем
  const showList = events.length > 0 || !bonusForm;

  return (
    <div className="salary-sensitive flex flex-col gap-3">
      <SalaryHeadline comp={{ data, loading, error }} label={label} inactive={inactive} />
      <div className="flex flex-col gap-3">
        {notice}
        {view?.state === 'ok' && (
          <>
            {view.band && !inactive && (
              <BandMeter
                min={view.band.min}
                max={view.band.max}
                current={view.current}
                planned={planned?.state === 'active' ? planned.salary : null}
              />
            )}
            {view.since && !inactive && (
              <Row label={view.since.label === 'с найма' ? 'С найма' : 'С начала года'}>
                {view.since.pct === 0 || view.since.pct == null ? (
                  <span className="text-stone">Без изменений</span>
                ) : (
                  <span className="text-ink">
                    {formatThousands(view.since.from)} → {formatThousands(view.current)}
                    <span className="text-stone"> · {formatPct(view.since.pct)}</span>
                  </span>
                )}
                {view.since.warn && <span className="chip-warn h-6">Рост больше 30%</span>}
              </Row>
            )}
            <Row label="Последний пересмотр">
              {view.lastChange ? (
                /* Давность, а не дата (просьба лидов): сразу видно, давно ли
                   пересматривали. Точная дата — в хинте и в истории: рядом
                   с «Историей» «давность · дата» в строку не влезает (поп-ап
                   420px: свободно 137px, нужно ~200).
                   Хинт порталом: тело поп-апа прокручивается и обрезало бы
                   CSS-хинт; salary-sensitive — глаз в шапке прячет и его. */
                <Tooltip
                  portal
                  align="right"
                  text={formatDateShort(view.lastChange.date)}
                  tipClassName="salary-sensitive"
                  className="cursor-help"
                >
                  <span className="text-ink">{elapsedSince(view.lastChange.date)}</span>
                </Tooltip>
              ) : (
                <span className="text-ash">—</span>
              )}
              {/* Пустую историю не открываем; открытую (форма премии без
                  событий) — даём закрыть */}
              {(view.events.length > 0 || historyOpen) && (
                <HistoryToggle
                  buttonRef={historyToggleRef}
                  open={historyOpen}
                  controls={historyId}
                  onClick={() => setHistoryOpen((v) => !v)}
                />
              )}
            </Row>
          </>
        )}
        {data && planned && !inactive && (
          <PlannedRow
            userId={userId}
            planned={planned}
            current={current}
            canEdit={data.can.editPlanned}
            editing={editing}
            setEditing={setEditing}
            onChanged={async (next) => {
              onPlannedChange?.(next);
              await load();
            }}
          />
        )}
      </div>
      {view?.state === 'ok' && data && (
        /* Раскрытие — общий Collapse (grid-rows 0fr → 1fr, свёрнутое —
           inert). -mt-3 гасит gap-3 родителя, пока панель свёрнута.
           Сама история — на подложке (Pavel): подложка выходит из колонки
           строк и стоит в 8px от краёв поп-апа, текст внутри — ровно по
           колонке строк выше. Обе оболочки (поп-ап 360 и поп-ап «Зарплата»
           в SalaryCard) дают телу px-6, поэтому: обрезка раскрытия — -mx-6
           до краёв поп-апа, px-2 — те 8px; у подложки px-4 (24 − 8)
           возвращает текст в колонку. Обрезка до самых краёв, а не по
           подложке, — чтобы не резать обводку фокуса и хит-зону «×» (см.
           HistoryList). Сменится паддинг оболочки — менять и здесь.
           Сверху и снизу 12px, без линий между записями. Подложка —
           bg-canvas, вложенная поверхность из токенов: читается в обеих
           темах. Радиус 12px: концентричный поп-апу (26 − 8) вышел бы 18px
           и спорил бы с плашками, а 12 — уже принятый радиус вложенных. */
        <Collapse
          open={historyOpen}
          id={historyId}
          className="-mt-3"
          innerClassName="-mx-6 px-2"
          onClosed={() => setAddingBonus(false)}
        >
          <div className="pt-3">
            <div className="rounded-[12px] bg-canvas px-4 py-3 flex flex-col gap-4">
              {bonusForm}
              {showList && (
                <HistoryList events={events} onRemoveBonus={canBonus ? removeBonus : undefined} />
              )}
            </div>
          </div>
        </Collapse>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-stone shrink-0">{label}</span>
      <span className="ml-auto flex items-center gap-2 flex-wrap justify-end text-right">{children}</span>
    </div>
  );
}

/**
 * Шкала вилки: полоса «мин–макс», точка — текущая ставка (красная, если выше
 * вилки), полое кольцо — ставка после планового пересмотра.
 */
function BandMeter({
  min,
  max,
  current,
  planned,
}: {
  min: number;
  max: number;
  current: number;
  planned: number | null;
}) {
  const lo = Math.min(min, current, planned ?? current) * 0.92;
  const hi = Math.max(max, current, planned ?? current) * 1.06;
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const above = current > max;
  return (
    <div className="pt-1 pb-0.5">
      <div className="relative h-1.5 rounded-full bg-ink/[0.07]">
        <div
          className="absolute inset-y-0 rounded-full bg-emerald/30"
          style={{ left: pos(min), width: `calc(${pos(max)} - ${pos(min)})` }}
        />
        {planned != null && (
          <span
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-ink/50 bg-snow"
            style={{ left: pos(planned) }}
            title={`После пересмотра: ${formatThousands(planned)} тыс.`}
          />
        )}
        <span
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full ring-2 ring-snow ${
            above ? 'bg-blaze' : 'bg-emerald'
          }`}
          style={{ left: pos(current) }}
        />
      </div>
      <div className="relative h-4 mt-1 text-[11px] text-ash tabular-nums">
        <span className="absolute -translate-x-1/2" style={{ left: pos(min) }}>
          {formatThousands(min)}
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: pos(max) }}>
          {formatThousands(max)}
        </span>
      </div>
    </div>
  );
}

function PlannedRow({
  userId,
  planned,
  current,
  canEdit,
  editing,
  setEditing,
  onChanged,
}: {
  userId: number;
  planned: Planned;
  current: number | null;
  canEdit: boolean;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onChanged: (next: PlannedRaiseRow | null) => Promise<void>;
}) {
  // Активный статус редактор уточняет; нет статуса или он выполнен —
  // редактор начинает новый: поля пустые, а детали выполненного не
  // переезжают в новый.
  const isActive = planned.state === 'active';
  const fields = isActive
    ? {
        at: planned.at ? planned.at.slice(0, 10) : '',
        salary: planned.salary ? String(planned.salary / 1000) : '',
        note: planned.note ?? '',
      }
    : { at: '', salary: '', note: '' };
  const [at, setAt] = useState(fields.at);
  const [salary, setSalary] = useState(fields.salary);
  const [note, setNote] = useState(fields.note);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Строка статуса: редактор закрылся — фокус на её «Изменить»
  const viewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAt(fields.at);
    setSalary(fields.salary);
    setNote(fields.note);
    // fields — производное от этих же значений
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, planned.at, planned.salary, planned.note]);

  // Отмена ничего не пишет и забывает набранное: статуса, которого не было,
  // и не появится, а при следующем открытии поля — как в статусе
  function cancel() {
    setAt(fields.at);
    setSalary(fields.salary);
    setNote(fields.note);
    setErr(null);
    setEditing(false);
  }

  async function save() {
    setBusy(true);
    setErr(null);
    const rub = salary.trim() ? Math.round(Number(salary.replace(',', '.')) * 1000) : null;
    if (rub !== null && (!Number.isFinite(rub) || rub <= 0)) {
      setErr('Ставка — число в тысячах, например 145');
      setBusy(false);
      return;
    }
    // Статус создаётся здесь, по «Сохранить», одним запросом. fresh — когда
    // активного нет (или он выполнен): сервер начнёт новый с новой отметкой,
    // даже если HR недоступен и сам он «выполнен» не распознает.
    const res = await fetch(`/api/users/${userId}/planned-raise`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        at: at || null,
        salary: rub,
        note: note.trim() || null,
        ...(isActive ? {} : { fresh: true }),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr('Не удалось сохранить');
      return;
    }
    const j = await res.json();
    setEditing(false);
    await onChanged({ at: j.at, salary: j.salary, note: j.note });
  }

  async function clear() {
    setBusy(true);
    const res = await fetch(`/api/users/${userId}/planned-raise`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) {
      setEditing(false);
      await onChanged(null);
    }
  }

  // Прибавка — процентом к текущей ставке, без суммы
  const typedRub = salary.trim() ? Math.round(Number(salary.replace(',', '.')) * 1000) : NaN;
  const typedPct =
    current && Number.isFinite(typedRub) && typedRub > 0 ? pctChange(current, typedRub) : null;
  const plannedPct = current && planned.salary ? pctChange(current, planned.salary) : null;

  if (editing && canEdit) {
    return (
      <InlineEditor
        title="Плановый пересмотр"
        error={err}
        pending={busy}
        onSave={() => void save()}
        onCancel={cancel}
        returnFocus={() => viewRef.current?.querySelector('button')}
        actions={
          /* Снять — только действующий; выполненный сам уйдёт из списка */
          isActive && (
            <button
              type="button"
              className="ml-auto text-xs text-blaze hover:underline"
              disabled={busy}
              onClick={clear}
            >
              Снять
            </button>
          )
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-stone">
            Дата
            <input type="date" className="input" value={at} onChange={(e) => setAt(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-stone">
            Новая ставка, тыс.
            <input
              inputMode="decimal"
              className="input"
              placeholder={current ? formatThousands(current) : '145'}
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs text-stone">
          Обоснование
          <input
            className="input"
            placeholder="Например: после сдачи проекта"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {typedPct != null && (
          <p className="text-xs text-stone">{formatPct(typedPct)} к текущей ставке</p>
        )}
      </InlineEditor>
    );
  }

  // Статуса нет — строки нет: поставить пересмотр можно из меню «⋯»
  if (planned.state === 'none') return null;

  return (
    <div ref={viewRef} className="flex items-start gap-3">
      <span className="text-stone shrink-0">Плановый пересмотр</span>
      <span className="ml-auto text-right">
        {planned.state === 'done' ? (
          <span className="text-emerald">Выполнен — в HR есть повышение</span>
        ) : (
          <span className="text-ink">
            {planned.at ? formatDateShort(planned.at) : 'Дата не назначена'}
            {planned.salary && (
              <>
                {' '}→ {formatThousands(planned.salary)}
                {plannedPct != null && (
                  <span className="text-stone"> · {formatPct(plannedPct)}</span>
                )}
              </>
            )}
          </span>
        )}
        {planned.note && <span className="block text-xs text-stone mt-0.5">«{planned.note}»</span>}
        {canEdit && (
          <span className="block mt-1">
            {planned.state === 'active' && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs text-stone hover:text-ink transition-colors"
              >
                Изменить
              </button>
            )}
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              className="text-xs text-stone hover:text-blaze transition-colors ml-3"
            >
              Снять
            </button>
          </span>
        )}
      </span>
    </div>
  );
}

const EVENT_LABEL: Record<CompEvent['kind'], string> = {
  hire: 'Ставка при найме',
  raise: 'Пересмотр',
  decrease: 'Снижение',
  bonus: 'Премия',
};

/**
 * «История ⌄» в строке последнего пересмотра (поп-ап). Хит-зона 32px по
 * высоте, а -my-1.5 держит строку в 20px; -mr-2 выравнивает шеврон по
 * правому краю значений (у иконки свои поля).
 */
function HistoryToggle({
  open,
  controls,
  onClick,
  buttonRef,
}: {
  open: boolean;
  controls: string;
  onClick: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controls}
      className="-my-1.5 -mr-2 h-8 pl-1.5 pr-1 inline-flex items-center gap-0.5 text-xs text-stone
                 hover:text-ink transition-colors"
    >
      История
      <ChevronDownIcon
        className={`w-3.5 h-3.5 transition-transform duration-150 ease-out ${open ? 'rotate-180' : ''}`}
      />
    </button>
  );
}

/**
 * Список событий истории. Одна сетка на весь список
 * (строки — subgrid), поэтому даты, типы и суммы стоят колонками. Если
 * события за несколько лет — подпись года перед группой, в строках «1 мар.».
 * Стоит на подложке: линий между записями нет, шаг строк — 12px, как у
 * строк поп-апа; поля по краям даёт подложка, у самого списка их нет —
 * даты начинаются от лейблов строк выше, суммы кончаются по их значениям.
 * Колонки под «×» нет: он — в правом поле подложки (см. ниже).
 */
function HistoryList({
  events,
  onRemoveBonus,
}: {
  events: CompEvent[];
  /** Есть — у премий «×» (только админ). */
  onRemoveBonus?: (id: number) => void;
}) {
  if (events.length === 0) {
    return <p className="text-xs text-ash">Пересмотров в HR-портале пока нет.</p>;
  }
  const groups = groupEventsByYear(events);
  const byYear = groups.length > 1;
  return (
    <div className="grid grid-cols-[auto_1fr_auto] gap-x-4 gap-y-2">
      {groups.map((g, gi) => (
        <HistoryGroup key={g.year} year={byYear ? g.year : null} first={gi === 0}>
          {g.events.map((e, i) => (
            <li
              key={`${e.kind}-${e.date}-${i}`}
              className="group/row relative col-span-full grid grid-cols-subgrid items-baseline"
            >
              <span className="text-stone tabular-nums whitespace-nowrap">
                {byYear ? formatDayMonth(e.date) : formatDateShort(e.date)}
              </span>
              <span className="min-w-0 break-words">
                <span className="text-ink">{EVENT_LABEL[e.kind]}</span>
                {e.kind === 'bonus' && e.note && (
                  <span className="block text-xs text-stone mt-0.5">{e.note}</span>
                )}
                {(e.kind === 'raise' || e.kind === 'decrease') && e.future && (
                  <span className="block text-xs text-sunset mt-0.5">Вступит в силу</span>
                )}
              </span>
              <span className="text-right text-ink tabular-nums whitespace-nowrap">
                {e.kind === 'raise' || e.kind === 'decrease' ? (
                  <>
                    {formatThousands(e.from)} → {formatThousands(e.to)}
                    {e.pct != null && (
                      <span className={`ml-2 ${e.pct < 0 ? 'text-blaze' : 'text-emerald'}`}>
                        {formatPct(e.pct)}
                      </span>
                    )}
                  </>
                ) : e.kind === 'bonus' ? (
                  tys(e.amount)
                ) : (
                  tys(e.to)
                )}
              </span>
              {/* «×» ширины у сетки не берёт: absolute сразу за краем строки,
                  в правом поле подложки (16px), по центру первой строки
                  (top 2px: 16px в строке 20px). Виден при наведении на
                  строку и по фокусу с клавиатуры; где наведения нет (тач) —
                  всегда. Хит-зона 24×32 — псевдоэлементом: на сумму не
                  заходит (удаление без подтверждения — промах по сумме не
                  должен удалять премию), 8px уходит в зазор до края поп-апа. */}
              {onRemoveBonus && e.kind === 'bonus' && (
                <button
                  type="button"
                  onClick={() => onRemoveBonus(e.id)}
                  aria-label={`Удалить премию от ${formatDateShort(e.date)}`}
                  className="absolute left-full top-0.5 w-4 h-4 flex items-center justify-center rounded-full
                             text-ash hover:text-blaze opacity-0 group-hover/row:opacity-100
                             focus-visible:opacity-100 [@media(hover:none)]:opacity-100
                             transition-[color,opacity] duration-150 ease-out
                             before:absolute before:-inset-y-2 before:left-0 before:-right-2 before:content-['']"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </HistoryGroup>
      ))}
    </div>
  );
}

/**
 * Группа года: подпись (если есть) и сам список — оба на всю ширину сетки.
 * Подпись → строки 8px (gap-y-2 сетки); перед следующим годом ещё 12px —
 * 20px от прошлой группы. Первая подпись — вплотную к отступу подложки.
 */
function HistoryGroup({
  year,
  first,
  children,
}: {
  year: string | null;
  first: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      {year && (
        <div className={`col-span-full label-mono text-ash ${first ? '' : 'pt-3'}`}>{year}</div>
      )}
      <ul className="col-span-full grid grid-cols-subgrid gap-y-3">{children}</ul>
    </>
  );
}

/**
 * Форма премии — сверху на подложке истории. Своей рамки нет (InlineEditor
 * без framed): рамка — сама подложка (вложенная рамка со скруглением 22px
 * внутри 12px смотрелась бы чужой). Поля — bg-snow, на подложке читаются в
 * обеих темах.
 */
function BonusForm({
  userId,
  onSaved,
  onCancel,
  returnFocus,
}: {
  userId: number;
  onSaved: () => Promise<void>;
  onCancel: () => void;
  returnFocus?: () => HTMLElement | null | undefined;
}) {
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(todayLocalIso);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const rub = Math.round(Number(amount.replace(',', '.')) * 1000);
    if (!Number.isFinite(rub) || rub <= 0) {
      setErr('Сумма — число в тысячах, например 50');
      return;
    }
    setErr(null);
    setBusy(true);
    const res = await fetch(`/api/users/${userId}/bonuses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: rub, paidAt, note: note.trim() || null }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr('Не удалось сохранить премию');
      return;
    }
    await onSaved();
  }

  return (
    <InlineEditor
      title="Премия"
      framed={false}
      saveLabel="Внести"
      error={err}
      pending={busy}
      onSave={() => void submit()}
      onCancel={onCancel}
      // Фокус — после раскрытия панели: пока она свёрнута, браузер прокрутил
      // бы overflow-hidden к полю и сбил анимацию
      autoFocus={260}
      returnFocus={returnFocus}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-stone">
          Сумма, тыс.
          <input
            inputMode="decimal"
            className="input"
            placeholder="50"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-stone">
          Дата
          <input type="date" className="input" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </label>
      </div>
      <input
        className="input"
        placeholder="Комментарий, по желанию"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
    </InlineEditor>
  );
}
