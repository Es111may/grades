'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function PortraitActions({
  designerId,
  publishedAssessmentId,
}: {
  designerId: number;
  publishedAssessmentId: number;
}) {
  const router = useRouter();
  const [reopening, setReopening] = useState(false);
  const [confirming, setConfirming] = useState(false);

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
    <div className="flex items-center justify-between gap-4 max-w-[1300px] mx-auto px-8 pt-6">
      <Link href="/lead" className="text-sm text-stone hover:text-ink">
        ← к списку
      </Link>
      <div className="flex items-center gap-3">
        {confirming ? (
          <>
            <span className="text-xs text-stone">
              Старая оценка уйдёт в архив, создастся пустой черновик. Уверен?
            </span>
            <button
              onClick={reopen}
              disabled={reopening}
              className="bg-sunset text-white rounded-pill px-4 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              {reopening ? 'Создаю…' : 'Да, переоценить'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={reopening}
              className="text-xs text-stone hover:text-ink"
            >
              Отмена
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="text-xs text-stone hover:text-ink underline-offset-4 hover:underline"
          >
            Переоценить заново →
          </button>
        )}
      </div>
    </div>
  );
}
