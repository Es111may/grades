'use client';

import { useRef, useState } from 'react';

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

    // Один формат заголовка — точь-в-точь как «Блок CDO» в шапке карточки
    // (text-base font-medium text-ink). Поддерживаем все четыре уровня
    // решётки одинаково: чтобы не думать какой уровень — любая `#`/`##`/
    // `###`/`####` строка становится одинаковым заголовком.
    const headingMatch = trimmed.match(/^#{1,4}\s+(.*)$/);
    if (headingMatch) {
      blocks.push(
        <h3
          key={key++}
          className="text-base font-medium text-ink leading-tight mt-4 mb-2"
        >
          {renderInline(headingMatch[1])}
        </h3>,
      );
    } else if (/^_{2,}$/.test(trimmed)) {
      // Горизонтальная линия — строка из двух и более подчёркиваний.
      // Pavel специально попросил такой синтаксис (вместо стандартного ---).
      blocks.push(<hr key={key++} className="border-cloud my-3" />);
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

/**
 * Универсальный «карточка с markdown-полем» для админа/лида.
 * Над telegrame, ниже — либо MarkdownContent (просмотр), либо
 * MarkdownTextarea (редактирование). При сохранении вызывается
 * onSave; вернувший true считается успехом.
 */
export function EditableMarkdownBlock({
  title,
  badge,
  hint,
  value,
  canEdit,
  onSave,
  emptyLabel,
}: {
  title: string;
  badge?: string;
  hint?: string;
  value: string;
  canEdit: boolean;
  onSave: (next: string) => Promise<boolean>;
  /** Текст, который показываем дизайнеру (или другому read-only зрителю)
   *  если поле пустое. Если не задан и canEdit=false — блок скрывается. */
  emptyLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok) {
      setEditing(false);
    } else {
      alert('Не получилось сохранить — попробуй ещё раз');
    }
  }

  // Если значения нет и редактировать нельзя — обычно блок не нужен,
  // если только не передан явный emptyLabel для read-only зрителя.
  if (!value && !canEdit && !emptyLabel) return null;

  return (
    <section className="card mb-6 overflow-hidden">
      <div className="px-6 py-4 border-b border-cloud bg-canvas/30 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {badge && <span className="chip-build shrink-0">{badge}</span>}
          <div className="min-w-0">
            <h3 className="text-base font-medium text-ink leading-tight">{title}</h3>
            {hint && <p className="text-xs text-stone mt-0.5 truncate">{hint}</p>}
          </div>
        </div>
        {canEdit && !editing && (
          <button
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
            className="btn-ghost btn-sm shrink-0"
            type="button"
          >
            {value ? 'Редактировать' : 'Заполнить'}
          </button>
        )}
      </div>
      <div className="px-6 py-5">
        {editing ? (
          <div className="space-y-3">
            <MarkdownTextarea
              value={draft}
              onChange={setDraft}
              onSubmit={() => !saving && save()}
              placeholder="Markdown · **жирный** (⌘B), *курсив* (⌘I), [ссылка](url), # заголовок, __ — линия"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] text-ash">
                ⌘B — жирный · ⌘I — курсив · ⌘↵ — сохранить
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditing(false)}
                  className="btn-ghost"
                  disabled={saving}
                  type="button"
                >
                  Отмена
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="btn-accent"
                  type="button"
                >
                  {saving ? 'Сохраняю…' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        ) : value ? (
          <MarkdownContent text={value} />
        ) : (
          <div className="text-sm text-ash italic">
            {emptyLabel ?? 'Ещё не заполнено'}
          </div>
        )}
      </div>
    </section>
  );
}
