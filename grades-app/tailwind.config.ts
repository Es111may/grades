import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      // === ТЁМНАЯ ТЕМА (Apple dark, референс — ida-ai-report) ===
      // Семантика токенов сохранена, значения инвертированы. Благодаря этому
      // весь UI переключился без правки классов в компонентах:
      //   canvas — «фон-подложка» (в тёмной теме СВЕТЛЕЕ карточки: hover строк,
      //   thead, вложенные области), snow — поверхность карточки, ink — основной
      //   текст, stone/ash — вторичный/третичный текст (поменялись местами
      //   относительно светлой темы), cloud — бордеры и заливки чипов.
      colors: {
        canvas: '#1c1c1e',
        snow: '#151517',
        ink: '#f5f5f7',
        graphite: '#d1d1d6',
        stone: '#a1a1a6',
        ash: '#6e6e73',
        cloud: '#2c2c2e',
        // Бренд-лайм остаётся. light/dim стали тёмными лаймовыми подложками
        // (на них светлый текст), dark — светлый лайм для текста на тёмном.
        lime: { DEFAULT: '#d5ff0c', light: '#31380a', dim: '#20250a', dark: '#e4ff5c' },
        // Системные акценты — iOS dark варианты (ярче под тёмный фон)
        sunset: '#ff9f0a',
        blaze: '#ff453a',
        sky: '#0a84ff',
        emerald: '#30d158',
      },
      // Шрифты: Onest (Variable, max Medium — как на ida-ai-report) для
      // display и sans. mono — JetBrains Mono: лейблы колонок, названия
      // характеристик, код/числа. SF Mono — системный fallback.
      fontFamily: {
        display: [
          'Onest',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
        sans: [
          'Onest',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'ui-monospace', 'monospace'],
      },
      // Тени для тёмной темы: чёрные тени на чёрном почти не видны, поэтому
      // глубина строится на светлом hairline (0.5px rgba(255,255,255,…)) —
      // «подсвеченная кромка» карточки, как в реф. --line. Плюс чёрная тень
      // для отрыва на средних/крупных уровнях.
      boxShadow: {
        soft: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.07)',
        'soft-md':
          '0 4px 12px rgba(0,0,0,0.45), 0 0 0 0.5px rgba(255,255,255,0.09)',
        'soft-lg':
          '0 12px 40px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.10)',
        focus: '0 0 0 4px rgba(10, 132, 255, 0.25)',
      },
      // Скругления — подтянуты ближе к rating.idaproject.com (там карточки
      // 22px, мелкие элементы 11px). Берём чуть мягче исходного, но без
      // перегиба для плотного светлого UI. Поля ввода вынесены из card на
      // фиксированные 11px (см. .input в globals.css), чтобы не «раздувались».
      borderRadius: {
        card: '16px',
        prominent: '18px',
        modal: '22px',
        pill: '999px',
      },
      transitionTimingFunction: {
        'apple-out': 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        // Выразительный «выезд» для появлений — быстрый старт, мягкое
        // торможение. Хорош для fade-up / scale-in.
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      // Появления контента. Используются точечно (страницы, модалки, ряды).
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      // easeOutCubic — плавная задержка без резкого «снэпа» в начале (expo
      // давал рывок). backwards — держит стартовый кадр во время delay, но
      // после анимации НЕ оставляет transform на элементе (чище, не ломает
      // позиционирование fixed-потомков).
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.33, 1, 0.68, 1) backwards',
        'fade-in': 'fade-in 0.4s cubic-bezier(0.33, 1, 0.68, 1) backwards',
        'scale-in': 'scale-in 0.26s cubic-bezier(0.33, 1, 0.68, 1) backwards',
      },
    },
  },
  plugins: [],
};

export default config;
