/**
 * @file Route #/courses — all saved courses ("View all courses" on Home).
 *
 * WHAT YOU CAN DO HERE
 *   Search      by course title or page name. No match → "No results found" +
 *               "Did you mean" suggestions (utils/search.js).
 *   Filter      All / Draft / Done
 *   Per course  ▶ Preview · ⬇ Download video · 🔗 Copy link · Edit
 *               ⋯ Copy embed code · Duplicate · Export ZIP · Delete
 *   Import      restore an exported .zip        New course → #/new
 *
 * Data + actions come from useCourseLibrary (shared with the Home page).
 */

import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, ArrowLeft, BookOpen, ShieldCheck } from 'lucide-react';
import { COURSE_RETENTION_DAYS } from '@/constants';
import { searchCourses } from '@/utils/search';
import { useCourseLibrary } from '@/hooks/useCourseLibrary';
import { PageSpinner } from '@/components/ui/Spinner';
import { SearchInput } from '@/components/ui/SearchInput';
import { CourseGrid, CourseResults } from '@/components/course/CourseResults';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'done', label: 'Done' },
];

/** 'done' covers the "published" status and the legacy "approved" one. */
function matchesFilter(course, filter) {
  if (filter === 'all') return true;
  const isDone = course.status === 'published' || course.status === 'approved';
  return filter === 'done' ? isDone : !isDone;
}

export function LibraryPage() {
  const navigate = useNavigate();
  const library = useCourseLibrary();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const fileInputRef = useRef(null);
  const { courses } = library;

  const filtered = useMemo(
    () => courses.filter((c) => matchesFilter(c, filter)),
    [courses, filter],
  );
  const { matches, suggestions } = useMemo(() => searchCourses(filtered, query), [filtered, query]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [f.value, courses.filter((c) => matchesFilter(c, f.value)).length]),
      ),
    [courses],
  );
  const isSearching = query.trim().length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-sm text-ink-soft dark:text-ink-faint-dark hover:text-ink dark:hover:text-ink-soft-dark transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Home
      </button>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink dark:text-white">
            All courses
          </h1>
          <p className="text-ink-soft dark:text-ink-faint-dark text-sm mt-2">
            {courses.length} course{courses.length !== 1 ? 's' : ''}
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
            className="flex items-center gap-1.5 px-4 h-11 rounded-xl border border-line dark:border-line-dark text-sm font-medium text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
          >
            <Upload className="w-4 h-4" /> Import
          </button>
          <button
            onClick={() => navigate('/new')}
            className="flex items-center gap-1.5 px-5 h-11 rounded-xl bg-accent text-white text-sm font-semibold shadow-glow hover:bg-accent-dark transition-colors"
          >
            <Plus className="w-4 h-4" /> New course
          </button>
        </div>
      </div>

      {/* ── Search + filters ── */}
      {courses.length > 0 && (
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-8">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by course title or page name — e.g. “Return Repack”"
          />
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-paper-2 dark:bg-paper-2-dark border border-line/60 dark:border-line-dark/60">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-4 h-10 rounded-xl text-sm font-medium transition-all ${
                  filter === f.value
                    ? 'bg-panel dark:bg-panel-dark text-ink dark:text-ink-soft-dark shadow-premium'
                    : 'text-ink-soft dark:text-ink-faint-dark hover:text-ink dark:hover:text-ink-soft-dark'
                }`}
              >
                {f.label}
                <span className="ml-1.5 text-xs text-ink-faint dark:text-ink-faint-dark">
                  {counts[f.value]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Body ── */}
      {library.loading ? (
        <PageSpinner />
      ) : courses.length === 0 ? (
        <div className="flex flex-col items-center text-center py-20 px-6 rounded-3xl border border-line dark:border-line-dark bg-panel dark:bg-panel-dark shadow-premium">
          <BookOpen className="w-10 h-10 text-accent mb-4" />
          <h2 className="text-lg font-semibold text-ink dark:text-ink-soft-dark">No courses yet</h2>
          <p className="text-sm text-ink-soft dark:text-ink-faint-dark mt-1 mb-6">
            Create your first animated walkthrough.
          </p>
          <button
            onClick={() => navigate('/new')}
            className="flex items-center gap-1.5 px-5 h-11 rounded-xl bg-accent text-white text-sm font-semibold shadow-glow hover:bg-accent-dark transition-colors"
          >
            <Plus className="w-4 h-4" /> New course
          </button>
        </div>
      ) : isSearching ? (
        <CourseResults
          query={query}
          matches={matches}
          suggestions={suggestions}
          cardProps={library.cardProps}
        />
      ) : filtered.length > 0 ? (
        <CourseGrid courses={filtered} cardProps={library.cardProps} />
      ) : (
        <p className="text-sm text-ink-faint dark:text-ink-faint-dark py-12 text-center">
          No courses in this filter yet.
        </p>
      )}


      {library.overlays}
    </div>
  );
}
