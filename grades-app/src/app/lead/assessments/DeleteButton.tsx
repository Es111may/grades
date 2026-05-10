'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeleteButton({
  assessmentId,
  designerName,
}: {
  assessmentId: number;
  designerName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!confirm(`Удалить эту оценку (${designerName}) из истории? Действие необратимо.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Ошибка: ${j.error ?? 'не удалось удалить'}`);
        setBusy(false);
        return;
      }
      router.refresh();
    } catch (e) {
      alert(`Ошибка: ${(e as Error).message}`);
      setBusy(false);
    }
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        handleDelete();
      }}
      disabled={busy}
      className="btn-ghost-danger btn-sm"
    >
      {busy ? 'Удаляю…' : 'Удалить'}
    </button>
  );
}
