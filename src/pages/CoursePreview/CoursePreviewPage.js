/**
 * @file Route #/preview/:courseId — watch a saved course, YouTube-style.
 *
 * The player sits INSIDE the page (variant "inline"), paused on step 1 with a
 * big ▶. Nothing pops up and nothing plays until the viewer clicks.
 * Below it: title, page name, status and the list of steps, plus Edit.
 *
 * AFTER "SAVE" (?saved=1, from the editor or the video builder — which are
 * replaced in history, so they are closed): one calm line "Saved. Your
 * walkthrough is ready." and Back leads to the course list, never back into
 * the creation screen.
 *
 * FLOW: load course from IndexedDB → buildWalkthroughSteps (media → data URLs)
 *   → inline WalkthroughPlayer. Unknown course id → redirect home.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Pencil, CheckCircle2 } from 'lucide-react';
import { getCourse } from '@/services/storage/db';
import { buildWalkthroughSteps } from '@/services/sharing/share';
import { WalkthroughPlayer } from '@/components/walkthrough/WalkthroughPlayer';
import { CourseInfo } from '@/components/walkthrough/CourseInfo';
import { PageSpinner } from '@/components/ui/Spinner';

export function CoursePreviewPage() {
  const { courseId } = useParams();
  const [searchParams] = useSearchParams();
  const justSaved = searchParams.get('saved') === '1';
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    const loaded = await getCourse(courseId);
    if (!loaded) {
      navigate('/');
      return;
    }
    setCourse(loaded);
    // Resolve media once up front so playback starts instantly.
    setSteps(await buildWalkthroughSteps(loaded));
    setLoading(false);
  }, [courseId, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageSpinner />;
  if (!course) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex items-center justify-between gap-3 mb-5">
        <button
          onClick={() => (justSaved ? navigate('/courses') : navigate(-1))}
          className="flex items-center gap-2 text-sm text-ink-soft dark:text-ink-faint-dark hover:text-ink dark:hover:text-ink-soft-dark transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {justSaved ? 'All courses' : 'Back'}
        </button>
        <button
          onClick={() => navigate(`/editor/${course.id}`)}
          className="flex items-center gap-1.5 px-4 h-10 rounded-xl border border-line dark:border-line-dark text-sm font-semibold text-ink dark:text-ink-soft-dark hover:border-accent hover:text-accent transition-colors"
        >
          <Pencil className="w-4 h-4" /> Edit course
        </button>
      </div>

      {justSaved && (
        <p className="hs-area-open mb-4 flex items-center gap-2 text-sm font-medium text-teal dark:text-teal-dark">
          <CheckCircle2 className="w-4 h-4" /> Saved. Your walkthrough is ready. Press ▶ to watch
          it.
        </p>
      )}

      {/* Player: inline, paused until the viewer clicks ▶ */}
      <div className="h-[min(72vh,720px)] min-h-[420px]">
        <WalkthroughPlayer key={course.id} steps={steps} title={course.title} variant="inline" />
      </div>

      <CourseInfo
        title={course.title}
        pageName={course.pageName}
        description={course.description}
        steps={steps}
        status={course.status}
        updatedAt={course.updatedAt}
      />
    </div>
  );
}
