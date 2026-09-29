/** @type {import('tailwindcss').Config} */
/**
 * Design tokens. Every component uses these names (paper, panel, ink, line,
 * accent, …), so the whole app is re-themed here.
 *
 * Palette: light = soft and warm (ivory page, white cards, warm-grey lines,
 * gentle text contrast: easy on the eyes); dark = a cinematic near-black
 * (think Netflix). One friendly blue accent in both.
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
        paper: { DEFAULT: '#F8F7F4', dark: '#0A0A0B', 2: '#F0EEE9', '2-dark': '#1D1D20' },
        panel: { DEFAULT: '#FFFFFF', dark: '#141416' },
        // Text
        ink: {
          DEFAULT: '#1D1F24',
          soft: '#4E535C',
          faint: '#8C9098',
          'soft-dark': '#EDEDEF',
          'faint-dark': '#8F8F98',
        },
        // Borders / dividers
        line: { DEFAULT: '#E8E5DE', dark: '#2A2A2F' },
        // Brand accent (bright blue). `dark` = hover shade.
        accent: {
          DEFAULT: '#1570EF',
          ink: '#1849A9',
          soft: '#EAF3FF',
          dark: '#175CD3',
          'ink-dark': '#9CC8FF',
          'soft-dark': '#0F2748',
        },
        // Success / "recorded voice" (emerald)
        teal: { DEFAULT: '#0E9F6E', soft: '#E6F7F0', dark: '#34D399', 'soft-dark': '#0C2A20' },
        // "AI voice" — the token is still called violet, the colour is cyan now
        violet: { DEFAULT: '#0891B2', soft: '#E0F5FA', dark: '#22D3EE', 'soft-dark': '#0B2A33' },
        danger: { DEFAULT: '#E5484D', dark: '#FF6369' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        // Soft, layered elevation used by cards and dialogs
        premium: '0 1px 2px rgba(41,37,36,0.04), 0 12px 32px -14px rgba(41,37,36,0.12)',
        glow: '0 0 0 1px rgba(21,112,239,0.25), 0 8px 30px -4px rgba(21,112,239,0.45)',
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
