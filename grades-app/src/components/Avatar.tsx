import { CSSProperties } from 'react';
import { withAvatarSize } from '@/lib/avatarShared';

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Аватар пользователя. Если avatarUrl задан — показываем картинку,
 * иначе кружок с инициалами. Размер задаётся в пикселях.
 *
 * avatarUrl — ссылка /api/avatar (сервер строит её через lib/avatar) или
 * data URL (превью в модалке до сохранения). У ссылки размер картинки
 * подбираем под кружок: список рисует 24–40 px, поп-ап и портрет — крупнее.
 */
export default function Avatar({
  name,
  avatarUrl,
  size = 32,
  className = '',
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const style: CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.32),
  };
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={withAvatarSize(avatarUrl, size)}
        alt={name}
        loading="lazy"
        decoding="async"
        style={style}
        className={`rounded-pill object-cover bg-cloud shrink-0 ${className}`}
      />
    );
  }
  return (
    <div
      style={style}
      className={`rounded-pill bg-cloud flex items-center justify-center font-medium tracking-tight text-graphite shrink-0 ${className}`}
    >
      {initials(name)}
    </div>
  );
}
