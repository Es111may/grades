/**
 * Кэш для статики из public/ без хеша в имени. По умолчанию Next отдаёт её
 * с `max-age=0` — браузер перепроверяет файл на каждой загрузке. Неделя +
 * фоновая ревалидация на сутки: замену файла пользователи увидят не позже
 * чем через неделю; если нужно сразу — меняем имя файла.
 * /_next/static не трогаем: там хеши в именах и immutable от самого Next.
 */
const PUBLIC_ASSET_CACHE = [
  {
    key: 'Cache-Control',
    value: 'public, max-age=604800, stale-while-revalidate=86400',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      // Анимированный логотип в шапке (BrandLogo)
      { source: '/logo-spiral.mp4', headers: PUBLIC_ASSET_CACHE },
      { source: '/logo-gr.svg', headers: PUBLIC_ASSET_CACHE },
      // PWA-манифест и его иконки
      { source: '/manifest.webmanifest', headers: PUBLIC_ASSET_CACHE },
      { source: '/icon-192.png', headers: PUBLIC_ASSET_CACHE },
      { source: '/icon-512.png', headers: PUBLIC_ASSET_CACHE },
      // Исходники шрифтов. Страницы берут их через next/font из
      // /_next/static/media, но прямые ссылки тоже не должны ревалидироваться.
      { source: '/fonts/:path*', headers: PUBLIC_ASSET_CACHE },
    ];
  },
};

module.exports = nextConfig;
