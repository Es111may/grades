'use client';

// Настройки «Экономики» (шестерёнка): ориентир роста ФОТ, налоговая нагрузка,
// потолок ставки. Сохраняет PUT /api/settings (только админ), правка
// попадает в «Действия». Поля — в привычных единицах (%, тыс. ₽), в API —
// единицы хранения (доли, рубли).

import { useEffect, useId, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { CloseIcon } from '@/components/icons';
import { nf } from '@/lib/economics';
import { isCommentsLayerOpen, isFromCommentsLayer } from '@/lib/commentsLayer';
import type { EconomicsSettings } from '@/lib/settings';

const CLOSE_MS = 150;

/** «10» → 10; «12,5» → 12.5; пусто или мусор — null. */
function parseNum(s: string): number | null {
  const v = Number(s.replace(',', '.').replace(/\s/g, ''));
  return s.trim() === '' || !Number.isFinite(v) ? null : v;
}
const pctText = (rate: number) => nf(Math.round(rate * 1000) / 10, 1);

function Field({
  label,
  hint,
  value,
  onChange,
  suffix,
  inputRef,
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  suffix: string;
  inputRef?: Ref<HTMLInputElement>;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="py-3.5 border-t border-cloud/60 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-3">
        <label htmlFor={id} className="text-sm text-ink flex-1 text-pretty">
          {label}
        </label>
        <div className="relative w-[132px] shrink-0">
          <input
            id={id}
            ref={inputRef}
            className="input text-right pr-12 tabular-nums"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-stone pointer-events-none">
            {suffix}
          </span>
        </div>
      </div>
      <p className="text-xs text-stone mt-1.5 leading-relaxed pr-[148px] text-pretty">{hint}</p>
    </div>
  );
}

export default function SettingsDialog({
  settings,
  onClose,
  onSaved,
}: {
  settings: EconomicsSettings;
  onClose: () => void;
  onSaved: (s: EconomicsSettings) => void;
}) {
  const titleId = useId();
  const [target, setTarget] = useState(pctText(settings.fotGrowthTarget));
  const [tax, setTax] = useState(pctText(settings.payrollTaxRate));
  const [ceiling, setCeiling] = useState(
    settings.salaryCeiling == null ? '' : nf(settings.salaryCeiling / 1000, 1).replace(/\s/g, ''),
  );
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Появление и уход — переходом (прерываемо), а не keyframes
  const [shown, setShown] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstRef = useRef<HTMLInputElement | null>(null);
  const closing = useRef(false);

  useLayoutEffect(() => {
    // Скрытое состояние — исходное для перехода (как в Tooltip portal)
    void panelRef.current?.offsetWidth;
    setShown(true);
    firstRef.current?.focus();
  }, []);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    setShown(false);
    window.setTimeout(onClose, CLOSE_MS);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Пока в слое комментариев что-то открыто, Escape — его, не наш
      if (e.key === 'Escape' && !saving && !isCommentsLayerOpen()) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // close стабилен по смыслу: читает только ref и колбэк закрытия
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving]);

  const t = parseNum(target);
  const x = parseNum(tax);
  const cK = parseNum(ceiling);
  const error =
    t == null || t < 0 || t > 100
      ? 'Ориентир — число от 0 до 100'
      : x == null || x < 0 || x > 100
        ? 'Налоговая нагрузка — число от 0 до 100'
        : ceiling.trim() !== '' && (cK == null || cK <= 0 || cK > 10_000)
          ? 'Потолок — положительное число до 10 000 тыс. или пусто'
          : null;

  async function save() {
    if (error || saving) return;
    setSaving(true);
    setServerError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fotGrowthTarget: Math.round(t! * 10) / 1000,
          payrollTaxRate: Math.round(x! * 10) / 1000,
          salaryCeiling: ceiling.trim() === '' ? null : Math.round(cK! * 1000),
        }),
      });
      const data = (await res.json().catch(() => null)) as { settings?: EconomicsSettings; error?: string } | null;
      if (!res.ok || !data?.settings) {
        setServerError(data?.error ?? 'Не удалось сохранить настройки');
        setSaving(false);
        return;
      }
      onSaved(data.settings);
      setSaving(false);
      close();
    } catch {
      setServerError('Нет связи с сервером — попробуйте ещё раз');
      setSaving(false);
    }
  }

  const multiplier = nf(1 + (x ?? 0) / 100, 2);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh]">
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-150 ease-out ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={(e) => !saving && !isFromCommentsLayer(e.nativeEvent) && close()}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative w-full max-w-[460px] bg-snow rounded-modal shadow-soft-lg
                    transition-[opacity,transform] duration-200 ease-out
                    ${shown ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-[0.97] translate-y-1'}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="flex items-center pl-6 pr-4 pt-4 pb-2">
            <h2 id={titleId} className="font-display text-xl font-medium tracking-tight text-balance">
              Настройки экономики
            </h2>
            <button
              type="button"
              onClick={close}
              disabled={saving}
              className="ml-auto w-8 h-8 rounded-pill bg-ink/5 text-stone hover:text-ink hover:bg-ink/10 flex items-center
                         justify-center active:scale-[0.96] transition-[color,background-color,transform] duration-150"
              aria-label="Закрыть"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="px-6 pt-3 pb-2">
            <Field
              label="Ориентир роста ФОТ, % в год"
              hint="Ориентир, а не бюджет: весь ФОТ к 31 декабря относительно 1 января, вместе с наймом."
              value={target}
              onChange={setTarget}
              suffix="%"
              inputRef={firstRef}
            />
            <Field
              label="Налоговая нагрузка, %"
              hint={`«Для компании» = на руки × ${multiplier}. Налоги и взносы сверху ставки.`}
              value={tax}
              onChange={setTax}
              suffix="%"
            />
            <Field
              label="Потолок ставки, тыс. ₽"
              hint="На руки. Линия на шкале «По уровням». Пусто — не используется."
              value={ceiling}
              onChange={setCeiling}
              suffix="тыс."
              placeholder="—"
            />
          </div>
          <p className="px-6 min-h-[18px] text-xs text-blaze" role="alert">
            {error ?? serverError ?? ''}
          </p>
          <div className="flex items-center gap-2 px-6 pt-3 pb-5">
            <span className="text-[11px] text-ash leading-snug mr-auto text-pretty">
              Видно всем админам · правка попадёт в «Действия»
            </span>
            <button type="button" onClick={close} disabled={saving} className="btn-ghost btn-sm h-8">
              Отмена
            </button>
            <button type="submit" disabled={!!error || saving} className="btn-primary btn-sm h-8">
              {saving ? 'Сохраняю…' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
