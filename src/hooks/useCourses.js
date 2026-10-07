/**
 * @file Global course list — loaded once, shared by every page.
 *
 *   const { courses, loading, reload } = useCourses();
 *
 * The sidebar, Home and Library all read the same list from here.
 * It reloads by itself after every save or delete (COURSES_CHANGED_EVENT from db.js).
 *
 * Mounted in AppRouter around the signed-in pages.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { COURSES_CHANGED_EVENT, getAllCourses } from '@/services/storage/db';

const CoursesContext = createContext(null);

export function CoursesProvider({ children }) {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setCourses(await getAllCourses());
    } catch (error) {
      toast.error(`Could not load your courses: ${error.message}`, { toastId: 'courses-load' });
    } finally {
      setLoading(false); // never spin forever, also when loading failed
    }
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener(COURSES_CHANGED_EVENT, reload);
    return () => window.removeEventListener(COURSES_CHANGED_EVENT, reload);
  }, [reload]);

  return (
    <CoursesContext.Provider value={{ courses, loading, reload }}>
      {children}
    </CoursesContext.Provider>
  );
}

export function useCourses() {
  return useContext(CoursesContext);
}
