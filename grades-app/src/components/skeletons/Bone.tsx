import type { CSSProperties } from 'react';

/**
 * Кирпичики каркасов загрузки. Тон один на всё приложение: bg-cloud +
 * animate-pulse; приглушённые части — тем же cloud с прозрачностью
 * (класс bg-cloud/NN в className перекрывает базовый: в CSS он позже).
 */

/** Кость: полоска вместо строки текста или контрола, плашка вместо блока. */
export function Bone({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`bg-cloud rounded animate-pulse ${className}`} style={style} />;
}

/** Вторичная строка (описание, подпись) — тише кости: bg-cloud/60. */
export function Line({ className = '' }: { className?: string }) {
  return <Bone className={`bg-cloud/60 ${className}`} />;
}

/** Карточка-заглушка: .card целиком пульсирует (каркасы страниц). */
export function CardBone({ className = '' }: { className?: string }) {
  return <div className={`card ${className} animate-pulse`} />;
}
