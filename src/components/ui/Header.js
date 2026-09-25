/**
 * @file Slim top bar above every authoring page:
 *   [panel toggle] (logo when the sidebar is closed) ··· Courses · New course · theme
 * The toggle opens/closes the course sidebar (components/layout/Sidebar.js);
 * the open/closed default per page is decided by Layout in AppRouter.
 * The centre stays empty on purpose — toasts appear there (ui/Toast.js).
 * Not rendered on shared links (/s/...) or embeds (/embed/...).
 */

import { Link, NavLink } from 'react-router-dom';
import { Mic, Plus, PanelLeftOpen, PanelLeftClose, LibraryBig } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

/** @param {{ sidebarOpen: boolean, onToggleSidebar: () => void }} props */
export function Header({ sidebarOpen, onToggleSidebar }) {
  const ToggleIcon = sidebarOpen ? PanelLeftClose : PanelLeftOpen;

  return (
    <header className="sticky top-0 z-30 bg-paper/70 dark:bg-paper-dark/70 backdrop-blur-xl border-b border-line/70 dark:border-line-dark/70">
      <div className="px-3 sm:px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleSidebar}
            // When the sidebar is open on large screens it has its own close button.
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors ${
              sidebarOpen ? 'lg:hidden' : ''
            }`}
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            aria-expanded={sidebarOpen}
            title={sidebarOpen ? 'Close sidebar' : 'Open sidebar — all your courses'}
          >
            <ToggleIcon className="w-5 h-5" />
          </button>
          {/* The sidebar has its own logo; show this one only when it's closed. */}
          {!sidebarOpen && (
            <Link to="/" className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-violet flex items-center justify-center shadow-glow">
                <Mic className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
              </span>
              <span className="font-semibold text-sm text-ink dark:text-white tracking-tight">
                Hint Studio
              </span>
            </Link>
          )}
        </div>

        <nav className="flex items-center gap-1.5">
          <NavLink
            to="/courses"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'text-ink dark:text-white bg-paper-2 dark:bg-paper-2-dark'
                  : 'text-ink-soft dark:text-ink-faint-dark hover:text-ink dark:hover:text-ink-soft-dark'
              }`
            }
          >
            <LibraryBig className="w-4 h-4" />
            <span className="hidden sm:inline">Courses</span>
          </NavLink>
          <Link
            to="/new"
            className="flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-dark shadow-glow transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New course</span>
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
