/** @type {import('tailwindcss').Config} */
const v = (n) => `hsl(var(--${n}) / <alpha-value>)`;
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'] },
      colors: {
        bg: v('bg'), surface: v('surface'), 'surface-2': v('surface-2'), border: v('border'),
        fg: v('fg'), muted: v('muted'), primary: v('primary'), 'primary-fg': v('primary-fg'),
        accent: v('accent'), 'accent-fg': v('accent-fg'),
        success: v('success'), warning: v('warning'), danger: v('danger'), info: v('info'),
        'success-soft': v('success-soft'), 'warning-soft': v('warning-soft'), 'danger-soft': v('danger-soft'), 'info-soft': v('info-soft'),
        ring: v('ring'), sidebar: v('sidebar'), 'sidebar-fg': v('sidebar-fg'), 'sidebar-muted': v('sidebar-muted'), 'sidebar-active': v('sidebar-active'),
      },
      borderRadius: { lg: '10px', md: '8px', sm: '6px' },
    },
  },
  plugins: [],
};
