/**
 * @file Route #/ — the start page, built like a product landing page.
 *
 * It does NOT list saved courses by default (they're in the sidebar and on
 * #/courses). Sections, top → bottom (new sections live in components/home):
 *   1. Hero            — short pitch · the two start cards (screenshots / record)
 *                        over a drifting blob + grid backdrop (HeroBackdrop)
 *   3. Product visual  — the looping HowItWorksDemo in a floating frame (HeroVisual)
 *   4. See it in action— real example courses in the real player (ExamplesShowcase)
 *   5. For businesses  — the mission + four outcome goals (BusinessGoals)
 *   6. How it works    — Capture → Highlight → Share, animated (HowItWorksSteps)
 *   7. Features        — bento grid of true features (FeatureBento)
 *   8. By the numbers  — real product facts + use cases (tutorial/Highlights)
 *   9. Why teams trust — honest reasons, no logos or testimonials (TrustSection)
 *  10. FAQ             — accordion (FaqSection)
 *  11. Final CTA       — the two ways to start again (FinalCta)
 *  12. Footer          — brand, link columns, © bar (SiteFooter)
 *
 * MOTION: sections rise in once when scrolled to (useInView + .reveal); the
 * `hm-` keyframes come from <HomeKeyframes/>. Everything respects
 * prefers-reduced-motion. The root clips horizontal overflow so the
 * decorative blobs can never cause a sideways scroll.
 *
 * Saved courses are not listed here: they are in the sidebar and on #/courses.
 */

import { useNavigate } from 'react-router-dom';
import { Plus, Upload, LibraryBig, PlayCircle, Images, MonitorPlay } from 'lucide-react';
import { ProductStats, UseCases } from '@/components/tutorial/Highlights';
import { HomeKeyframes, Reveal, SectionHeading } from '@/components/home/HomeMotion';
import { HeroBackdrop, HeroVisual } from '@/components/home/HeroBackdrop';
import { ExamplesShowcase } from '@/components/home/ExamplesShowcase';
import { HowItWorksSteps } from '@/components/home/HowItWorksSteps';
import { FeatureBento } from '@/components/home/FeatureBento';
import { TrustSection } from '@/components/home/TrustSection';
import { FaqSection } from '@/components/home/FaqSection';
import { FinalCta } from '@/components/home/FinalCta';
import { BusinessGoals } from '@/components/home/BusinessGoals';
import { SiteFooter } from '@/components/home/SiteFooter';
import { HeroStart } from '@/components/home/HeroStart';

/** Vertical rhythm between the big sections. */
const SECTION_GAP = 'mt-28 sm:mt-36';

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="relative overflow-x-clip">
      <HomeKeyframes />

      {/* ── 1. Hero (+ the product visual) over the animated backdrop ── */}
      <div className="relative isolate">
        <HeroBackdrop />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-24">
          <HeroStart />

          {/* ── 3. Product visual ── */}
          <div className="mt-20 sm:mt-24">
            <HeroVisual />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
        {/* ── 4. Examples ── */}
        <div className={SECTION_GAP}>
          <ExamplesShowcase />
        </div>

        {/* ── 5. What we do for businesses ── */}
        <div className={SECTION_GAP}>
          <BusinessGoals />
        </div>

        {/* ── 6. How it works ── */}
        <div className={SECTION_GAP}>
          <HowItWorksSteps />
        </div>

        {/* ── 7. Features ── */}
        <div className={SECTION_GAP}>
          <FeatureBento />
        </div>

        {/* ── 8. By the numbers + where it helps (real product facts) ── */}
        <section className={SECTION_GAP}>
          <SectionHeading
            eyebrow="By the numbers"
            title="Simple by design"
            intro="Real limits and guarantees of the app — nothing invented."
          />
          <ProductStats />
          <div className="mt-20 sm:mt-24 flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <Reveal>
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent mb-3">
                <span className="w-6 h-px bg-accent/60" aria-hidden="true" />
                Where it helps
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink dark:text-white">
                One tool, every “how do I…?”
              </h2>
            </Reveal>
            <button
              onClick={() => navigate('/examples')}
              className="self-start sm:self-auto flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
            >
              <PlayCircle className="w-4 h-4" /> See all examples
            </button>
          </div>
          <UseCases />
        </section>

        {/* ── 9. Why teams trust it ── */}
        <div className={SECTION_GAP}>
          <TrustSection />
        </div>

        {/* ── 10. FAQ ── */}
        <div className={SECTION_GAP}>
          <FaqSection />
        </div>

        {/* ── 11. Final CTA ── */}
        <div className={SECTION_GAP}>
          <FinalCta />
        </div>
      </div>

      {/* ── 12. Footer ── */}
      <SiteFooter />
    </div>
  );
}
