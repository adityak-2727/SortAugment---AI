/** @type {import('tailwindcss').Config} */
const ALPINE_BLUE = {
  50: '#EBF6FF',
  100: '#D4ECFE',
  200: '#A6D8FC',
  300: '#70C1FA',
  500: '#0EA5E9',
  600: '#0274B3',
  700: '#035E91',
  800: '#08476E',
};

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F3F8FC',
        surface: '#FFFFFF',
        recessed: '#E7F0F7',
        ink: {
          DEFAULT: '#0F1E2E',
          muted: '#42586E',
          subtle: '#5C738A',
        },
        alpine: ALPINE_BLUE,
        // Aliased to Alpine blue so existing pages immediately inherit the new palette
        forest: ALPINE_BLUE,
        emeraldok: {
          bg: '#E8F7F0',
          border: '#AEE0C7',
          accent: '#10B981',
          text: '#0F6342',
        },
        amberwarn: {
          bg: '#FEF6E4',
          border: '#F0CE8E',
          accent: '#E9A23B',
          text: '#7A4704',
        },
        err: {
          bg: '#FEF0F0',
          border: '#F0BDBD',
          accent: '#D14B4B',
          text: '#922626',
        },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        sans: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        card: '16px',
        panel: '18px',
        control: '14px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 30, 46, 0.04), 0 8px 24px -8px rgba(2, 116, 179, 0.09)',
        elevated: '0 2px 6px rgba(15, 30, 46, 0.05), 0 18px 38px -12px rgba(2, 116, 179, 0.16)',
        popover: '0 6px 16px rgba(15, 30, 46, 0.08), 0 24px 48px -14px rgba(15, 30, 46, 0.16)',
        glass: 'inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 10px 28px -10px rgba(2, 116, 179, 0.12)',
      },
    },
  },
  plugins: [],
};