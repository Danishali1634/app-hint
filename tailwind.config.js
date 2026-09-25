/** @type {import('tailwindcss').Config} */
/**
 * Design tokens. Every component uses these names (paper, panel, ink, line,
 * accent, …), so the whole app is re-themed here.
 *
 * Palette: neutral zinc greys + an indigo accent (in the spirit of Linear /
 * Stripe / Vercel). Near-black dark mode, soft off-white light mode.
 * Hard-coded copies of the accent live in index.css (glow keyframes) and
 * services/video/renderFrame.js (video colours) — keep them in sync.
 */
export default {
  content: ['./index.html', './src/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Page backgrounds (paper) and raised surfaces (panel)
        paper: { DEFAULT: '#F7F7F8', dark: '#08080A', 2: '#EFEFF2', '2-dark': '#141418' },
        panel: { DEFAULT: '#FFFFFF', dark: '#111114' },
        // Text
        ink: {
          DEFAULT: '#0B0B0F',
          soft: '#52525B',
          faint: '#8E8E98',
          'soft-dark': '#E6E6EA',
          'faint-dark': '#7A7A85',
        },
        // Borders / dividers
        line: { DEFAULT: '#E4E4E8', dark: '#232329' },
        // Brand accent (indigo). `dark` = hover shade.
        accent: {
          DEFAULT: '#635BFF',
          ink: '#2B2575',
          soft: '#EEEDFF',
          dark: '#5046E5',
          'ink-dark': '#C9C6FF',
          'soft-dark': '#1C1A3A',
        },
        // Success / "recorded voice" (emerald)
        teal: { DEFAULT: '#0E9F6E', soft: '#E6F7F0', dark: '#34D399', 'soft-dark': '#0C2A20' },
        // "AI voice" (violet)
        violet: { DEFAULT: '#7C3AED', soft: '#F1EAFE', dark: '#A78BFA', 'soft-dark': '#221A3A' },
        danger: { DEFAULT: '#E5484D', dark: '#FF6369' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        // Soft, layered elevation used by cards and dialogs
        premium: '0 1px 2px rgba(16,16,24,0.04), 0 8px 24px -6px rgba(16,16,24,0.10)',
        glow: '0 0 0 1px rgba(99,91,255,0.25), 0 8px 30px -4px rgba(99,91,255,0.45)',
      },
      animation: {
        'pulse-rec': 'pulse-rec 1s ease-in-out infinite',
        'spin-slow': 'spin 2.2s linear infinite',
      },
      keyframes: {
        'pulse-rec': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.25' },
        },
      },
    },
  },
  plugins: [],
};
