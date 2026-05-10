'use client';

import { useState } from 'react';
import Link from 'next/link';
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
    <div className="flex items-center justify-between gap-4 max-w-[1300px] mx-auto px-8 pt-5">
      <Link href="/admin/users" className="text-sm text-stone hover:text-ink transition-colors">
        ← к списку
      </Link>
      <button onClick={reopen} disabled={reopening} className="btn-accent btn-sm">
        {reopening ? 'Создаю…' : hasDraft ? 'Продолжить черновик' : 'Новая оценка'}
      </button>
    </div>
  );
}
