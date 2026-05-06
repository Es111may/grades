import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Base44 design tokens — see Design Documentation.md
        canvas: '#faf9f7',
        snow: '#ffffff',
        ink: '#000000',
        graphite: '#232529',
        slate2: '#324158',
        stone: '#696f7b',
        ash: '#cfcfcf',
        cloud: '#e6e6e6',
        lime: { DEFAULT: '#ade900', light: '#ebffb1', dim: '#f6ffce' },
        sunset: '#d8723c',
        blaze: '#ff631f',
      },
      fontFamily: {
        display: ['Manrope', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        soft: 'rgba(34,40,42,0.04) 0px 3px 10px',
        'soft-lg': 'rgba(34,40,42,0.06) 0px 6px 24px',
      },
      borderRadius: {
        card: '8px',
        prominent: '14px',
        modal: '16px',
        pill: '999px',
      },
    },
  },
  plugins: [],
};

export default config;
