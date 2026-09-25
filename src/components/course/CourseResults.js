/**
 * @file Search results for courses: matches, or "No results found" with
 * "Did you mean" suggestions. Used by the Home page and the Library page.
 * Ranking and suggestions come from utils/search.js.
 */

import { SearchX } from 'lucide-react';
import { CourseCard } from '@/components/course/CourseCard';

/** @typedef {import('@/types').Course} Course */

/** Responsive grid of course cards. */
export function CourseGrid({ courses, cardProps, query = '' }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
      {courses.map((course) => (
        <CourseCard key={course.id} {...cardProps(course, query)} />
      ))}
    </div>
  );
}

/**
 * @param {{
 *   query: string,
 *   matches: Course[],
 *   suggestions: Course[],
 *   cardProps: (course: Course, query: string) => object,
 * }} props
 */
export function CourseResults({ query, matches, suggestions, cardProps }) {
  const trimmed = query.trim();

  if (matches.length > 0) {
    return (
      <div>
        <p className="text-sm text-ink-soft dark:text-ink-faint-dark mb-4">
          {matches.length} result{matches.length !== 1 ? 's' : ''} for “{trimmed}”
        </p>
        <CourseGrid courses={matches} cardProps={cardProps} query={query} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col items-center text-center py-12 px-6 rounded-3xl border border-dashed border-line dark:border-line-dark mb-8">
        <SearchX className="w-10 h-10 text-ink-faint dark:text-ink-faint-dark mb-3" />
        <h2 className="text-lg font-semibold text-ink dark:text-ink-soft-dark">
          No results found for “{trimmed}”
        </h2>
        <p className="text-sm text-ink-soft dark:text-ink-faint-dark mt-1">
          {suggestions.length
            ? 'These courses have similar names:'
            : 'Try another word from the course title or page name.'}
        </p>
      </div>
      {suggestions.length > 0 && (
        <>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-faint-dark mb-4">
            Did you mean
          </h3>
          <CourseGrid courses={suggestions} cardProps={cardProps} />
        </>
      )}
    </div>
  );
}
