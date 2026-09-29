/**
 * @file "Why teams trust it" — honest reasons, straight from how the app is
 * built. No logos, testimonials or invented numbers (same rule as
 * tutorial/Highlights.js): every line is something the product really does.
 *
 * LAYOUT: a statement on the left (sticky on desktop), five reasons on the
 * right in a 2-column grid; one column on phones. Cards rise in, staggered.
 */

import { Timer, RefreshCw, AppWindow, Accessibility, Download } from 'lucide-react';
import { Reveal, SectionHeading } from './HomeMotion';

const REASONS = [
  {
    Icon: Timer,
    title: 'Ready in minutes',
    text: 'Add a screenshot, drag a box over the button, write one line. No video editing.',
  },
  {
    Icon: RefreshCw,
    title: 'Easy to keep up to date',
    text: 'Software changed? Swap the screenshot, adjust the box, and your walkthrough is current again.',
  },
  {
    Icon: AppWindow,
    title: 'Works with any app',
    text: 'It is built from screenshots or a recording, so web, desktop and mobile apps all work.',
  },
  {
    Icon: Accessibility,
    title: 'Accessible by default',
    text: 'Every step has a caption and a voice, so people can read, listen or just watch.',
  },
  {
    Icon: Download,
    title: 'Exports that work anywhere',
    text: 'Links open in any modern browser, embeds fit any page, and the video plays everywhere.',
  },
];

export function TrustSection() {
  return (
    <section className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 items-start">
      <div className="lg:sticky lg:top-24">
        <SectionHeading
          align="left"
          eyebrow="Why teams trust it"
          title="Simple and honest by design"
          intro="Hint Studio fits around the software your team already uses, so everyone learns it the same, clear way."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {REASONS.map(({ Icon, title, text }, i) => (
          <Reveal
            key={title}
            delay={i * 90}
            className={i === REASONS.length - 1 ? 'sm:col-span-2' : ''}
          >
            <div className="group h-full flex gap-4 rounded-3xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark shadow-premium p-5 sm:p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent/40">
              <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-accent to-violet text-white flex items-center justify-center flex-shrink-0 shadow-glow transition-transform duration-300 group-hover:scale-105">
                <Icon className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-bold tracking-tight text-ink dark:text-white">{title}</h3>
                <p className="mt-1 text-sm text-ink-soft dark:text-ink-faint-dark leading-relaxed">
                  {text}
                </p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
