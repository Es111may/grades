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
        // Бордеры и разделители
        ash: '#d2d2d7',
        cloud: '#e5e5ea',
        // Бренд
        lime: { DEFAULT: '#ade900', light: '#ebffb1', dim: '#f6ffce', dark: '#7ba300' },
        // Системные акценты Apple-style
        sunset: '#ff9500',
        blaze: '#ff3b30',
        sky: '#007aff',
        emerald: '#34c759',
      },
      fontFamily: {
        display: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          'Manrope',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
        mono: ['"SF Mono"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(0, 0, 0, 0.04), 0 0 0 0.5px rgba(0, 0, 0, 0.05)',
        'soft-md':
          '0 4px 12px rgba(0, 0, 0, 0.06), 0 0 0 0.5px rgba(0, 0, 0, 0.05)',
        'soft-lg':
          '0 12px 32px rgba(0, 0, 0, 0.08), 0 0 0 0.5px rgba(0, 0, 0, 0.05)',
        focus: '0 0 0 4px rgba(0, 122, 255, 0.18)',
      },
      borderRadius: {
        card: '12px',
        prominent: '14px',
        modal: '20px',
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
