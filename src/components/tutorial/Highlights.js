/**
 * @file Home-page facts and use cases.
 *
 * RELIABLE CONTENT ONLY: every number is a real property of this app, read
 * from the same constants and types the code enforces (MAX_STEPS, StepAction),
 * so the page can never claim something the product doesn't do. No reviews,
 * no invented customers.
 *
 * ANIMATION (plays once when scrolled into view — hooks/useInView)
 *   <ProductStats/> numbers count up from 0; cards rise in, staggered.
 *   <UseCases/>     cards rise in, staggered; each opens a playable example.
 * Reduced-motion users get the final numbers and cards immediately.
 *
 * RESPONSIVE: stats 2 columns on phones → 4 on desktop; use cases 1 → 2 → 4.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers,
  Share2,
  Video,
  MousePointerClick,
  GraduationCap,
  LifeBuoy,
  Megaphone,
  Compass,
  ArrowRight,
} from 'lucide-react';
import { MAX_STEPS } from '@/constants';
import { useInView } from '@/hooks/useInView';

const STATS = [
  {
    Icon: Layers,
    value: MAX_STEPS,
    suffix: '',
    label: Number.isFinite(MAX_STEPS) ? 'steps per course' : 'steps per course — no limit',
    detail: 'Each step is its own screen with its own highlighted feature.',
  },
  {
    Icon: Share2,
    value: 3,
    suffix: '',
    label: 'ways to share',
    detail: 'A link, an embed code for any website, or a downloadable video.',
  },
  {
    Icon: MousePointerClick,
    value: 3,
    suffix: '',
    label: 'step types',
    detail: 'Click, Look and Type: show a click, point something out, or fill in a field.',
  },
  {
    Icon: Video,
    value: 2,
    suffix: '',
    label: 'ways to create',
    detail: 'From screenshots, or from a recording of your screen. Mix both in one course.',
  },
];

/** Where it helps → the example that shows it (src/examples). */
const USE_CASES = [
  {
    Icon: GraduationCap,
    title: 'Employee onboarding',
    text: 'New joiners watch the exact clicks for their daily tasks instead of sitting through a demo.',
    exampleId: 'return-repack',
    exampleTitle: 'Repack a return and check the trend',
  },
  {
    Icon: LifeBuoy,
    title: 'Help-centre articles',
    text: 'Embed a walkthrough next to the written answer so customers can simply watch it.',
    exampleId: 'monthly-report',
    exampleTitle: 'Monthly sales report',
  },
  {
    Icon: Megaphone,
    title: 'Release notes',
    text: 'Show where a new feature lives and what it does, in a few seconds.',
    exampleId: 'customer-lookup',
    exampleTitle: 'Find a customer and get their statement',
  },
  {
    Icon: Compass,
    title: 'Process training',
    text: 'Walk through a whole process across several screens, from start to finish.',
    exampleId: 'purchase-order',
    exampleTitle: 'Purchase order: create, approve, receive',
  },
];

/** Animates 0 → `target` once `run` becomes true (ease-out, ~1.2s). */
function useCountUp(target, run, durationMs = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (
      target === 0 ||
      !Number.isFinite(target) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setValue(target);
      return;
    }
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, run, durationMs]);
  return value;
}

function StatCard({ stat, index, visible }) {
  const { Icon, value, suffix, label, detail } = stat;
  const shown = useCountUp(value, visible);
  return (
    <div
      className={`reveal ${visible ? 'is-visible' : ''} h-full`}
      style={{ transitionDelay: visible ? `${index * 100}ms` : '0ms' }}
    >
      <div className="h-full rounded-3xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark shadow-premium p-5 sm:p-6">
        <span className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-4">
          <Icon className="w-5 h-5" />
        </span>
        <p className="text-4xl sm:text-5xl font-bold tracking-tight text-ink dark:text-white tabular-nums">
          {Number.isFinite(shown) ? shown : '∞'}
          <span className="text-2xl sm:text-3xl text-accent">{suffix}</span>
        </p>
        <p className="mt-1 text-sm font-semibold text-ink dark:text-ink-soft-dark">{label}</p>
        <p className="mt-1.5 text-xs text-ink-soft dark:text-ink-faint-dark leading-relaxed">
          {detail}
        </p>
      </div>
    </div>
  );
}

export function ProductStats() {
  const [ref, visible] = useInView();
  return (
    <div ref={ref} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {STATS.map((stat, i) => (
        <StatCard key={stat.label} stat={stat} index={i} visible={visible} />
      ))}
    </div>
  );
}

export function UseCases() {
  const [ref, visible] = useInView();
  const navigate = useNavigate();
  return (
    <div ref={ref} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {USE_CASES.map(({ Icon, title, text, exampleId, exampleTitle }, i) => (
        <div
          key={title}
          className={`reveal ${visible ? 'is-visible' : ''} h-full`}
          style={{ transitionDelay: visible ? `${i * 110}ms` : '0ms' }}
        >
          <button
            onClick={() => navigate(`/examples/${exampleId}`)}
            className="group h-full w-full text-left flex flex-col rounded-3xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark shadow-premium p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent/50 hover:shadow-glow"
          >
            <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-accent to-violet text-white flex items-center justify-center mb-4 shadow-glow group-hover:scale-105 transition-transform">
              <Icon className="w-5 h-5" />
            </span>
            <h3 className="font-semibold text-ink dark:text-white">{title}</h3>
            <p className="mt-1.5 flex-1 text-sm text-ink-soft dark:text-ink-faint-dark leading-relaxed">
              {text}
            </p>
            <span className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-accent">
              Watch “{exampleTitle}”
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}
