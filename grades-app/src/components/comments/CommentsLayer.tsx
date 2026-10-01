'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import type { CommentsViewer } from './types';

// Сам слой — отдельным чанком после гидрации: в First Load JS страниц он не
// попадает, на сервере не рендерится (ему нужны document и окно).
const CommentsRoot = dynamic(() => import('./CommentsRoot'), { ssr: false });

/**
 * Комментарии к интерфейсу. Монтируется в layout'ах /admin и /lead, и только
 * для админа и лидов — решает сервер (layout), стардизу и дизайнеру слой не
 * отдаётся вовсе. Suspense — для useSearchParams внутри слоя.
 */
export default function CommentsLayer({ viewer }: { viewer: CommentsViewer }) {
  return (
    <Suspense fallback={null}>
      <CommentsRoot viewer={viewer} />
    </Suspense>
  );
}
