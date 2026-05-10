'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PortraitActions({
  designerId,
  publishedAssessmentId,
  hasDraft,
}: {
  designerId: number;
  publishedAssessmentId: number;
  hasDraft: boolean;
}) {
  const router = useRouter();
  const [reopening, setReopening] = useState(false);

  async function reopen() {
    setReopening(true);
    try {
      const res = await fetch(`/api/assessments/${publishedAssessmentId}/reopen`, {
        method: 'POST',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Ошибка: ${j.error ?? 'не удалось переоткрыть'}`);
        setReopening(false);
        return;
      }
      router.push(`/lead/assess?id=${designerId}`);
    } catch (e) {
      alert(`Ошибка: ${(e as Error).message}`);
      setReopening(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-4 max-w-[1400px] mx-auto px-8 pt-5">
      <button onClick={reopen} disabled={reopening} className="btn-accent btn-sm">
        {reopening ? 'Создаю…' : hasDraft ? 'Продолжить черновик' : 'Новая оценка'}
      </button>
    </div>
  );
}
