/**
 * @file "What teams say" — two rows of quote cards that drift slowly in
 * opposite directions (CSS marquee in index.css). Hover pauses a row; users
 * who prefer reduced motion get a still, horizontally scrollable row.
 *
 * ⚠️ SAMPLE CONTENT: these quotes are placeholders that describe typical use
 * cases, attributed to roles only. Replace them with real customer feedback
 * (with permission) before launch.
 *
 * RESPONSIVE: cards are fixed-width and the rows are clipped with soft faded
 * edges, so it looks the same on phones and wide screens.
 */

import { Quote } from 'lucide-react';

const TESTIMONIALS = [
  {
    quote:
      'New warehouse staff learn the Return Repack screen in one watch instead of a training call.',
    role: 'Operations lead · Logistics',
  },
  {
    quote:
      'The pointer clicking the real button is what finally made our feature announcements land.',
    role: 'Product manager · SaaS',
  },
  {
    quote:
      'We embedded a walkthrough in every help-centre article. Tickets for “where is…” questions dropped.',
    role: 'Support lead · E-commerce',
  },
  {
    quote: 'I recorded the voice in Hinglish and the team understood it immediately.',
    role: 'Trainer · Manufacturing',
  },
  {
    quote: 'No video editor, no design tool — screenshots, a box, done. It takes minutes.',
    role: 'Business analyst · ERP rollout',
  },
  {
    quote: 'Search by page name means I find last quarter’s guide in seconds.',
    role: 'QA engineer · Fintech',
  },
  {
    quote: 'The zoom into the exact field removed all the “which button?” confusion.',
    role: 'Implementation consultant',
  },
  {
    quote: 'Downloading it as a video let us drop it straight into our onboarding deck.',
    role: 'HR onboarding · Retail',
  },
];

function TestimonialCard({ quote, role }) {
  return (
    <figure className="w-[300px] sm:w-[340px] flex-shrink-0 rounded-2xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark shadow-premium p-5">
      <Quote className="w-5 h-5 text-accent mb-3" />
      <blockquote className="text-sm leading-relaxed text-ink dark:text-ink-soft-dark">
        {quote}
      </blockquote>
      <figcaption className="mt-4 flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-violet text-white text-xs font-bold flex items-center justify-center">
          {role.charAt(0)}
        </span>
        <span className="text-xs font-medium text-ink-soft dark:text-ink-faint-dark">{role}</span>
      </figcaption>
    </figure>
  );
}

/** One auto-scrolling row. Cards are rendered twice for a seamless loop. */
function MarqueeRow({ items, reverse = false }) {
  return (
    <div className="marquee relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <div className={`marquee-track flex gap-4 w-max ${reverse ? 'marquee-reverse' : ''}`}>
        {[...items, ...items].map((t, i) => (
          <TestimonialCard key={i} {...t} />
        ))}
      </div>
    </div>
  );
}

export function Testimonials() {
  const half = Math.ceil(TESTIMONIALS.length / 2);
  return (
    <div className="space-y-4">
      <MarqueeRow items={TESTIMONIALS.slice(0, half)} />
      <MarqueeRow items={TESTIMONIALS.slice(half)} reverse />
    </div>
  );
}
