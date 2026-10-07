/**
 * @file useCourseList — all saved courses, kept live.
 * Reads the global list from CoursesProvider (hooks/useCourses), so the sidebar
 * doesn't fetch the courses a second time.
 *
 * Used by: components/layout/Sidebar.js
 */

import { useCourses } from '@/hooks/useCourses';

/** @returns {import('@/types').Course[]} newest first */
export function useCourseList() {
  return useCourses().courses;
}
