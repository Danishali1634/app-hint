/**
 * @file Route #/ — the start page, built like a product landing page.
 *
 * It does NOT list saved courses by default (they're in the sidebar and on
 * #/courses). Sections, top → bottom (new sections live in components/home):
 *   1. Hero            — short pitch · the two start cards (screenshots / record)
 *                        over a drifting blob + grid backdrop (HeroBackdrop)
 *   2. Find a course   — search (results appear only while typing) · Import · View all
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
 * Search matches title and page name; with no match it shows "No results
 * found" + "Did you mean" suggestions (utils/search.js via CourseResults).
 * Loading and card actions come from useCourseLibrary.
 */

import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, LibraryBig, PlayCircle, Images, MonitorPlay } from 'lucide-react';
import { searchCourses } from '@/utils/search';
import { useCourseLibrary } from '@/hooks/useCourseLibrary';
import { SearchInput } from '@/components/ui/SearchInput';
import { CourseResults } from '@/components/course/CourseResults';
import { Spinner } from '@/components/ui/Spinner';
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
  const library = useCourseLibrary();
  const [query, setQuery] = useState('');
  const fileInputRef = useRef(null);

  const { matches, suggestions } = useMemo(
    () => searchCourses(library.courses, query),
    [library.courses, query],
  );
  const isSearching = query.trim().length > 0;
  const count = library.courses.length;

  return (
    <div className="relative overflow-x-clip">
      <HomeKeyframes />

      {/* ── 1. Hero (+ 2. search, 3. product visual) over the animated backdrop ── */}
      <div className="relative isolate">
        <HeroBackdrop />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-24">
          <HeroStart />

          {/* ── 2. Find an existing course ── */}
          <section className="mt-14 max-w-5xl mx-auto">
            <div className="rounded-3xl border border-line dark:border-line-dark bg-panel/80 dark:bg-panel-dark/80 backdrop-blur-xl shadow-premium p-5 sm:p-7">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-lg font-semibold text-ink dark:text-ink-soft-dark">
                    Find an existing course
                  </h2>
                  <p className="text-sm text-ink-soft dark:text-ink-faint-dark">
                    Search by course title or page name — even a rough spelling works.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip"
                    onChange={library.importZip}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3.5 h-10 rounded-xl text-sm font-medium text-ink-soft dark:text-ink-faint-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
                    title="Import a course from an exported ZIP"
                  >
                    <Upload className="w-4 h-4" /> Import
                  </button>
                  <button
                    onClick={() => navigate('/courses')}
                    disabled={count === 0}
                    className="flex items-center gap-1.5 px-4 h-10 rounded-xl border border-line dark:border-line-dark text-sm font-semibold text-ink dark:text-ink-soft-dark hover:border-accent hover:text-accent disabled:opacity-50 disabled:pointer-events-none transition-colors"
                  >
                    <LibraryBig className="w-4 h-4" /> View all courses
                    <span className="text-xs font-medium text-ink-faint dark:text-ink-faint-dark">
                      {count}
                    </span>
                  </button>
                </div>
              </div>
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder={
                  count
                    ? 'Search e.g. “Return Repack” or “receive stock”'
                    : 'No saved courses yet — create one above'
                }
              />
            </div>

            {isSearching && (
              <div className="mt-8">
                {library.loading ? (
                  <div className="flex justify-center py-10">
                    <Spinner />
                  </div>
                ) : (
                  <CourseResults
                    query={query}
                    matches={matches}
                    suggestions={suggestions}
                    cardProps={library.cardProps}
                  />
                )}
              </div>
            )}
          </section>

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

      {library.overlays}
    </div>
  );
}
