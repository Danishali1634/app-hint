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
 * EDIT RIGHT HERE (no trip to the editor and back): "Edit here", "Edit this
 * step" (the step on screen) or a step's ✎ in the list opens the preview
 * studio (components/course/PreviewStudio) over the page, in Edit mode on that
 * step: change its text, Click / Look / Type, box, screenshot or — for a
 * video-made step — its moment in the video, reorder steps by dragging, and
 * ▶ Play the step to check it. Save writes the course; closing returns here,
 * rebuilt, on the step that was being edited.
 *
 * FLOW: load course from IndexedDB → buildWalkthroughSteps (media → data URLs)
 *   → inline WalkthroughPlayer. Unknown course id → redirect home.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Pencil, CheckCircle2, SlidersHorizontal } from 'lucide-react';
import { getCourse, saveCourse } from '@/services/storage/db';
import { toast } from 'react-toastify';
import { buildWalkthroughSteps } from '@/services/sharing/share';
import { WalkthroughPlayer } from '@/components/walkthrough/WalkthroughPlayer';
import { CourseInfo } from '@/components/walkthrough/CourseInfo';
import { PageSpinner } from '@/components/ui/Spinner';
import { PreviewStudio } from '@/components/course/PreviewStudio';
import { nextId } from '@/utils';
import { tidyStepGroups } from '@/utils/course';

/** The course step a player step belongs to (targets 2, 3 … of a step are "id~k"). */
const courseStepId = (walkStepId) => String(walkStepId || '').split('~')[0];

export function CoursePreviewPage() {
  const { courseId } = useParams();
  const [searchParams] = useSearchParams();
  const justSaved = searchParams.get('saved') === '1';
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playerIndex, setPlayerIndex] = useState(0); // the step on screen
  const [studio, setStudio] = useState(null); // { stepId } while editing here
  const [jump, setJump] = useState(null); // back from editing: show that step

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (!courseId) return;
      if (!quiet) setLoading(true);
      try {
        const loaded = await getCourse(courseId);
        if (!loaded) {
          navigate('/');
          return [];
        }
        setCourse(loaded);
        // Resolve media once up front so playback starts instantly.
        const built = await buildWalkthroughSteps(loaded);
        setSteps(built);
        return built;
      } catch (error) {
        // Never leave the page spinning when the API fails.
        toast.error(`Could not open the course: ${error.message}`);
        navigate('/');
      } finally {
        setLoading(false);
      }
    },
    [courseId, navigate],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onIndexChange = useCallback((i) => setPlayerIndex(i), []);

  if (loading) return <PageSpinner />;
  if (!course) return null;

  const openStudio = (stepId) =>
    setStudio({ stepId: stepId ?? courseStepId(steps[playerIndex]?.id) });

  /** The studio's Save: same tidy-up as the editor's (groups, labels), then stored. */
  const saveFromStudio = async (saved) => {
    const next = tidyStepGroups(saved, () => nextId('group'));
    setCourse(next);
    await saveCourse(next);
  };

  /** Back from the studio: rebuild the player and show the step that was edited. */
  const closeStudio = async (stepId) => {
    setStudio(null);
    const built = await load({ quiet: true });
    const index = built?.findIndex((w) => courseStepId(w.id) === stepId) ?? -1;
    if (index >= 0) setJump({ index, nonce: Date.now() });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex items-center justify-between gap-3 mb-5">
        <button
          onClick={() => (justSaved ? navigate('/courses') : navigate(-1))}
          className="flex items-center gap-2 text-sm text-ink-soft dark:text-ink-faint-dark hover:text-ink dark:hover:text-ink-soft-dark transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {justSaved ? 'All courses' : 'Back'}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/editor/${course.id}`)}
            className="flex items-center gap-1.5 px-3 sm:px-4 h-10 rounded-xl text-sm font-semibold text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
            title="Open the full editor"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Full editor</span>
          </button>
          {steps.length > 0 && (
            <button
              onClick={() => openStudio()}
              className="flex items-center gap-1.5 px-4 h-10 rounded-xl bg-accent text-white text-sm font-semibold shadow-glow hover:bg-accent-dark transition-colors"
              title="Change the step on screen without leaving this page"
            >
              <Pencil className="w-4 h-4" /> Edit this step
            </button>
          )}
        </div>
      </div>

      {justSaved && (
        <p className="hs-area-open mb-4 flex items-center gap-2 text-sm font-medium text-teal dark:text-teal-dark">
          <CheckCircle2 className="w-4 h-4" /> Saved. Your walkthrough is ready. Press ▶ to watch
          it.
        </p>
      )}

      {/* Player: inline, paused until the viewer clicks ▶ */}
      <div className="h-[min(72vh,720px)] min-h-[420px]">
        <WalkthroughPlayer
          key={course.id}
          steps={steps}
          title={course.title}
          variant="inline"
          pace={course.pace}
          onIndexChange={onIndexChange}
          requestedIndex={jump}
        />
      </div>

      <CourseInfo
        title={course.title}
        pageName={course.pageName}
        description={course.description}
        steps={steps}
        status={course.status}
        updatedAt={course.updatedAt}
        activeIndex={playerIndex}
        onEditStep={(walkStepId) => openStudio(courseStepId(walkStepId))}
      />

      {studio && (
        <PreviewStudio
          course={course}
          startInEdit
          initialStepId={studio.stepId}
          onSave={saveFromStudio}
          onClose={closeStudio}
        />
      )}
    </div>
  );
}
