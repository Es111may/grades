import localFont from 'next/font/local';

/**
 * Шрифты сервиса через next/font/local: файл уезжает в /_next/static/media
 * с хешем в имени (кэш immutable на год), Onest прелоадится на каждой
 * странице, а на время загрузки подставляется Arial с подогнанными
 * метриками (size-adjust/ascent-override) — текст не прыгает при подмене.
 *
 * Имя семейства next/font хеширует (`'__onest_xxxx'`), поэтому в CSS шрифт
 * берём через переменные --font-onest / --font-jetbrains-mono (классы
 * .variable висят на <html>), а в JS — через `onest.style.fontFamily`
 * (Chart.js рисует на канвасе и CSS-переменные не понимает).
 * Литерал 'Onest' в коде больше не резолвится — не использовать.
 */

/* Onest (Variable). Pavel: переход на Onest (как на ida-ai-report).
   Вариативный файл из официального репозитория Google Fonts, полная
   кириллица, сбалансированные метрики (typoAscender 970 / typoDescender
   −305, USE_TYPO_METRICS) — текст центрируется в кнопках/полях/чипах без
   костылей. WOFF2 — lossless-конверсия прежнего TTF (те же глифы, оси и
   фичи), 58 КБ вместо 124 КБ.

   weight: '100 500' — диапазон намеренно обрезан сверху на Medium (500).
   Браузер клампит любой запрос тяжелее 500 к 500, так что «максимум Medium»
   гарантирован на уровне шрифта. */
export const onest = localFont({
  src: '../../public/fonts/onest/Onest-Variable.woff2',
  weight: '100 500',
  style: 'normal',
  display: 'swap',
  variable: '--font-onest',
  adjustFontFallback: 'Arial',
});

/* JetBrains Mono — для лейблов колонок, названий характеристик и тегов
   (тот же приём, что на rating.idaproject.com: .thead там набран mono +
   uppercase). Полная кириллица. Только Regular + Medium — тяжелее не нужно.
   Без прелоада: моно второстепенно, не отнимаем канал у Onest; без
   подгонки fallback'а — запасной стек моноширинный (см. tailwind.config). */
export const jetbrainsMono = localFont({
  src: [
    {
      path: '../../public/fonts/jetbrains-mono/JetBrainsMono-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/jetbrains-mono/JetBrainsMono-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
  ],
  display: 'swap',
  variable: '--font-jetbrains-mono',
  preload: false,
  adjustFontFallback: false,
});
