'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Avatar from '@/components/Avatar';

type Target = {
  id: number;
  fullName: string;
  role: string;
  avatarUrl: string | null;
};

export default function NewLeadReviewForm({ target }: { target: Target }) {
  const router = useRouter();
  const [period, setPeriod] = useState(suggestPeriod());
  const [csvText, setCsvText] = useState('');
  const [csvName, setCsvName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    setWarning(null);
    setCsvName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      setError('Не получилось прочитать файл. Попробуй ещё раз.');
    };
    reader.readAsText(file, 'utf-8');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!csvText.trim()) {
      setError('Загрузи CSV-файл из Google Form');
      return;
    }
    if (!period.trim()) {
      setError('Укажи период оценки — например, «Q2 2026» или «Май 2026»');
      return;
    }
    setSubmitting(true);
    setError(null);
    setWarning(null);
    try {
      const res = await fetch('/api/lead-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId: target.id,
          period: period.trim(),
          rawCsv: csvText,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg =
          typeof data.error === 'string'
            ? data.error
            : 'Не получилось загрузить CSV — проверь формат';
        setError(msg);
        setSubmitting(false);
        return;
      }
      if (data.warnings && data.warnings.length > 0) {
        // не блокируем — переходим, но Pavel увидит данные
        console.warn('Lead review warnings:', data.warnings);
      }
      router.push(`/admin/lead-reviews/${data.id}`);
    } catch (e) {
      setError('Сеть пропала или сервер не отвечает. Попробуй ещё раз.');
      setSubmitting(false);
    }
  }

  // Простое превью: считаем респондентов и роли на клиенте (для предупреждения,
  // что грузим не пустоту). Полный парсинг — на сервере.
  const preview = csvText ? makeQuickPreview(csvText) : null;

  return (
    <main className="max-w-[1400px] mx-auto px-8 pt-10 pb-16">
      <div className="text-xs text-stone mb-3">
        <Link href="/admin/users" className="hover:text-ink transition-colors">
          Команда
        </Link>
        <span className="text-ash mx-1.5">/</span>
        <Link
          href={`/admin/lead-reviews?userId=${target.id}`}
          className="hover:text-ink transition-colors"
        >
          {target.fullName}
        </Link>
        <span className="text-ash mx-1.5">/</span>
        <span>Новая оценка</span>
      </div>

      <div className="flex items-center gap-4 mb-8">
        <Avatar name={target.fullName} avatarUrl={target.avatarUrl} size={56} />
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight mb-2">
            Новая 360-оценка
          </h1>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="chip-neutral">{target.fullName}</span>
            <span className="chip-neutral">
              {target.role === 'lead' ? 'Лид' : 'Стардиз'}
            </span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-[760px] space-y-5">
        <div className="card p-6 space-y-5">
          <div>
            <label className="block text-[11px] text-stone mb-1.5">Период</label>
            <input
              type="text"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="input"
              placeholder="например, «Q2 2026» или «Май 2026»"
              maxLength={120}
            />
            <p className="text-xs text-ash mt-1.5">
              Свободный текст. Используется в шапке отчёта и в истории циклов.
            </p>
          </div>

          <div>
            <label className="block text-[11px] text-stone mb-1.5">
              CSV-выгрузка из Google Form
            </label>
            <FileDropzone
              onFile={handleFile}
              fileName={csvName}
              disabled={submitting}
            />
            <p className="text-xs text-ash mt-1.5">
              В Google Form: «Ответы» → «···» → «Скачать ответы (.csv)».
              Шапка должна быть с теми же вопросами, что в шаблоне опроса
              для лидов.
            </p>
          </div>

          {preview && (
            <div className="bg-canvas/60 border border-cloud rounded-card p-4 text-sm">
              <div className="text-[11px] text-stone mb-2">Превью</div>
              <div className="text-graphite">
                Строк ответов: <strong className="tabular-nums">{preview.rows}</strong>
              </div>
              {preview.roles.length > 0 && (
                <div className="text-graphite mt-1">
                  Роли:{' '}
                  {preview.roles
                    .map((r) => `${r.role} — ${r.count}`)
                    .join(', ')}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-blaze/10 text-blaze rounded-card p-3 text-sm">
              {error}
            </div>
          )}
          {warning && (
            <div className="bg-sunset/10 text-sunset rounded-card p-3 text-sm">
              {warning}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 justify-end">
          <Link
            href={`/admin/lead-reviews?userId=${target.id}`}
            className="btn-ghost"
          >
            Отмена
          </Link>
          <button
            type="submit"
            disabled={submitting || !csvText.trim() || !period.trim()}
            className="btn-accent"
          >
            {submitting ? 'Загрузка…' : 'Создать оценку'}
          </button>
        </div>
      </form>
    </main>
  );
}

function FileDropzone({
  onFile,
  fileName,
  disabled,
}: {
  onFile: (file: File) => void;
  fileName: string | null;
  disabled: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`block w-full rounded-card border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${
        hover ? 'border-ink bg-canvas/60' : 'border-cloud hover:border-ash'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      {fileName ? (
        <div>
          <div className="text-sm font-medium text-ink">{fileName}</div>
          <div className="text-xs text-stone mt-1">Кликни, чтобы заменить</div>
        </div>
      ) : (
        <div>
          <div className="text-sm font-medium text-ink">
            Перетащи CSV сюда или кликни, чтобы выбрать
          </div>
          <div className="text-xs text-stone mt-1">
            .csv до 2 МБ, UTF-8
          </div>
        </div>
      )}
    </label>
  );
}

/**
 * Быстрое превью на клиенте: считаем количество строк ответов и распределение
 * по ролям. Не полный парсинг — нужно просто проверить, что CSV не пустой.
 */
function makeQuickPreview(csv: string): { rows: number; roles: { role: string; count: number }[] } {
  const lines = splitCsvLines(csv);
  if (lines.length < 2) return { rows: 0, roles: [] };
  const headers = parseRow(lines[0]);
  const roleIdx = headers.findIndex(
    (h) => h.trim().toLowerCase() === 'какая у тебя роль в команде?',
  );
  let count = 0;
  const roleCounts = new Map<string, number>();
  for (let i = 1; i < lines.length; i++) {
    const cells = parseRow(lines[i]);
    if (cells.every((c) => c.trim() === '')) continue;
    count++;
    if (roleIdx >= 0) {
      const r = (cells[roleIdx] ?? '').trim() || '—';
      roleCounts.set(r, (roleCounts.get(r) ?? 0) + 1);
    }
  }
  return {
    rows: count,
    roles: Array.from(roleCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([role, count]) => ({ role, count })),
  };
}

/**
 * Разбивает CSV на «логические строки» с учётом многострочных кавычек.
 * Намеренно простой парсер — точный разбор делает сервер, тут только превью.
 */
function splitCsvLines(csv: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      buf += ch;
      continue;
    }
    if (ch === '\n' && !inQuotes) {
      out.push(buf);
      buf = '';
      continue;
    }
    if (ch === '\r') continue;
    buf += ch;
  }
  if (buf.length > 0) out.push(buf);
  return out;
}

function parseRow(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
          continue;
        }
        inQuotes = false;
        continue;
      }
      field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      out.push(field);
      field = '';
      continue;
    }
    field += ch;
  }
  out.push(field);
  return out;
}

function suggestPeriod(): string {
  const now = new Date();
  const month = now.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  return `Q${quarter} ${now.getFullYear()}`;
}
