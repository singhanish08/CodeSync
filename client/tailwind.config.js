/** @type {import('tailwindcss').Config} */

// Wrap a CSS-variable token so Tailwind's opacity modifiers work. Plain
// `var(--x)` colors silently DROP `/12`-style modifiers (Tailwind cannot split
// a variable into channels), so every token is emitted as a color-mix() with
// the resolved alpha as a percentage. With no modifier the alpha is 100%,
// i.e. the raw token — so `bg-danger` and `bg-danger/10` both work.
const mix = (token) => ({ opacityValue = 1 }) =>
  `color-mix(in srgb, var(${token}) ${Math.round(opacityValue * 100)}%, transparent)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Every component references these Tailwind utilities (bg-bg-primary,
        // text-text-primary, border-border, …) so the raw hex values live only
        // in :root inside globals.css. Never hardcode hex in a component.
        'bg-primary': mix('--bg-primary'),
        'bg-secondary': mix('--bg-secondary'),
        'text-primary': mix('--text-primary'),
        'text-secondary': mix('--text-secondary'),
        accent: mix('--accent'),
        'accent-2': mix('--accent-2'),
        'accent-3': mix('--accent-3'),
        'accent-foreground': mix('--accent-foreground'),
        border: mix('--border'),
        'code-bg': mix('--code-bg'),
        'surface-glass': mix('--surface-glass'),
        'grid-line': mix('--grid-line'),
        glow: mix('--glow'),
        success: mix('--success'),
        danger: mix('--danger'),
        'danger-foreground': mix('--danger-foreground'),
        warning: mix('--warning'),
        // Collaborator-cursor palette, per theme.
        'cursor-1': mix('--cursor-1'),
        'cursor-2': mix('--cursor-2'),
        'cursor-3': mix('--cursor-3'),
        'cursor-4': mix('--cursor-4'),
        'cursor-5': mix('--cursor-5'),
        'cursor-6': mix('--cursor-6'),
        'cursor-7': mix('--cursor-7'),
        'cursor-8': mix('--cursor-8'),
      },
      borderRadius: {
        control: '12px',
        card: '20px',
        panel: '28px',
      },
      // `12` isn't in Tailwind's default opacity scale but the diff rows use it
      // (bg-success/12, bg-danger/12) as a faint added/removed tint.
      opacity: {
        12: '0.12',
      },
      boxShadow: {
        soft: '0 1px 3px 0 var(--shadow), 0 1px 2px -1px var(--shadow)',
        lifted: '0 10px 30px -12px var(--shadow)',
        // Premium light-theme "lifted off paper" stack.
        paper:
          '0 1px 2px -1px var(--shadow), 0 4px 10px -4px var(--shadow), 0 24px 48px -24px var(--shadow)',
        glow: '0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent), 0 8px 30px -8px var(--glow)',
      },
      fontFamily: {
        sans: [
          'Inter Variable',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        display: [
          'Bricolage Grotesque Variable',
          'Inter Variable',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono Variable',
          'JetBrains Mono',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      animation: {
        'gradient-pan': 'gradient-pan 14s ease infinite',
        'pulse-soft': 'pulse-soft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        aurora: 'aurora 22s ease-in-out infinite',
        shimmer: 'shimmer 2.2s linear infinite',
        marquee: 'marquee 38s linear infinite',
        'marquee-reverse': 'marquee-reverse 38s linear infinite',
        'caret-blink': 'caret-blink 1.1s steps(1) infinite',
        float: 'float 7s ease-in-out infinite',
      },
      keyframes: {
        'gradient-pan': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        aurora: {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)', opacity: '0.75' },
          '33%': { transform: 'translate3d(3%, -2%, 0) scale(1.06)', opacity: '1' },
          '66%': { transform: 'translate3d(-2%, 2%, 0) scale(0.97)', opacity: '0.6' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'marquee-reverse': {
          '0%': { transform: 'translateX(-50%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'caret-blink': {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
    },
  },
  plugins: [],
};
