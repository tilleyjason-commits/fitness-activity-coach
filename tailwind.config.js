/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      /*
       * Display sizes carry page and section hierarchy; stat sizes are for the
       * numeric readouts (calories left, streak, countdown). Both tighten
       * tracking, which Inter needs above ~24px to avoid looking loose.
       */
      fontSize: {
        display: ['1.75rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        'display-sm': ['1.375rem', { lineHeight: '1.2', letterSpacing: '-0.015em' }],
        stat: ['2rem', { lineHeight: '1.05', letterSpacing: '-0.025em' }],
        'stat-sm': ['1.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
      },
    },
  },
  plugins: [],
};
