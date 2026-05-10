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
      onClick={handleDelete}
      disabled={busy}
      title="Удалить оценку"
      className="w-8 h-8 rounded-pill text-ash hover:text-blaze hover:bg-blaze/8 transition-colors disabled:opacity-30 flex items-center justify-center text-sm"
    >
      {busy ? '…' : '✕'}
    </button>
  );
}
