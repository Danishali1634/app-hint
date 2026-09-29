/**
 * @file Shared building blocks for the Home page sections (components/home).
 *
 * WHY AN INLINE <style> (not index.css / tailwind.config.js)
 *   The home animations are only used here, and the global CSS + tokens are
 *   owned elsewhere. So every keyframe the home page needs lives in
 *   <HomeKeyframes/>, rendered once by HomePage. All names start with `hm-`
 *   so they can never clash with the app's `hs-` / `demo-` animations.
 *
 * MOTION RULES
 *   - Loops are slow and small (drift, float, pulse) — decoration, not noise.
 *   - prefers-reduced-motion: every `hm-` loop stops on a calm frame, and the
 *     scroll reveals are shown immediately (index.css already does that for
 *     `.reveal`; useInView reports "visible" straight away).
 *
 * Also exports:
 *   <Reveal>          rises into view once (useInView + .reveal/.is-visible)
 *   <SectionHeading>  eyebrow + big tight heading + short intro, revealed
 *   useSpotlight()    pointer position → CSS vars --mx / --my (bento tiles)
 */

import { useCallback } from 'react';
import { useInView } from '@/hooks/useInView';

const KEYFRAMES = `
@keyframes hm-blob-a { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(8%,6%) scale(1.12); } 66% { transform: translate(-6%,4%) scale(0.94); } }
@keyframes hm-blob-b { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-10%,-6%) scale(1.15); } }
@keyframes hm-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes hm-pan { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
@keyframes hm-flash { 0%,58%,100% { opacity: 0; } 62% { opacity: .85; } 72% { opacity: 0; } }
@keyframes hm-snap { 0%,58% { transform: scale(1); } 62% { transform: scale(.97); } 70%,100% { transform: scale(1); } }
@keyframes hm-draw { 0%,10% { transform: scale(0); opacity: 0; } 12% { opacity: 1; } 42%,88% { transform: scale(1); opacity: 1; } 96%,100% { transform: scale(1); opacity: 0; } }
@keyframes hm-chip { 0%,100% { background: transparent; color: inherit; } 8%,30% { background: var(--hm-chip-bg); color: #fff; } 38% { background: transparent; color: inherit; } }
@keyframes hm-type { 0%,40% { width: 0; } 70%,92% { width: 100%; } 100% { width: 0; } }
@keyframes hm-pop { 0%,100% { transform: scale(.7) translateY(6px); opacity: 0; } 12%,80% { transform: none; opacity: 1; } }
@keyframes hm-eq { 0%,100% { transform: scaleY(.25); } 50% { transform: scaleY(1); } }
@keyframes hm-ripple { 0%,48% { transform: translate(-50%,-50%) scale(0); opacity: 0; } 52% { opacity: .9; } 80%,100% { transform: translate(-50%,-50%) scale(2.6); opacity: 0; } }
@keyframes hm-press { 0%,44%,60%,100% { transform: scale(1); } 50% { transform: scale(.94); } }
@keyframes hm-pointer { 0% { transform: translate(90%,120%); } 40%,62% { transform: translate(0,0); } 100% { transform: translate(90%,120%); } }
@keyframes hm-zoom { 0%,12% { transform: scale(1); } 40%,78% { transform: scale(2.1); } 92%,100% { transform: scale(1); } }
@keyframes hm-spot { 0%,30% { opacity: 0; } 42%,76% { opacity: 1; } 88%,100% { opacity: 0; } }
@keyframes hm-rec { 0%,100% { opacity: 1; } 50% { opacity: .25; } }
@keyframes hm-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes hm-shimmer { 0% { transform: translateX(-120%); } 60%,100% { transform: translateX(220%); } }
@keyframes hm-caret { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
@keyframes hm-rise { from { opacity: 0; transform: translateY(22px); filter: blur(8px); } to { opacity: 1; transform: none; filter: none; } }

.hm-blob-a { animation: hm-blob-a 22s ease-in-out infinite; }
.hm-blob-b { animation: hm-blob-b 26s ease-in-out infinite; }
.hm-float { animation: hm-float 7s ease-in-out infinite; }
.hm-pan { background-size: 220% 220%; animation: hm-pan 14s ease-in-out infinite; }
.hm-flash { animation: hm-flash 4.5s ease-out infinite; }
.hm-snap { animation: hm-snap 4.5s ease-out infinite; }
.hm-draw { transform-origin: 0 0; animation: hm-draw 5s cubic-bezier(.65,0,.35,1) infinite; }
.hm-chip { animation: hm-chip 6s ease-in-out infinite; }
.hm-type { animation: hm-type 5s steps(28, end) infinite; }
.hm-pop { animation: hm-pop 4.8s cubic-bezier(.22,1,.36,1) infinite; }
.hm-eq { transform-origin: 50% 100%; animation: hm-eq 1.1s ease-in-out infinite; }
.hm-ripple { animation: hm-ripple 3s ease-out infinite; }
.hm-press { animation: hm-press 3s ease-in-out infinite; }
.hm-pointer { animation: hm-pointer 3s cubic-bezier(.65,0,.35,1) infinite; }
.hm-zoom { animation: hm-zoom 6s cubic-bezier(.65,0,.35,1) infinite; }
.hm-spot { animation: hm-spot 6s ease-in-out infinite; }
.hm-rec { animation: hm-rec 1.2s ease-in-out infinite; }
.hm-orbit { animation: hm-orbit 18s linear infinite; }
.hm-orbit-rev { animation: hm-orbit 18s linear infinite reverse; }
.hm-shimmer { animation: hm-shimmer 3.2s ease-in-out infinite; }
.hm-caret { animation: hm-caret 1s steps(1) infinite; }
/* Hero entrance: rises in once on load; stagger with an inline animation-delay. */
.hm-rise { animation: hm-rise 900ms cubic-bezier(.22,1,.36,1) both; }
.hm-orbit-fast { animation: hm-orbit 6s linear infinite; }

/* The "how it works" connector draws itself once the steps are visible. */
.hm-line { transform: scaleX(0); transform-origin: 0 50%; transition: transform 1400ms cubic-bezier(.22,1,.36,1) 250ms; }
.hm-line-v { transform: scaleY(0); transform-origin: 50% 0; transition: transform 1400ms cubic-bezier(.22,1,.36,1) 250ms; }
.is-visible .hm-line, .is-visible .hm-line-v { transform: none; }

/* Spotlight tiles (FeatureBento): light + border follow the pointer. */
.hm-tile { --mx: 50%; --my: 0%; }
.hm-tile-border { background: radial-gradient(420px circle at var(--mx) var(--my), rgba(34,211,238,.85), rgba(21,112,239,.6) 30%, transparent 62%); }
.hm-tile-light { background: radial-gradient(520px circle at var(--mx) var(--my), rgba(21,112,239,.10), transparent 45%); }
.dark .hm-tile-light { background: radial-gradient(520px circle at var(--mx) var(--my), rgba(56,145,255,.14), transparent 45%); }

@media (prefers-reduced-motion: reduce) {
  [class*="hm-"] { animation: none !important; }
  .hm-line, .hm-line-v { transition: none !important; transform: none !important; }
  .hm-draw, .hm-pop { opacity: 1; transform: none; }
  .hm-type { width: 100%; }
  .hm-flash, .hm-spot { opacity: 0; }
  .hm-ripple { opacity: 0; }
  .hm-pointer { transform: none; }
}
`;

/** Rendered once by HomePage: all `hm-` keyframes and helper classes. */
export function HomeKeyframes() {
  return <style>{KEYFRAMES}</style>;
}

/**
 * Rises into view once when scrolled to. `delay` staggers siblings (ms).
 * @param {{ as?: any, delay?: number, className?: string, children: any }} props
 */
export function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const [ref, visible] = useInView();
  return (
    <Tag
      ref={ref}
      className={`reveal ${visible ? 'is-visible' : ''} ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Eyebrow + large tight heading + one-line intro, centred by default. */
export function SectionHeading({ eyebrow, title, intro, align = 'center', children }) {
  const centred = align === 'center';
  return (
    <Reveal className={`${centred ? 'text-center mx-auto' : ''} max-w-2xl mb-10 sm:mb-14`}>
      <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent mb-3">
        <span className="w-6 h-px bg-accent/60" aria-hidden="true" />
        {eyebrow}
      </p>
      <h2 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.05] text-ink dark:text-white text-balance">
        {title}
      </h2>
      {intro && (
        <p className="mt-4 text-base sm:text-lg text-ink-soft dark:text-ink-faint-dark leading-relaxed">
          {intro}
        </p>
      )}
      {children}
    </Reveal>
  );
}

/** onPointerMove handler that writes the pointer position into --mx / --my. */
export function useSpotlight() {
  return useCallback((e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  }, []);
}
