/**
 * @file Providers + route table. The "map" of the app.
 *
 * LAYOUT: authoring pages → Sidebar (all courses) + page (see Layout).
 *         Shared links / embeds → the course only.
 *
 * COMPONENT TREE
 *   ThemeProvider          light/dark state           (hooks/useTheme)
 *   └ ToastProvider        notify() anywhere          (hooks/useToast)
 *     └ HashRouter
 *       ├ AppRoutes        chooses layout + page
 *       └ ToastContainer   renders toasts on every page
 *
 * ROUTES
 *   #/                     HomePage            create a course · search · "View all"
 *   #/courses              LibraryPage         all courses: search, filter, actions
 *   #/examples/:id?        ExamplesPage        playable example walkthroughs
 *   #/new                  NewCoursePage       create a draft course
 *   #/editor/:courseId     CourseEditorPage    screenshot, steps, regions, voice
 *   #/preview/:courseId    CoursePreviewPage   summary + full walkthrough playback
 *   #/s/:slug/:encoded     SharedCoursePage    play a course embedded in the URL
 *   #/embed/:slug/:encoded EmbedPage           player only, for <iframe> embeds
 *                                              (WATCH-ONLY: inside an iframe no other
 *                                              page is shown — see EmbedOnlyNotice)
 *   anything else          → redirect to #/
 *
 * WHY HashRouter (not BrowserRouter)
 *   The app is deployed as static files. With BrowserRouter, refreshing
 *   /editor/123 makes the host look for a file at that path → 404, unless
 *   rewrite rules are configured. With hash URLs the server always serves
 *   index.html and the router reads everything after "#". Share links rely on
 *   this too.
 *
 * WHY lazy() + Suspense
 *   Each page becomes its own JS chunk, loaded when first visited. Someone
 *   opening a share link doesn't download the editor code.
 *   `.then(m => ({ default: m.X }))` is needed because pages use named exports
 *   and React.lazy expects a default export.
 */

import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Header } from '@/components/ui/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageSpinner } from '@/components/ui/Spinner';
import { ToastContainer } from '@/components/ui/Toast';
import { ToastProvider } from '@/hooks/useToast';
import { ThemeProvider } from '@/hooks/useTheme';

const HomePage = lazy(() => import('@/pages/Home/HomePage').then((m) => ({ default: m.HomePage })));
const LibraryPage = lazy(() =>
  import('@/pages/Library/LibraryPage').then((m) => ({ default: m.LibraryPage })),
);
const ExamplesPage = lazy(() =>
  import('@/pages/Examples/ExamplesPage').then((m) => ({ default: m.ExamplesPage })),
);
const EmbedPage = lazy(() =>
  import('@/pages/Embed/EmbedPage').then((m) => ({ default: m.EmbedPage })),
);
const NewCoursePage = lazy(() =>
  import('@/pages/NewCourse/NewCoursePage').then((m) => ({ default: m.NewCoursePage })),
);
const CourseEditorPage = lazy(() =>
  import('@/pages/CourseEditor/CourseEditorPage').then((m) => ({ default: m.CourseEditorPage })),
);
const CoursePreviewPage = lazy(() =>
  import('@/pages/CoursePreview/CoursePreviewPage').then((m) => ({ default: m.CoursePreviewPage })),
);
const SharedCoursePage = lazy(() =>
  import('@/pages/SharedCourse/SharedCoursePage').then((m) => ({ default: m.SharedCoursePage })),
);

/** Pages where the sidebar starts OPEN (creating / editing a course). */
const SIDEBAR_OPEN_BY_DEFAULT = [/^\/new$/, /^\/editor\//];
/** Below this width the sidebar is an overlay drawer, so it always starts closed. */
const DESKTOP_QUERY = '(min-width: 1024px)';

/** The sidebar's starting state for a page. */
function sidebarDefault(pathname) {
  const isDesktop = window.matchMedia(DESKTOP_QUERY).matches;
  return isDesktop && SIDEBAR_OPEN_BY_DEFAULT.some((pattern) => pattern.test(pathname));
}

/**
 * Authoring layout (ChatGPT-style): toggleable course sidebar + page.
 * The sidebar is CLOSED by default and OPEN by default while creating/editing
 * a course (large screens). The toggle overrides that until the next page;
 * each navigation re-applies the new page's default.
 */
function Layout({ children }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(() => sidebarDefault(location.pathname));

  useEffect(() => {
    setSidebarOpen(sidebarDefault(location.pathname));
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Header sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((open) => !open)} />
        <main className="flex-1 min-w-0">
          <Suspense fallback={<PageSpinner />}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}

/** Shown instead of the app when it is framed without a valid embed URL. */
function EmbedOnlyNotice() {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-6 text-center bg-paper dark:bg-paper-dark">
      <p className="text-sm text-ink-soft dark:text-ink-faint-dark">
        This content can only be watched here. Ask the author for a new embed code.
      </p>
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  const isSharedLink = location.pathname.startsWith('/s/');
  const isEmbed = location.pathname.startsWith('/embed/');
  // Inside someone else's page (an <iframe>)?
  const inIframe = window.self !== window.top;

  // Embeds are WATCH-ONLY: the player and nothing else.
  if (isEmbed) {
    return (
      <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route path="/embed/:slug/:encoded" element={<EmbedPage />} />
          <Route path="*" element={<EmbedOnlyNotice />} />
        </Routes>
      </Suspense>
    );
  }

  // Any other page loaded inside an iframe would expose creating/editing
  // courses to the host site's visitors — show a notice instead.
  if (inIframe && !isSharedLink) return <EmbedOnlyNotice />;

  // Shared links get a bare layout (no header / authoring buttons).
  if (isSharedLink) {
    return (
      <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route path="/s/:slug/:encoded" element={<SharedCoursePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/courses" element={<LibraryPage />} />
        <Route path="/examples" element={<ExamplesPage />} />
        <Route path="/examples/:exampleId" element={<ExamplesPage />} />
        <Route path="/new" element={<NewCoursePage />} />
        <Route path="/editor/:courseId" element={<CourseEditorPage />} />
        <Route path="/preview/:courseId" element={<CoursePreviewPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export function AppRouter() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <HashRouter>
          <div className="min-h-screen">
            <AppRoutes />
            <ToastContainer />
          </div>
        </HashRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
