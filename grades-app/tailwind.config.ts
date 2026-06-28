import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // App-wide background — мягкий off-white в духе Apple
        canvas: '#f5f5f7',
        snow: '#ffffff',
        // Текст
        ink: '#1d1d1f',
        graphite: '#2c2c2e',
        stone: '#6e6e73',
        // Бордеры и разделители. ash используется и для текста-«подписей»
        // (счётчики, «—», «· опционально», «нет данных») — берём оттенок
        // потемнее, чтобы такой текст был читаемым на белом фоне.
        ash: '#a1a1a6',
        cloud: '#e5e5ea',
        // Бренд — основной зелёный + производные оттенки в той же тональности
        lime: { DEFAULT: '#d5ff0c', light: '#ebff8a', dim: '#f8ffcc', dark: '#a8cd00' },
        // Системные акценты Apple-style
        sunset: '#ff9500',
        blaze: '#ff3b30',
        sky: '#007aff',
        emerald: '#34c759',
      },
      // Шрифты: Aeonik Pro (Variable, max Medium) для display и sans.
      // mono — JetBrains Mono: лейблы колонок, названия характеристик, теги,
      // а также код/числа (auth-коды, grade.code, audit-JSON). SF Mono —
      // системный fallback. Системный fallback на оба случая загрузки.
      fontFamily: {
        display: [
          '"Aeonik Pro"',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
        sans: [
          '"Aeonik Pro"',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'ui-monospace', 'monospace'],
      },
      // Многослойные тени с холодным ink-оттенком (не чистый чёрный) — дают
      // более «дорогую», реалистичную глубину. Хайралайн 0.5px остаётся как
      // чёткая граница карточки на светлом фоне.
      boxShadow: {
        soft: '0 1px 1px rgba(17,24,39,0.04), 0 2px 6px rgba(17,24,39,0.04), 0 0 0 0.5px rgba(17,24,39,0.04)',
        'soft-md':
          '0 2px 4px rgba(17,24,39,0.04), 0 10px 24px rgba(17,24,39,0.07), 0 0 0 0.5px rgba(17,24,39,0.05)',
        'soft-lg':
          '0 6px 12px rgba(17,24,39,0.05), 0 24px 56px rgba(17,24,39,0.12), 0 0 0 0.5px rgba(17,24,39,0.05)',
        focus: '0 0 0 4px rgba(0, 122, 255, 0.18)',
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
      animation: {
        'fade-up': 'fade-up 0.45s cubic-bezier(0.16,1,0.3,1) both',
        'fade-in': 'fade-in 0.3s ease-out both',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.16,1,0.3,1) both',
      },
    },
  },
  plugins: [],
};

export default config;
