'use client';

import { useEffect } from 'react';
import { CloseIcon } from '@/components/icons';

export type ResetEntry = {
  id: number;
  fullName: string;
  email: string;
  role: string;
  department: string | null;
  password: string;
};

const DEPT_ORDER = ['Криэйт', 'Импрув', 'Инхаус'];

const ROLE_LABEL: Record<string, string> = {
  lead: 'Лид',
  stardiz: 'Стардиз',
  designer: 'Дизайнер',
};

function groupByDept(entries: ResetEntry[]) {
  const map = new Map<string, ResetEntry[]>();
  for (const e of entries) {
    const dept = e.department ?? '— без отдела —';
    if (!map.has(dept)) map.set(dept, []);
    map.get(dept)!.push(e);
  }
  // Сортируем: сначала в порядке DEPT_ORDER, потом остальные.
  const ordered: Array<[string, ResetEntry[]]> = [];
  for (const d of DEPT_ORDER) {
    if (map.has(d)) {
      ordered.push([d, map.get(d)!]);
      map.delete(d);
    }
  }
  for (const [d, list] of map) ordered.push([d, list]);
  return ordered;
}

function buildClipboardText(entries: ResetEntry[]): string {
  const grouped = groupByDept(entries);
  return grouped
    .map(
      ([dept, list]) =>
        `${dept}\n` +
        list
          .map((e) => `  ${e.fullName} <${e.email}> — ${e.password}`)
          .join('\n'),
    )
    .join('\n\n');
}

export default function PasswordResetModal({
  entries,
  onClose,
}: {
  entries: ResetEntry[];
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(buildClipboardText(entries));
    } catch {
      alert('Не удалось скопировать. Скопируй из текстового поля ниже вручную.');
    }
  }

  const grouped = groupByDept(entries);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-10 pb-10">
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative w-full max-w-3xl bg-snow rounded-modal shadow-soft-lg overflow-hidden flex flex-col max-h-[calc(100vh-80px)]">
        {/* Header */}
        <div className="px-7 py-5 border-b border-cloud flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Новые пароли команды
            </h2>
            <p className="text-xs text-stone mt-1 leading-relaxed">
              Пароли показаны один раз. Перешли их пользователям по защищённому
              каналу.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-stone hover:text-ink w-8 h-8 flex items-center justify-center rounded-pill hover:bg-cloud/50 transition-colors shrink-0"
            aria-label="Закрыть"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-7 py-5 overflow-y-auto space-y-6 flex-1">
          {grouped.map(([dept, list]) => (
            <section key={dept}>
              <div className="text-base font-semibold text-ink mb-3">{dept}</div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-cloud">
                  {list.map((e) => (
                    <tr key={e.id}>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{e.fullName}</div>
                        <div className="text-xs text-stone leading-tight mt-0.5">
                          {e.email} · {ROLE_LABEL[e.role] ?? e.role}
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        <code className="font-mono text-sm bg-canvas border border-cloud rounded-pill px-2.5 py-1 select-all">
                          {e.password}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-cloud flex items-center justify-end gap-2 bg-snow">
          <button onClick={onClose} className="btn-ghost">
            Закрыть
          </button>
          <button onClick={copyAll} className="btn-accent">
            Скопировать всё
          </button>
        </div>
      </div>
    </div>
  );
}
