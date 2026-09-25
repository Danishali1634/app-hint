/**
 * @file Route #/ — the start page.
 *
 * It does NOT list saved courses by default (they're in the sidebar and on
 * #/courses). Sections, top → bottom:
 *   1. Hero            — what Hint Studio is + "Create new course"
 *   2. Find a course   — search (results appear only while typing) · View all
 *   3. See it in action— looping animated demo (components/tutorial/HowItWorksDemo)
 *   4. How it works    — the 3 steps to make a walkthrough
 *   5. What we stand for
 *
 * Search matches title and page name; with no match it shows "No results
 * found" + "Did you mean" suggestions (utils/search.js via CourseResults).
 * Loading, auto-delete cleanup and card actions come from useCourseLibrary.
 */

import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  ArrowRight,
  Upload,
  LibraryBig,
  ImagePlus,
  Crosshair,
  Share2,
  Eye,
  ShieldCheck,
  Sparkles,
  Globe,
} from 'lucide-react';
import { searchCourses } from '@/utils/search';
import { useCourseLibrary } from '@/hooks/useCourseLibrary';
import { SearchInput } from '@/components/ui/SearchInput';
import { CourseResults } from '@/components/course/CourseResults';
import { Spinner } from '@/components/ui/Spinner';
import { HowItWorksDemo } from '@/components/tutorial/HowItWorksDemo';

const HOW_IT_WORKS = [
  {
    Icon: ImagePlus,
    title: 'Add a screenshot per screen',
    text: 'The page first, then the modal or page that opens — one screenshot for every step.',
  },
  {
    Icon: Crosshair,
    title: 'Select the feature',
    text: 'Drag a box over the button or area. Choose “viewer clicks this” or “just look at this”.',
  },
  {
    Icon: Share2,
    title: 'Mark done & share',
    text: 'Copy a link, paste an embed code anywhere, or download the walkthrough as a video.',
  },
];

const VALUES = [
  {
    Icon: Eye,
    title: 'Understood at a glance',
    text: 'Motion explains a feature faster than a paragraph. Even people who skip the labels get it.',
  },
  {
    Icon: ShieldCheck,
    title: 'Private by design',
    text: 'No accounts, no servers. Your screenshots and voice stay in your own browser.',
  },
  {
    Icon: Sparkles,
    title: 'Anyone can create',
    text: 'No video editing, no design tools — if you can take a screenshot, you can make a guide.',
  },
  {
    Icon: Globe,
    title: 'Works everywhere',
    text: 'Links open in any browser; embeds drop into wikis, help centres and LMS pages.',
  },
];

const SECTION_EYEBROW = 'text-xs font-semibold uppercase tracking-[0.18em] text-accent mb-2';

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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-20">
      {/* ── 1. Hero ── */}
      <section className="text-center">
        <span className="inline-flex items-center gap-2 text-xs font-medium text-accent dark:text-accent-ink-dark bg-accent/10 border border-accent/20 px-3 py-1 rounded-full mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-accent" /> Animated product walkthroughs
        </span>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-ink dark:text-white leading-[1.05]">
          Show every feature
          <br />
          <span className="bg-gradient-to-r from-accent via-violet to-accent bg-clip-text text-transparent">
            without a manual
          </span>
        </h1>
        <p className="mt-5 text-base sm:text-lg text-ink-soft dark:text-ink-faint-dark max-w-2xl mx-auto">
          Hint Studio turns screenshots of your app into short animated guides: it zooms into the
          feature, shows the click and opens the next screen — so anyone understands it, even
          without reading.
        </p>
        <div className="mt-9 flex justify-center">
          <button
            onClick={() => navigate('/new')}
            className="group flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-accent text-white text-base font-semibold shadow-glow hover:bg-accent-dark transition-all"
          >
            <Plus className="w-5 h-5" /> Create new course
            <ArrowRight className="w-4 h-4 -ml-0.5 opacity-70 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </section>

      {/* ── 2. Find an existing course ── */}
      <section className="mt-14">
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

      {/* ── 3. See it in action ── */}
      <section className="mt-24 text-center">
        <p className={SECTION_EYEBROW}>See it in action</p>
        <h2 className="text-2xl sm:text-3xl font-bold text-ink dark:text-white">
          This is what your users will see
        </h2>
        <p className="mt-2 mb-8 text-sm text-ink-soft dark:text-ink-faint-dark">
          A 10-second loop: select the feature → zoom → click → the next screen opens.
        </p>
        <HowItWorksDemo />
      </section>

      {/* ── 4. How it works ── */}
      <section className="mt-24">
        <div className="text-center mb-10">
          <p className={SECTION_EYEBROW}>How it works</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-ink dark:text-white">
            Three steps, no video editing
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {HOW_IT_WORKS.map(({ Icon, title, text }, i) => (
            <div
              key={title}
              className="relative rounded-3xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark p-6 shadow-premium"
            >
              <span className="absolute top-5 right-5 text-5xl font-bold text-ink/5 dark:text-white/5 select-none">
                {i + 1}
              </span>
              <span className="w-11 h-11 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mb-4">
                <Icon className="w-5 h-5" />
              </span>
              <h3 className="font-semibold text-ink dark:text-ink-soft-dark">{title}</h3>
              <p className="mt-1.5 text-sm text-ink-soft dark:text-ink-faint-dark leading-relaxed">
                {text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 5. What we stand for ── */}
      <section className="mt-24">
        <div className="relative overflow-hidden rounded-[2rem] border border-line dark:border-line-dark bg-gradient-to-br from-accent/10 via-panel to-violet/10 dark:from-accent/15 dark:via-panel-dark dark:to-violet/15 p-8 sm:p-12">
          <div className="max-w-2xl">
            <p className={SECTION_EYEBROW}>What we stand for</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-ink dark:text-white">
              Software should explain itself.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-ink-soft dark:text-ink-faint-dark">
              Manuals go unread and tooltips get skipped. We believe the fastest way to learn a
              feature is to <strong>see it happen</strong> — on the real screen, one click at a
              time.
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {VALUES.map(({ Icon, title, text }) => (
              <div
                key={title}
                className="flex gap-4 rounded-2xl bg-panel/80 dark:bg-panel-dark/80 backdrop-blur border border-line/70 dark:border-line-dark/70 p-5"
              >
                <span className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center flex-shrink-0 shadow-glow">
                  <Icon className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-semibold text-ink dark:text-ink-soft-dark">{title}</h3>
                  <p className="mt-1 text-sm text-ink-soft dark:text-ink-faint-dark">{text}</p>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => navigate('/new')}
            className="mt-8 flex items-center gap-2 px-6 py-3 rounded-2xl bg-accent text-white font-semibold shadow-glow hover:bg-accent-dark transition-colors"
          >
            <Plus className="w-4 h-4" /> Create your first walkthrough
          </button>
        </div>
      </section>

      {library.overlays}
    </div>
  );
}
