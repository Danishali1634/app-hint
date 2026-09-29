/**
 * @file Hero decoration + the big product visual under the start cards.
 *
 * <HeroBackdrop/>  absolutely positioned behind the hero: two soft blurred
 *   blobs (accent blue + cyan, plus a warm glow in light mode) drifting very
 *   slowly, and — in dark mode only — a faint grid fading out to the edges. Purely decorative, so it is
 *   aria-hidden and pointer-events-none; the parent clips it (no h-scroll).
 *
 * <HeroVisual/>    the existing looping HowItWorksDemo, lifted onto a glowing
 *   gradient frame that floats gently. The frame reserves its space up front,
 *   so nothing shifts while it animates.
 */

import { HowItWorksDemo } from '@/components/tutorial/HowItWorksDemo';
import { Reveal } from './HomeMotion';

const GRID_MASK = 'radial-gradient(ellipse 70% 60% at 50% 30%, #000 30%, transparent 75%)';

export function HeroBackdrop() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Faint grid, masked to a soft ellipse — dark mode only (it felt too
          technical on the soft light theme) */}
      <div
        className="absolute inset-0 hidden dark:block text-white/[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: GRID_MASK,
          WebkitMaskImage: GRID_MASK,
        }}
      />
      {/* Drifting colour blobs */}
      <div className="hm-blob-a absolute -top-32 left-[8%] w-[34rem] h-[34rem] max-w-[90vw] rounded-full bg-accent/20 dark:bg-accent/25 blur-3xl" />
      <div className="hm-blob-b absolute top-10 right-[4%] w-[28rem] h-[28rem] max-w-[80vw] rounded-full bg-violet/20 dark:bg-violet-dark/15 blur-3xl" />
      {/* A warm glow low on the left: keeps the light theme soft, not clinical */}
      <div className="hm-blob-a absolute top-[38%] -left-[6%] w-[26rem] h-[26rem] max-w-[70vw] rounded-full bg-amber-200/30 dark:bg-transparent blur-3xl" />
      {/* Fade into the page at the bottom */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-paper dark:to-paper-dark" />
    </div>
  );
}

export function HeroVisual() {
  return (
    <Reveal className="relative mx-auto max-w-4xl">
      {/* Glow under the frame */}
      <div
        className="absolute -inset-x-6 top-10 bottom-0 rounded-[3rem] bg-gradient-to-r from-accent/30 via-violet/25 to-accent/30 blur-3xl opacity-70 dark:opacity-60"
        aria-hidden="true"
      />
      <div className="hm-float relative">
        <div className="rounded-[1.75rem] p-px bg-gradient-to-b from-accent/50 via-line to-line dark:from-accent/60 dark:via-line-dark dark:to-line-dark shadow-premium">
          <div className="rounded-[1.7rem] bg-panel/80 dark:bg-panel-dark/80 backdrop-blur-xl p-3 sm:p-5">
            <HowItWorksDemo />
          </div>
        </div>
      </div>
    </Reveal>
  );
}
