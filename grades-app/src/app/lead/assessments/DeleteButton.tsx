'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeleteButton({
  assessmentId,
}: {
  assessmentId: number;
  designerName?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Двухступенчатый клик — нативный confirm() в некоторых браузерах
  // молча возвращает false и удаление не происходит.
  const [armed, setArmed] = useState(false);

  function arm(e: React.MouseEvent) {
    e.stopPropagation();
    setArmed(true);
    setTimeout(() => setArmed(false), 5000);
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Не получилось удалить: ${j.error ?? res.statusText}`);
        setBusy(false);
        setArmed(false);
        return;
      }
      router.refresh();
    } catch (e) {
      alert(`Ошибка: ${(e as Error).message}`);
      setBusy(false);
      setArmed(false);
    }
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={arm}
        disabled={busy}
        className="btn-ghost-danger btn-sm"
      >
        Удалить
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={busy}
      className="btn-danger btn-sm"
    >
      {busy ? 'Удаляю…' : 'Точно удалить?'}
    </button>
  );
}
