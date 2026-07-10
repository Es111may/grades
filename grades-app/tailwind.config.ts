import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      // === ДВУХТЕМНАЯ ПАЛИТРА ===
      // Значения токенов живут в CSS-переменных (globals.css): :root — тёмная
      // тема (дефолт), html[data-theme='light'] — светлая. Формат
      // rgb(var(--x) / <alpha-value>) сохраняет работу alpha-модификаторов
      // (bg-cloud/60, text-blaze/10 и т.п.) в обеих темах.
      colors: {
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
        snow: 'rgb(var(--c-snow) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        graphite: 'rgb(var(--c-graphite) / <alpha-value>)',
        stone: 'rgb(var(--c-stone) / <alpha-value>)',
        ash: 'rgb(var(--c-ash) / <alpha-value>)',
        cloud: 'rgb(var(--c-cloud) / <alpha-value>)',
        lime: {
          DEFAULT: 'rgb(var(--c-lime) / <alpha-value>)',
          light: 'rgb(var(--c-lime-light) / <alpha-value>)',
          dim: 'rgb(var(--c-lime-dim) / <alpha-value>)',
          dark: 'rgb(var(--c-lime-dark) / <alpha-value>)',
        },
        sunset: 'rgb(var(--c-sunset) / <alpha-value>)',
        blaze: 'rgb(var(--c-blaze) / <alpha-value>)',
        sky: 'rgb(var(--c-sky) / <alpha-value>)',
        emerald: 'rgb(var(--c-emerald) / <alpha-value>)',
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
      // Тени — тоже per-theme (см. --shadow-* в globals.css): тёмная тема
      // строит глубину на светлом hairline, светлая — на слоистых серых тенях.
      boxShadow: {
        soft: 'var(--shadow-soft)',
        'soft-md': 'var(--shadow-soft-md)',
        'soft-lg': 'var(--shadow-soft-lg)',
        focus: '0 0 0 4px rgb(var(--c-sky) / 0.22)',
      },
      // Скругления — подтянуты ближе к rating.idaproject.com (там карточки
      // 22px, мелкие элементы 11px). Берём чуть мягче исходного, но без
      // перегиба для плотного светлого UI. Поля ввода вынесены из card на
      // фиксированные 11px (см. .input в globals.css), чтобы не «раздувались».
      // Скругления — как в концептах (r22 у карточек)
      borderRadius: {
        card: '22px',
        prominent: '24px',
        modal: '26px',
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
