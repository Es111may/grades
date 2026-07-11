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
  // Двухступенчатое удаление — confirm() в некоторых браузерах
  // молча блокируется.
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function armDelete() {
    setDeleteArmed(true);
    setTimeout(() => setDeleteArmed(false), 5000);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/assessments/${publishedAssessmentId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Не получилось удалить: ${j.error ?? res.statusText}`);
        setDeleting(false);
        setDeleteArmed(false);
        return;
      }
      router.refresh();
      router.push('/admin/users');
    } catch (e) {
      alert(`Ошибка: ${(e as Error).message}`);
      setDeleting(false);
      setDeleteArmed(false);
    }
  }

  return (
    // Рендерится внутри hero портрета (слот actions) — по центру под чипами
    <div className="flex items-center justify-center gap-1 flex-wrap">
      {hasDraft && (
        <Link
          href={`/lead/assess?id=${designerId}`}
          className="inline-flex items-center rounded-pill px-4 h-9 text-sm text-ink
                     bg-snow/60 backdrop-blur-md border border-cloud/40
                     hover:bg-snow/80 transition-colors"
        >
          Продолжить черновик
        </Link>
      )}
      {/* «Новый цикл» — всегда создаёт свежий draft поверх опубликованной.
          AssessPage по ?new=1 принудительно создаёт новую assessment, копируя
          scores из последней опубликованной как стартовую точку. */}
      <Link
        href={`/lead/assess?id=${designerId}&new=1`}
        className="inline-flex items-center rounded-pill px-4 h-9 text-sm text-ink
                   bg-snow/60 backdrop-blur-md border border-cloud/40
                   hover:bg-snow/80 transition-colors"
      >
        Новый цикл
      </Link>
      {!deleteArmed ? (
        <button
          type="button"
          onClick={armDelete}
          className="inline-flex items-center rounded-pill px-4 h-9 text-sm text-blaze
                     bg-snow/60 backdrop-blur-md border border-cloud/40
                     hover:bg-snow/80 transition-colors"
        >
          Удалить
        </button>
      ) : (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="btn-danger btn-sm"
        >
          {deleting ? 'Удаляю…' : 'Точно удалить?'}
        </button>
      )}
    </div>
  );
}
