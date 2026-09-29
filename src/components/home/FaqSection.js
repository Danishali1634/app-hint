/**
 * @file FAQ accordion — real answers about how the product works.
 *
 * HEIGHT ANIMATION without measuring: each answer sits in a CSS grid whose
 * row goes from 0fr to 1fr (grid-template-rows is animatable), with an
 * overflow-hidden child. Smooth, no JS heights, no layout jumps elsewhere.
 * Reduced motion: the transition is dropped (motion-reduce:transition-none).
 */

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Reveal, SectionHeading } from './HomeMotion';

const FAQS = [
  {
    q: 'How long does it take to make one?',
    a: 'A few minutes. Add a screenshot per screen (or record the task once), drag a box over the button, and write one line per step. The voice is added for you.',
  },
  {
    q: 'What happens when our software changes?',
    a: 'Open the course, swap the screenshot for the step that changed and adjust the box. Re-share the link or export a new video, and your help is current again.',
  },
  {
    q: 'Can I record my screen instead of taking screenshots?',
    a: 'Yes. Choose “Record my screen”, do the task once, then pause the recording wherever something happens and add a step there.',
  },
  {
    q: 'Can I embed a walkthrough on my website?',
    a: 'Yes. Copy the embed code and paste it into any page that accepts an iframe — a help centre, wiki or LMS. Embeds are watch-only. You can also share a plain link or download a video.',
  },
  {
    q: 'Does it work with any app?',
    a: 'Yes. Because walkthroughs are built from screenshots or a screen recording, it works with any web, desktop or mobile app.',
  },
];

function FaqItem({ q, a, open, onToggle, id }) {
  return (
    <div
      className={`rounded-2xl border transition-colors duration-300 ${
        open
          ? 'border-accent/40 bg-panel dark:bg-panel-dark shadow-premium'
          : 'border-line dark:border-line-dark bg-panel/60 dark:bg-panel-dark/60 hover:border-accent/30'
      }`}
    >
      <h3>
        <button
          type="button"
          id={`${id}-q`}
          aria-expanded={open}
          aria-controls={`${id}-a`}
          onClick={onToggle}
          className="w-full flex items-center justify-between gap-4 text-left px-5 sm:px-6 py-4 sm:py-5 font-semibold text-ink dark:text-white rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {q}
          <span
            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
              open
                ? 'bg-accent text-white rotate-45'
                : 'bg-paper-2 dark:bg-paper-2-dark text-ink-soft dark:text-ink-soft-dark'
            }`}
            aria-hidden="true"
          >
            <Plus className="w-4 h-4" />
          </span>
        </button>
      </h3>
      <div
        id={`${id}-a`}
        role="region"
        aria-labelledby={`${id}-q`}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <p className="px-5 sm:px-6 pb-5 text-sm sm:text-base text-ink-soft dark:text-ink-faint-dark leading-relaxed">
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState(0);
  return (
    <section className="max-w-3xl mx-auto">
      <SectionHeading
        eyebrow="FAQ"
        title="Questions, answered"
        intro="The short version of how Hint Studio works."
      />
      <div className="space-y-3">
        {FAQS.map(({ q, a }, i) => (
          <Reveal key={q} delay={i * 70}>
            <FaqItem
              id={`faq-${i}`}
              q={q}
              a={a}
              open={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? -1 : i)}
            />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
