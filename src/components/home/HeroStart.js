/**
 * @file The first thing visitors see: the headline and the two ways to start.
 *
 * LESS TEXT, MORE MOTION
 *   - The headline rises in word by word; its second line is a slowly flowing
 *     blue → cyan gradient.
 *   - One short line under it — no badge, no lists.
 *   - Two start cards, each with a live mini animation that shows what it does
 *     (a box being drawn on a screen / a recording in progress), a softly
 *     orbiting gradient border that brightens on hover, a light sweep, a lift.
 *   - They rise in after the headline. Everything stops calmly for
 *     prefers-reduced-motion (HomeMotion's `hm-` rules).
 */

import { useNavigate } from 'react-router-dom';
import { ArrowRight, PlayCircle } from 'lucide-react';

const HEADLINE = ['Show', 'every', 'feature'];

export function HeroStart() {
  const navigate = useNavigate();
  return (
    <section className="text-center">
      <h1 className="text-[2.7rem] leading-[1.02] sm:text-7xl lg:text-[5.25rem] font-bold tracking-tight text-ink dark:text-white">
        <span className="block">
          {HEADLINE.map((word, n) => (
            <span
              key={word}
              className="hm-rise inline-block mr-[0.22em] last:mr-0"
              style={{ animationDelay: `${n * 90}ms` }}
            >
              {word}
            </span>
          ))}
        </span>
        <span
          className="hm-rise hm-pan block pb-2 bg-gradient-to-r from-accent via-cyan-500 to-accent bg-clip-text text-transparent"
          style={{ animationDelay: '300ms' }}
        >
          without a manual
        </span>
      </h1>
      <p
        className="hm-rise mt-5 text-lg sm:text-xl text-ink-soft dark:text-ink-faint-dark"
        style={{ animationDelay: '450ms' }}
      >
        Turn any screen into a guided walkthrough.
      </p>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 max-w-3xl mx-auto text-left">
        <StartCard
          delay={600}
          title="Use screenshots"
          text="Upload your screens, draw a box, done."
          cta="Start with screenshots"
          onClick={() => navigate('/new')}
          art={<DrawArt />}
        />
        <StartCard
          delay={720}
          title="Record my screen"
          text="Do the task once, add steps after."
          cta="Start recording"
          onClick={() => navigate('/new?mode=video')}
          art={<RecordArt />}
        />
      </div>

      <button
        onClick={() => navigate('/examples')}
        className="hm-rise mt-7 inline-flex items-center gap-2 text-sm font-semibold text-ink-soft dark:text-ink-soft-dark hover:text-accent transition-colors"
        style={{ animationDelay: '850ms' }}
      >
        <PlayCircle className="w-4 h-4" /> See examples first
      </button>
    </section>
  );
}

/** A start card: animated border, a live picture of what it does, one line, one button. */
function StartCard({ delay, title, text, cta, onClick, art }) {
  return (
    <button
      onClick={onClick}
      className="hm-rise group relative block rounded-[1.75rem] p-[1.5px] overflow-hidden text-left transition-transform duration-300 hover:-translate-y-1.5 focus-visible:-translate-y-1.5"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Orbiting gradient border: faint at rest, bright on hover */}
      <span
        className="hm-orbit-fast absolute -inset-[70%] opacity-40 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background:
            'conic-gradient(from 0deg, transparent 0deg, rgba(21,112,239,.9) 60deg, rgba(34,211,238,.9) 110deg, transparent 170deg, transparent 360deg)',
        }}
        aria-hidden="true"
      />
      <span
        className="absolute inset-0 rounded-[1.75rem] bg-line/70 dark:bg-line-dark/70 -z-0"
        aria-hidden="true"
      />
      <span className="relative flex flex-col h-full rounded-[calc(1.75rem-1.5px)] bg-panel dark:bg-panel-dark p-5 sm:p-6 overflow-hidden shadow-premium group-hover:shadow-glow transition-shadow duration-300">
        {/* Light sweep on hover */}
        <span
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent -skew-x-12 opacity-0 group-hover:opacity-100 group-hover:translate-x-[420%] transition-all duration-1000"
          aria-hidden="true"
        />
        <span className="relative block rounded-2xl overflow-hidden border border-line dark:border-line-dark bg-paper-2 dark:bg-paper-2-dark aspect-[16/8]">
          {art}
        </span>
        <span className="relative mt-5 block text-xl font-bold tracking-tight text-ink dark:text-white">
          {title}
        </span>
        <span className="relative mt-1 block text-sm text-ink-soft dark:text-ink-faint-dark">
          {text}
        </span>
        <span className="relative mt-5 flex items-center justify-center gap-2 h-12 rounded-xl bg-accent text-white text-base font-semibold group-hover:bg-accent-dark transition-colors">
          {cta}
          <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
        </span>
      </span>
    </button>
  );
}

/** A small app screen where a highlight box is drawn over a button, then clicked. */
function DrawArt() {
  return (
    <span className="absolute inset-0" aria-hidden="true">
      <span className="absolute inset-x-0 top-0 h-[16%] bg-[#1f2a44]" />
      <span className="absolute left-[6%] top-[28%] h-[9%] w-[30%] rounded bg-ink/15 dark:bg-white/15" />
      {[0, 1, 2].map((r) => (
        <span
          key={r}
          className="absolute left-[6%] right-[6%] h-[9%] rounded bg-white dark:bg-white/10 border border-line/80 dark:border-line-dark"
          style={{ top: `${50 + r * 15}%` }}
        />
      ))}
      <span className="absolute right-[8%] top-[26%] w-[26%] h-[14%] rounded-md bg-teal" />
      {/* The box being drawn, then the click */}
      <span className="hm-draw absolute right-[6.5%] top-[22%] w-[29%] h-[22%] rounded-lg border-2 border-accent bg-accent/15" />
      <span
        className="hm-ripple absolute w-10 h-10 rounded-full border-2 border-accent"
        style={{ right: '21%', top: '33%' }}
      />
    </span>
  );
}

/** A recording in progress: REC badge, running timer and live sound bars. */
function RecordArt() {
  return (
    <span
      className="absolute inset-0 flex flex-col items-center justify-center gap-3"
      aria-hidden="true"
    >
      <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-ink text-white dark:bg-white dark:text-ink text-xs font-bold shadow">
        <span className="hm-rec w-2.5 h-2.5 rounded-full bg-danger" /> REC
        <span className="tabular-nums font-semibold opacity-80">0:07</span>
      </span>
      <span className="flex items-end gap-1 h-10">
        {[0.5, 0.9, 0.35, 1, 0.6, 0.8, 0.4, 0.95, 0.55, 0.75, 0.45, 0.85].map((h, n) => (
          <span
            key={n}
            className="hm-eq w-1.5 rounded-full bg-gradient-to-t from-accent to-cyan-400"
            style={{ height: `${h * 100}%`, animationDelay: `${n * 90}ms` }}
          />
        ))}
      </span>
    </span>
  );
}
