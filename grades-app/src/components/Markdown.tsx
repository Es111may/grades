'use client';

import { useRef } from 'react';

/**
 * Минимальный markdown-рендер и editable-блок для текстовых полей,
 * которые админ/лид заполняет вручную (Сводка по ИИ, Блок CDO,
 * Мнение дизайн-лида).
 *
 * Поддерживается:
 *   - ##, ### заголовки
 *   - **жирный**, *курсив*
 *   - [текст](url) — ссылки
 *   - `-` / `*` буллеты
 *   - пустая строка = разрыв абзаца
 *
 * Горячие клавиши в textarea:
 *   - ⌘B / Ctrl+B — оборачивает выделение в **жирный**
 *   - ⌘I / Ctrl+I — *курсив*
 *   - ⌘↵ / Ctrl+Enter — onSubmit (если передан)
 */

export function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let bulletGroup: string[] = [];
  let key = 0;

  function flushBullets() {
    if (bulletGroup.length === 0) return;
    blocks.push(
      <ul key={key++} className="my-2 space-y-1">
        {bulletGroup.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-stone shrink-0">·</span>
            <span className="flex-1">{renderInline(b)}</span>
          </li>
        ))}
      </ul>,
    );
    bulletGroup = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    const trimmed = line.trim();

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      bulletGroup.push(trimmed.slice(2));
      continue;
    }
    flushBullets();

    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h4 key={key++} className="text-sm font-semibold text-ink mt-4 mb-1.5">
          {renderInline(trimmed.slice(4))}
        </h4>,
      );
    } else if (trimmed.startsWith('## ')) {
      blocks.push(
        <h3 key={key++} className="text-base font-semibold text-ink mt-4 mb-2">
          {renderInline(trimmed.slice(3))}
        </h3>,
      );
    } else if (trimmed.startsWith('# ')) {
      blocks.push(
        <h2 key={key++} className="text-lg font-semibold text-ink mt-4 mb-2">
          {renderInline(trimmed.slice(2))}
        </h2>,
      );
    } else if (trimmed === '') {
      blocks.push(<div key={key++} className="h-2" />);
    } else {
      blocks.push(
        <p key={key++} className="leading-relaxed">
          {renderInline(line)}
        </p>,
      );
    }
  }
  flushBullets();

  return (
    <div className="text-sm leading-relaxed text-graphite space-y-1">
      {blocks}
    </div>
  );
}

/** Инлайновое форматирование: **bold**, *italic*, [text](url). */
function renderInline(text: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  let i = 0;
  let cursor = 0;
  const re = /(\*\*[^*\n]+?\*\*)|(\*[^*\n]+?\*)|(\[[^\]\n]+?\]\([^)\n]+?\))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) out.push(text.slice(cursor, m.index));
    if (m[1]) {
      out.push(<strong key={i++}>{m[1].slice(2, -2)}</strong>);
    } else if (m[2]) {
      out.push(<em key={i++}>{m[2].slice(1, -1)}</em>);
    } else if (m[3]) {
      const lm = m[3].match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (lm) {
        out.push(
          <a
            key={i++}
            href={lm[2]}
            target="_blank"
            rel="noreferrer"
            className="text-sky underline underline-offset-2 hover:text-ink transition-colors"
          >
            {lm[1]}
          </a>,
        );
      } else {
        out.push(m[3]);
      }
    }
    cursor = re.lastIndex;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out.length ? out : text;
}

/**
 * Textarea с поддержкой markdown-шорткатов. Без своего state — value/onChange
 * приходят снаружи. Это позволяет родителю реализовать debounce-автосейв.
 */
export function MarkdownTextarea({
  value,
  onChange,
  onSubmit,
  rows = 12,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  function wrapSelection(prefix: string, suffix: string) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = value.slice(0, start);
    const sel = value.slice(start, end);
    const after = value.slice(end);
    const next = before + prefix + sel + suffix + after;
    onChange(next);
    requestAnimationFrame(() => {
      const t = ref.current;
      if (!t) return;
      t.focus();
      if (sel) {
        t.setSelectionRange(start + prefix.length, end + prefix.length);
      } else {
        const caret = start + prefix.length;
        t.setSelectionRange(caret, caret);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === 'b') {
      e.preventDefault();
      wrapSelection('**', '**');
    } else if (k === 'i') {
      e.preventDefault();
      wrapSelection('*', '*');
    } else if (k === 'enter' && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      className="input font-mono"
      rows={rows}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}
