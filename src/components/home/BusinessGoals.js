/**
 * @file "What we do for businesses" — the mission, written for owners and
 * team leads. Goals, not statistics: every card is an outcome the product is
 * built for, with no invented numbers.
 *
 * LAYOUT: a bold statement on the left (sticky on desktop) with a short
 * "works with" chip row; four outcome cards in a 2×2 grid on the right, plus
 * a wide "any software" card underneath. One column on phones.
 * Cards rise in, staggered (Reveal).
 */

import { Rocket, MessageCircleQuestion, ListChecks, RefreshCw, Boxes, Target } from 'lucide-react';
import { Reveal } from './HomeMotion';

const GOALS = [
  {
    Icon: Rocket,
    title: 'New employees up to speed, faster',
    text: 'Hand new joiners a walkthrough for each daily task. They watch the exact clicks instead of waiting for someone to show them.',
  },
  {
    Icon: MessageCircleQuestion,
    title: 'Fewer “how do I…?” questions',
    text: 'Answer the repeated questions to support and IT once, with a link people can watch whenever they need it.',
  },
  {
    Icon: ListChecks,
    title: 'One correct way, for everyone',
    text: 'Everyone follows the same steps in the same order, so processes stay consistent across teams and shifts.',
  },
  {
    Icon: RefreshCw,
    title: 'Help that never goes out of date',
    text: 'When the software changes, re-record the affected steps in minutes and share the same way again.',
  },
];

const SYSTEMS = ['ERP', 'CRM', 'HR & payroll', 'Accounting', 'Internal tools'];

function GoalCard({ Icon, title, text, index }) {
  return (
    <Reveal delay={index * 90} className="h-full">
      <div className="group relative h-full overflow-hidden rounded-3xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark shadow-premium p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent/40">
        {/* Soft corner glow on hover */}
        <div
          className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-accent/10 dark:bg-accent/15 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          aria-hidden="true"
        />
        <span className="relative w-11 h-11 rounded-2xl bg-accent-soft dark:bg-accent-soft-dark text-accent dark:text-accent-ink-dark flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
          <Icon className="w-5 h-5" />
        </span>
        <h3 className="relative mt-5 text-lg font-bold tracking-tight text-ink dark:text-white">
          {title}
        </h3>
        <p className="relative mt-2 text-sm text-ink-soft dark:text-ink-faint-dark leading-relaxed">
          {text}
        </p>
      </div>
    </Reveal>
  );
}

export function BusinessGoals() {
  return (
    <section className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 items-start">
      {/* Statement */}
      <Reveal className="lg:sticky lg:top-24">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent mb-3">
          <span className="w-6 h-px bg-accent/60" aria-hidden="true" />
          What we do for businesses
        </p>
        <h2 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.05] text-ink dark:text-white text-balance">
          Our goal: everyone can use your software{' '}
          <span className="bg-gradient-to-r from-accent to-violet dark:to-violet-dark bg-clip-text text-transparent">
            without asking for help.
          </span>
        </h2>
        <p className="mt-5 text-base sm:text-lg text-ink-soft dark:text-ink-faint-dark leading-relaxed">
          Your team and your customers learn by watching the real screens, one short step at a time.
          You spend less time explaining, and they spend less time stuck.
        </p>
        <div className="mt-7 flex items-start gap-3 rounded-2xl border border-line dark:border-line-dark bg-paper-2/60 dark:bg-paper-2-dark/60 p-4">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-violet text-white flex items-center justify-center flex-shrink-0 shadow-glow">
            <Target className="w-[18px] h-[18px]" />
          </span>
          <p className="text-sm text-ink-soft dark:text-ink-soft-dark leading-relaxed">
            Built for owners and team leads who want processes followed the same way every time,
            without writing a manual.
          </p>
        </div>
      </Reveal>

      {/* Outcomes */}
      <div className="grid gap-4 sm:grid-cols-2">
        {GOALS.map((goal, i) => (
          <GoalCard key={goal.title} index={i} {...goal} />
        ))}
        <Reveal delay={GOALS.length * 90} className="sm:col-span-2">
          <div className="relative overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-br from-accent-soft to-violet-soft dark:from-accent-soft-dark dark:to-violet-soft-dark p-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <span className="w-11 h-11 rounded-2xl bg-panel dark:bg-panel-dark text-accent dark:text-accent-ink-dark flex items-center justify-center flex-shrink-0 shadow-sm">
              <Boxes className="w-5 h-5" />
            </span>
            <div className="flex-1">
              <h3 className="text-lg font-bold tracking-tight text-ink dark:text-white">
                Works with any software your business uses
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {SYSTEMS.map((name) => (
                  <span
                    key={name}
                    className="px-3 py-1 rounded-full text-xs font-semibold bg-panel/80 dark:bg-panel-dark/80 border border-line dark:border-line-dark text-ink-soft dark:text-ink-soft-dark"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
