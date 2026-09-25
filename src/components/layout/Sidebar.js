/**
 * @file App sidebar, in the style of ChatGPT / Gemini: every saved course is
 * always one click away, and the course you are working on is highlighted.
 *
 * CONTENTS (top → bottom)
 *   logo · "New course" · search (filters the list below)
 *   Home · All courses · Examples
 *   Your courses, grouped by last change: Today / Yesterday / Previous 7 days /
 *   Previous 30 days / Older. Active course (open in the editor or preview) is
 *   highlighted; hover shows a ▶ Preview shortcut.
 *   theme toggle · "Saved in this browser" note
 *
 * OPEN / CLOSED (decided by Layout in AppRouter):
 *   Closed by default; the ☰ panel button in the top bar (ui/Header.js) or the
 *   close button here toggles it. Open by default on the course-creation
 *   screens (#/new, #/editor/...) on large screens.
 *   Large screens: an in-flow column that pushes the page; hidden when closed.
 *   Small screens: a drawer over the page with a backdrop.
 * Navigation doesn't close it; Layout re-applies the page's default instead.
 *
 * The list is live (hooks/useCourseList) and search uses utils/search.js.
 */

import { useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Mic,
  Plus,
  Search,
  Home,
  LibraryBig,
  Play,
  FileVideo,
  HardDrive,
  PanelLeftClose,
  Sparkles,
} from 'lucide-react';
import { useCourseList } from '@/hooks/useCourseList';
import { searchCourses } from '@/utils/search';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

/** @typedef {import('@/types').Course} Course */

const DAY_MS = 86_400_000;

/** Buckets courses like ChatGPT's history list. */
function groupByRecency(courses) {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const groups = [
    { label: 'Today', from: startOfToday },
    { label: 'Yesterday', from: startOfToday - DAY_MS },
    { label: 'Previous 7 days', from: startOfToday - 7 * DAY_MS },
    { label: 'Previous 30 days', from: startOfToday - 30 * DAY_MS },
    { label: 'Older', from: -Infinity },
  ].map((g) => ({ ...g, courses: [] }));
  for (const course of courses) {
    groups.find((g) => course.updatedAt >= g.from).courses.push(course);
  }
  return groups.filter((g) => g.courses.length > 0);
}

/** Course id from #/editor/:id or #/preview/:id, else null. */
function activeCourseId(pathname) {
  const match = pathname.match(/^\/(editor|preview)\/([^/]+)/);
  return match ? match[2] : null;
}

const NAV_CLASS = ({ isActive }) =>
  `flex items-center gap-2.5 px-3 h-9 rounded-lg text-sm font-medium transition-colors ${
    isActive
      ? 'bg-paper-2 dark:bg-paper-2-dark text-ink dark:text-white'
      : 'text-ink-soft dark:text-ink-faint-dark hover:bg-paper-2/70 dark:hover:bg-paper-2-dark/70 hover:text-ink dark:hover:text-ink-soft-dark'
  }`;

/**
 * @param {{ open: boolean, onClose: () => void }} props
 */
export function Sidebar({ open, onClose }) {
  const courses = useCourseList();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const activeId = activeCourseId(location.pathname);

  const visible = useMemo(() => {
    if (!query.trim()) return courses;
    const { matches, suggestions } = searchCourses(courses, query);
    return matches.length ? matches : suggestions;
  }, [courses, query]);
  const groups = useMemo(() => groupByRecency(visible), [visible]);

  // Layout applies each page's open/closed default after navigation.
  const go = (path) => navigate(path);

  return (
    <>
      {/* Mobile backdrop — fades in/out with the drawer */}
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/*
        ANIMATION
          Small screens: fixed drawer that slides in (translate-x).
          Large screens: in-flow column whose WIDTH animates 0 ↔ 18rem, so the
          page smoothly makes room. The inner wrapper keeps a fixed width, so the
          content slides instead of squashing.
      */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 lg:z-20 h-screen w-72 flex-shrink-0 overflow-hidden bg-panel/95 dark:bg-[#0c0c0f]/95 backdrop-blur-xl border-line dark:border-line-dark transition-[transform,width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          open
            ? 'translate-x-0 lg:w-72 border-r'
            : '-translate-x-full lg:translate-x-0 lg:w-0 lg:border-r-0'
        }`}
        aria-label="Courses sidebar"
        aria-hidden={!open}
        // `inert` (as a string attribute for React 18): a closed sidebar can't be tabbed into.
        inert={open ? undefined : ''}
      >
        <div className="w-72 h-full flex flex-col">
          {/* Logo */}
          <div className="flex items-center justify-between px-4 h-14 flex-shrink-0">
            <Link to="/" className="flex items-center gap-2.5 group">
              <span className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-accent to-violet flex items-center justify-center shadow-glow group-hover:scale-105 transition-transform">
                <Mic className="w-4 h-4 text-white" strokeWidth={2.5} />
              </span>
              <span className="font-semibold text-[15px] text-ink dark:text-white tracking-tight">
                Hint Studio
              </span>
            </Link>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-faint hover:text-ink dark:hover:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
              aria-label="Close sidebar"
              title="Close sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {/* New course + search */}
          <div className="px-3 space-y-2 flex-shrink-0">
            <button
              onClick={() => go('/new')}
              className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-accent text-white text-sm font-semibold shadow-glow hover:bg-accent-dark transition-colors"
            >
              <Plus className="w-4 h-4" /> New course
            </button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint dark:text-ink-faint-dark pointer-events-none" />
              <input
                type="text"
                role="searchbox"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
                placeholder="Search courses"
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-paper-2 dark:bg-paper-2-dark border border-transparent focus:border-accent text-sm text-ink dark:text-ink-soft-dark placeholder:text-ink-faint dark:placeholder:text-ink-faint-dark outline-none transition-colors"
                aria-label="Search courses in sidebar"
              />
            </div>
          </div>

          {/* Main navigation */}
          <nav className="px-3 pt-3 pb-2 space-y-0.5 flex-shrink-0">
            <NavLink to="/" end className={NAV_CLASS}>
              <Home className="w-4 h-4" /> Home
            </NavLink>
            <NavLink to="/courses" className={NAV_CLASS}>
              <LibraryBig className="w-4 h-4" /> All courses
              <span className="ml-auto text-xs text-ink-faint dark:text-ink-faint-dark">
                {courses.length}
              </span>
            </NavLink>
            <NavLink to="/examples" className={NAV_CLASS}>
              <Sparkles className="w-4 h-4" /> Examples
            </NavLink>
          </nav>

          {/* Course history */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
            {courses.length === 0 ? (
              <p className="px-3 py-6 text-xs text-ink-faint dark:text-ink-faint-dark leading-relaxed">
                Your courses will appear here. Create one to get started.
              </p>
            ) : groups.length === 0 ? (
              <p className="px-3 py-6 text-xs text-ink-faint dark:text-ink-faint-dark">
                No course matches “{query.trim()}”.
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.label} className="mt-4 first:mt-2">
                  <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-faint-dark">
                    {group.label}
                  </p>
                  <ul className="space-y-0.5">
                    {group.courses.map((course) => (
                      <SidebarCourse
                        key={course.id}
                        course={course}
                        active={course.id === activeId}
                        onOpen={() => go(`/editor/${course.id}`)}
                        onPreview={() => go(`/preview/${course.id}`)}
                      />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 px-4 h-14 border-t border-line dark:border-line-dark flex-shrink-0">
            <span className="flex items-center gap-1.5 text-xs text-ink-faint dark:text-ink-faint-dark">
              <HardDrive className="w-3.5 h-3.5" /> Saved in this browser
            </span>
            <ThemeToggle />
          </div>
        </div>
      </aside>
    </>
  );
}

/** One course row: title + page name; highlighted when active. */
function SidebarCourse({ course, active, onOpen, onPreview }) {
  return (
    <li className="group relative">
      <button
        onClick={onOpen}
        className={`w-full flex items-center gap-2.5 pl-3 pr-9 py-2 rounded-lg text-left transition-colors ${
          active
            ? 'bg-accent/10 dark:bg-accent/15 text-ink dark:text-white ring-1 ring-accent/30'
            : 'text-ink-soft dark:text-ink-faint-dark hover:bg-paper-2/70 dark:hover:bg-paper-2-dark/70 hover:text-ink dark:hover:text-ink-soft-dark'
        }`}
        aria-current={active ? 'page' : undefined}
      >
        <FileVideo
          className={`w-4 h-4 flex-shrink-0 ${active ? 'text-accent' : 'text-ink-faint dark:text-ink-faint-dark'}`}
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium truncate">{course.title}</span>
          {course.pageName && (
            <span className="block text-[11px] text-ink-faint dark:text-ink-faint-dark truncate">
              {course.pageName}
            </span>
          )}
        </span>
      </button>
      <button
        onClick={onPreview}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-ink-faint hover:text-accent hover:bg-accent/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        title="Preview"
        aria-label={`Preview ${course.title}`}
      >
        <Play className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}
