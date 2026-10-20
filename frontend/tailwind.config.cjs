/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // Watch Doctor v2 tokens; values come from src/design/tokens.css.
      colors: {
        dw: {
          ground: 'var(--dw-ground)',
          surface: 'var(--dw-surface)',
          sunken: 'var(--dw-sunken)',
          line: 'var(--dw-line)',
          border: 'var(--dw-border)',
          'border-strong': 'var(--dw-border-strong)',
          text: 'var(--dw-text)',
          body: 'var(--dw-body)',
          caption: 'var(--dw-caption)',
          accent: 'var(--dw-accent)',
          'accent-hover': 'var(--dw-accent-hover)',
          'accent-soft': 'var(--dw-accent-soft)',
          success: 'var(--dw-success)',
          'success-soft': 'var(--dw-success-soft)',
          warning: 'var(--dw-warning)',
          'warning-soft': 'var(--dw-warning-soft)',
          danger: 'var(--dw-danger)',
          'danger-soft': 'var(--dw-danger-soft)',
        },
      },
      fontFamily: {
        dw: ['Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        'dw-control': '12px',
        'dw-card': '16px',
      },
      boxShadow: {
        'dw-pop': '0 12px 32px rgba(31, 41, 51, 0.16)',
      },
    },
  },
  plugins: [],
};
