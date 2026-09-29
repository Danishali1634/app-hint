/**
 * @file "How it works" — Capture → Highlight → Share, each with its own tiny
 * looping illustration (Tailwind + inline SVG + the `hm-` keyframes in
 * HomeMotion.js).
 *
 *   Capture    a screen gets "shot" (shutter flash) · a REC dot + timer
 *   Highlight  a dashed box draws over a button · Click / Look / Type chips
 *              light up in turn · one sentence types itself
 *   Share      link / embed / video chips pop out in sequence
 *
 * A connector line (horizontal on desktop, vertical on phones) draws itself
 * once the row scrolls into view; the step cards rise in, staggered.
 */

import { useInView } from '@/hooks/useInView';
import { Camera, Crosshair, Share2, Link2, Code2, Film, Check } from 'lucide-react';
import { SectionHeading } from './HomeMotion';

/** Small browser-window frame shared by the three illustrations. */
function MiniWindow({ children, className = '' }) {
  return (
    <div
      className={`relative h-full rounded-2xl border border-line dark:border-line-dark bg-paper dark:bg-paper-dark overflow-hidden ${className}`}
    >
      <div className="flex items-center gap-1 px-3 h-6 border-b border-line dark:border-line-dark bg-panel dark:bg-panel-dark">
        <span className="w-1.5 h-1.5 rounded-full bg-ink-faint/40" />
        <span className="w-1.5 h-1.5 rounded-full bg-ink-faint/40" />
        <span className="w-1.5 h-1.5 rounded-full bg-ink-faint/40" />
      </div>
      <div className="relative h-[calc(100%-1.5rem)]">{children}</div>
    </div>
  );
}

/** Grey "content" rows standing in for any app screen. */
function FakeRows({ count = 3 }) {
  return (
    <div className="absolute inset-x-4 top-3 space-y-2">
      <div className="h-2 w-1/3 rounded-full bg-ink/15 dark:bg-white/15" />
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="h-2 rounded-full bg-ink/[0.07] dark:bg-white/[0.07]"
          style={{ width: `${88 - i * 14}%` }}
        />
      ))}
    </div>
  );
}

function CaptureArt() {
  return (
    <MiniWindow className="hm-snap">
      <FakeRows count={4} />
      <div className="absolute left-4 bottom-4 h-7 w-20 rounded-lg bg-accent/80" />
      {/* Corner brackets = the capture frame */}
      {[
        'left-2 top-2 border-l-2 border-t-2',
        'right-2 top-2 border-r-2 border-t-2',
        'left-2 bottom-2 border-l-2 border-b-2',
        'right-2 bottom-2 border-r-2 border-b-2',
      ].map((pos) => (
        <span key={pos} className={`absolute w-4 h-4 border-accent rounded-sm ${pos}`} />
      ))}
      <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-panel dark:bg-panel-dark border border-line dark:border-line-dark px-2 py-0.5 text-[10px] font-semibold text-ink dark:text-ink-soft-dark tabular-nums">
        <span className="w-1.5 h-1.5 rounded-full bg-danger hm-rec" /> REC
      </span>
      {/* Shutter flash */}
      <span className="hm-flash absolute inset-0 bg-white" />
    </MiniWindow>
  );
}

function HighlightArt() {
  return (
    <MiniWindow>
      <FakeRows count={2} />
      {/* The feature + the box being drawn over it */}
      <div className="absolute left-4 top-[46%] h-7 w-24 rounded-lg bg-accent/80" />
      <div className="hm-draw absolute left-[0.7rem] top-[calc(46%-0.3rem)] h-[2.3rem] w-[6.6rem] rounded-lg border-2 border-dashed border-accent bg-accent/10" />
      {/* Click / Look / Type */}
      <div className="absolute right-3 top-3 flex flex-col gap-1 text-[10px] font-semibold text-ink-soft dark:text-ink-soft-dark">
        {['Click', 'Look', 'Type'].map((label, i) => (
          <span
            key={label}
            className="hm-chip rounded-md border border-line dark:border-line-dark bg-panel dark:bg-panel-dark px-2 py-0.5 text-center"
            style={{ animationDelay: `${i * 2}s`, '--hm-chip-bg': 'rgb(21 112 239)' }}
          >
            {label}
          </span>
        ))}
      </div>
      {/* The one sentence, typing */}
      <div className="absolute inset-x-3 bottom-3 rounded-lg bg-panel dark:bg-panel-dark border border-line dark:border-line-dark px-2.5 py-1.5 flex items-center">
        <span className="hm-type block overflow-hidden whitespace-nowrap text-[11px] text-ink dark:text-ink-soft-dark">
          Click Export to download it.
        </span>
        <span className="hm-caret ml-px w-px h-3 bg-accent" />
      </div>
    </MiniWindow>
  );
}

function ShareArt() {
  const items = [
    { Icon: Link2, label: 'Copy link' },
    { Icon: Code2, label: 'Embed code' },
    { Icon: Film, label: 'MP4 video' },
  ];
  return (
    <MiniWindow>
      <div className="absolute inset-0 flex flex-col justify-center gap-2 px-4">
        {items.map(({ Icon, label }, i) => (
          <div
            key={label}
            className="hm-pop flex items-center gap-2 rounded-xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark px-2.5 py-1.5 shadow-sm"
            style={{ animationDelay: `${i * 0.35}s` }}
          >
            <span className="w-6 h-6 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
              <Icon className="w-3.5 h-3.5" />
            </span>
            <span className="text-[11px] font-semibold text-ink dark:text-ink-soft-dark">
              {label}
            </span>
            <Check className="ml-auto w-3.5 h-3.5 text-teal dark:text-teal-dark" />
          </div>
        ))}
      </div>
    </MiniWindow>
  );
}

const STEPS = [
  {
    Icon: Camera,
    title: 'Capture',
    text: 'Add a screenshot of each screen, or record yourself doing the task once.',
    Art: CaptureArt,
  },
  {
    Icon: Crosshair,
    title: 'Highlight',
    text: 'Drag a box over the feature, pick Click, Look or Type, and write one sentence.',
    Art: HighlightArt,
  },
  {
    Icon: Share2,
    title: 'Share',
    text: 'Send a link, paste an embed code into any page, or download it as a video.',
    Art: ShareArt,
  },
];

export function HowItWorksSteps() {
  const [ref, visible] = useInView();
  return (
    <section>
      <SectionHeading
        eyebrow="How it works"
        title="Three steps. No video editing."
        intro="If you can take a screenshot, you can make a walkthrough."
      />
      <div ref={ref} className={`relative ${visible ? 'is-visible' : ''}`}>
        {/* Connector: horizontal behind the step numbers on desktop … */}
        <div
          className="hidden md:block absolute left-[16.66%] right-[16.66%] top-6 h-px bg-line dark:bg-line-dark"
          aria-hidden="true"
        >
          <div className="hm-line h-full bg-gradient-to-r from-accent via-violet to-accent" />
        </div>
        {/* … vertical on phones */}
        <div
          className="md:hidden absolute left-6 top-6 bottom-6 w-px bg-line dark:bg-line-dark"
          aria-hidden="true"
        >
          <div className="hm-line-v w-full h-full bg-gradient-to-b from-accent via-violet to-accent" />
        </div>

        <ol className="grid gap-8 md:gap-6 md:grid-cols-3">
          {STEPS.map(({ Icon, title, text, Art }, i) => (
            <li
              key={title}
              className={`reveal ${visible ? 'is-visible' : ''} relative pl-16 md:pl-0`}
              style={{ transitionDelay: visible ? `${200 + i * 180}ms` : '0ms' }}
            >
              {/* Step number on the line */}
              <div className="absolute left-0 top-0 md:static md:flex md:justify-center md:mb-6">
                <span className="relative w-12 h-12 rounded-2xl bg-panel dark:bg-panel-dark border border-line dark:border-line-dark shadow-premium flex items-center justify-center text-accent">
                  <Icon className="w-5 h-5" />
                  <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center shadow-glow">
                    {i + 1}
                  </span>
                </span>
              </div>
              <div className="rounded-3xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark shadow-premium p-4 sm:p-5 transition-transform duration-300 hover:-translate-y-1">
                <div className="h-40" aria-hidden="true">
                  <Art />
                </div>
                <h3 className="mt-5 text-lg font-bold tracking-tight text-ink dark:text-white">
                  {title}
                </h3>
                <p className="mt-1.5 text-sm text-ink-soft dark:text-ink-faint-dark leading-relaxed">
                  {text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
