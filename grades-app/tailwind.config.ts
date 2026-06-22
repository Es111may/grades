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
      boxShadow: {
        soft: '0 1px 2px rgba(0, 0, 0, 0.04), 0 0 0 0.5px rgba(0, 0, 0, 0.05)',
        'soft-md':
          '0 4px 12px rgba(0, 0, 0, 0.06), 0 0 0 0.5px rgba(0, 0, 0, 0.05)',
        'soft-lg':
          '0 12px 32px rgba(0, 0, 0, 0.08), 0 0 0 0.5px rgba(0, 0, 0, 0.05)',
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
      },
    },
  },
  plugins: [],
};

export default config;
