'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function MigrateButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[] | null>(null);

  async function run() {
    if (!confirm('Запустить миграцию структуры грейдов? Действие идемпотентно.')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/migrate-grades', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) {
        alert(`Ошибка: ${j.error ?? 'неизвестно'}`);
        return;
      }
      setLog(j.log ?? []);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6">
      <button
        onClick={run}
        disabled={busy}
        className="text-xs text-stone hover:text-ink underline"
      >
        {busy ? 'Запускаю миграцию…' : 'Принудительно прогнать миграцию грейдов'}
      </button>
      {log && (
        <pre className="mt-3 bg-canvas border border-cloud rounded-md p-3 text-xs text-stone whitespace-pre-wrap">
          {log.join('\n')}
        </pre>
      )}
    </div>
  );
}
