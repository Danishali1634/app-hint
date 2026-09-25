/**
 * @file useCourseList — all saved courses, kept live.
 *
 * WHY THIS HOOK EXISTS
 *   The sidebar shows every course on every page, while pages create, rename
 *   and delete courses on their own. Instead of threading a shared state
 *   through the whole app, db.js fires COURSES_CHANGED_EVENT after every save
 *   or delete and this hook re-reads IndexedDB (debounced, because the editor
 *   autosaves on each keystroke).
 *
 * Used by: components/layout/Sidebar.js
 */

import { useEffect, useState } from 'react';
import { COURSES_CHANGED_EVENT, getAllCourses } from '@/services/storage/db';

/** Wait this long after the last change before re-reading (ms). */
const RELOAD_DEBOUNCE_MS = 250;

/** @returns {import('@/types').Course[]} newest first */
export function useCourseList() {
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const load = () =>
      getAllCourses().then((list) => {
        if (!cancelled) setCourses(list);
      });
    const handleChange = () => {
      clearTimeout(timer);
      timer = setTimeout(load, RELOAD_DEBOUNCE_MS);
    };

    load();
    window.addEventListener(COURSES_CHANGED_EVENT, handleChange);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener(COURSES_CHANGED_EVENT, handleChange);
    };
  }, []);

  return courses;
}
