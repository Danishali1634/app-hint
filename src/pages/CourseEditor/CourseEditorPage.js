/**
 * @file Route #/editor/:courseId — the main authoring screen.
 *
 * GUIDANCE: StepGuide at the top shows the 3 parts of every step with
 * checkmarks (① screenshot ② select area ③ explain) and highlights the next
 * one; the upload and "Select area" states show small looping hints
 * (components/tutorial/MiniHint) of what to do.
 *
 * LAYOUT
 *   Header row  : back · editable title (unique) · editable page name · status · Export ZIP
 *   Left column : StepRail (list, add, delete, reorder)
 *   Main column : active step →
 *                   no screenshot yet → StepScreenshotUpload (upload / drop / paste / reuse)
 *                   has screenshot    → FeatureSelector canvas
 *                                       RegionActionBar ("Select area of the feature",
 *                                       Click vs Look), description, AudioRecorderPanel
 *                 no steps → "Add First Step"
 *
 * AUTHORING FLOW (one screen per step)
 *   Step 1: screenshot of the page      → select the button   → "Viewer clicks this"
 *   Step 2: screenshot of what opens    → select what matters → "Just look at this"
 *   … → Preview → "Mark done" (bottom bar) → dialog: Copy link / Download video
 *   In the walkthrough, a "click" area is clicked by an animated pointer and the
 *   next step's screen opens out of it — the viewer sees cause → effect.
 *
 * STATE OWNERSHIP
 *   This page is the single owner of the `course` object. Children never write
 *   the course directly; they call callbacks that go through updateCourse /
 *   updateStep below.
 *
 * AUTOSAVE
 *   There is no Save button. Every change calls saveCourse() immediately
 *   (IndexedDB writes are cheap), so a refresh never loses work.
 *   saveCourse runs inside the state updater so it always saves the newest
 *   state, even during fast typing. In dev StrictMode the updater runs twice,
 *   so the same data is written twice. That is harmless because put() is idempotent.
 *
 * MARK DONE: the sticky bar at the bottom shows how many steps are ready
 * (screenshot + area). "Mark done" checks every step, sets status 'published'
 * and opens CourseDoneDialog. Copy link / Copy embed / Download video run through
 * hooks/useCourseSharing (same as the course cards).
 *
 * ALWAYS EDITABLE: a "done" course stays fully editable (steps, screenshots,
 * areas, text, voice). Links and videos are snapshots, so after changes the
 * bottom bar says so and "Share / Download" creates fresh ones.
 *
 * STEP ORDER: steps can be added at the end, inserted between any two (StepRail
 * "+"), dragged, or deleted; auto-named steps ("Step 3") are renumbered.
 *
 * RETENTION: every edit updates `updatedAt`, which restarts the automatic
 * deletion countdown (COURSE_RETENTION_DAYS). The date is shown in the bottom bar.
 *
 * UNIQUE TITLE: renaming to a title another course already uses is refused on
 * blur/Enter, and the previous title is restored.
 *
 * MEDIA: screenshots/recordings are written to the IndexedDB media store first;
 * steps only store the resulting ids (step.imageId / step.audioId). Two steps
 * may share one screenshot, so an image is only deleted once no step uses it.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  Eye,
  CheckCircle2,
  Pencil,
  Archive,
  Tag,
  Share2,
  Link2,
  Save,
  Check,
  Plus,
  FileText,
  Loader2,
} from 'lucide-react';
import {
  getCourse,
  saveCourse,
  getMedia,
  getMediaAsDataUrl,
  putMedia,
  deleteMedia,
  findCourseByTitle,
  getCourseExpiry,
} from '@/services/storage/db';
import { transcribeRecording } from '@/services/audio/transcribe';
import { exportCourseZip } from '@/services/export/zip';
import { STATUS_LABELS, STATUS_COLORS, MAX_STEPS } from '@/constants';
import { nextId } from '@/utils';
import { getStepAction, getStepImageId, renumberDefaultLabels } from '@/utils/course';
import { StepRail } from '@/components/course/StepRail';
import { FeatureSelector } from '@/components/course/FeatureSelector';
import { RegionActionBar } from '@/components/course/RegionActionBar';
import { StepScreenshotUpload } from '@/components/course/StepScreenshotUpload';
import { StepGuide } from '@/components/course/StepGuide';
import { DescriptionField } from '@/components/course/DescriptionField';
import { PreviewStudio } from '@/components/course/PreviewStudio';
import { AudioRecorderPanel } from '@/components/course/AudioRecorderPanel';
import { CourseDoneDialog } from '@/components/course/CourseDoneDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageSpinner, Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/hooks/useToast';
import { useCourseSharing } from '@/hooks/useCourseSharing';

/** @typedef {import('@/types').Course} Course */
/** @typedef {import('@/types').Step} Step */

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

// Shared button styles
const OUTLINE_BUTTON_CLASS =
  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line dark:border-line-dark text-sm font-medium text-ink-soft dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors';
const SECTION_LABEL_CLASS =
  'block text-xs font-semibold text-ink-faint dark:text-ink-faint-dark uppercase tracking-wider mb-2';

/** A new, empty step. */
function createStep(stepNumber) {
  return {
    id: nextId('step'),
    label: `Step ${stepNumber}`,
    text: '',
    imageId: null,
    region: null,
    action: 'click',
    audioId: null,
  };
}

export function CourseEditorPage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();

  // ── State ────────────────────────────────────────────────────────────────
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeStepId, setActiveStepId] = useState(null);
  const [drawMode, setDrawMode] = useState(false); // true while selecting the feature area
  const [imageUrl, setImageUrl] = useState(null); // data URL of the ACTIVE step's screenshot
  const [showPreview, setShowPreview] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingPageName, setEditingPageName] = useState(false);
  const [showDone, setShowDone] = useState(false); // "Mark done" dialog
  // Everything autosaves; "Save changes" is the visible confirmation. Edits made
  // after `confirmedAt` light the button up; pressing it saves and shows ✓.
  const [confirmedAt, setConfirmedAt] = useState(0);
  const [savedFlash, setSavedFlash] = useState(false);
  // Title before the current rename started — restored if the new one is taken.
  const titleBeforeEditRef = useRef('');
  const sharing = useCourseSharing();
  const [confirmDeleteStep, setConfirmDeleteStep] = useState(null); // step id pending delete

  const activeStep = course?.steps.find((s) => s.id === activeStepId) || null;
  const activeStepIndex = course?.steps.findIndex((s) => s.id === activeStepId) ?? -1;
  const activeImageId = course && activeStep ? getStepImageId(course, activeStep) : null;

  // ── Load course ──────────────────────────────────────────────────────────
  const loadCourse = useCallback(async () => {
    if (!courseId) return;
    const loaded = await getCourse(courseId);
    if (!loaded) {
      notify('Course not found', 'error');
      navigate('/');
      return;
    }
    setCourse(loaded);
    setConfirmedAt(loaded.updatedAt);
    if (loaded.steps.length > 0) setActiveStepId(loaded.steps[0].id);
    setLoading(false);
  }, [courseId, navigate, notify]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  // Resolve the active step's screenshot Blob → data URL whenever it changes.
  useEffect(() => {
    let mounted = true; // ignore results that arrive after a step change/unmount
    setImageUrl(null); // don't show the previous step's image while loading
    if (activeImageId) {
      getMediaAsDataUrl(activeImageId).then((url) => {
        if (mounted) setImageUrl(url);
      });
    }
    return () => {
      mounted = false;
    };
  }, [activeImageId]);

  // ── Course mutations (all autosave) ──────────────────────────────────────

  /** Merge a patch into the course, bump updatedAt, persist. */
  const updateCourse = useCallback((patch) => {
    setCourse((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...patch, updatedAt: Date.now() };
      saveCourse(updated);
      return updated;
    });
  }, []);

  /** Merge a patch into one step, bump updatedAt, persist. */
  const updateStep = useCallback((stepId, patch) => {
    setCourse((prev) => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        steps: prev.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
        updatedAt: Date.now(),
      };
      saveCourse(updated);
      return updated;
    });
  }, []);

  /**
   * Deletes a screenshot Blob unless another step (other than `exceptStepId`)
   * or the legacy course image still uses it.
   */
  const releaseImage = useCallback(
    (imageId, exceptStepId) => {
      if (!course || !imageId || imageId === course.baseImageId) return;
      const stillUsed = course.steps.some((s) => s.id !== exceptStepId && s.imageId === imageId);
      if (!stillUsed) deleteMedia(imageId);
    },
    [course],
  );

  const selectStep = (stepId) => {
    setActiveStepId(stepId);
    setDrawMode(false);
  };

  /**
   * Inserts a new empty step at position `index` (0-based) and selects it.
   * `index = steps.length` appends at the end.
   */
  const insertStep = useCallback(
    (index) => {
      if (!course || course.steps.length >= MAX_STEPS) return;
      const newStep = createStep(index + 1);
      const steps = [...course.steps];
      steps.splice(index, 0, newStep);
      updateCourse({ steps: renumberDefaultLabels(steps) });
      setActiveStepId(newStep.id);
      setDrawMode(false);
    },
    [course, updateCourse],
  );

  /**
   * Several areas on ONE screenshot: each area is its own step (own number,
   * description and voice) sharing the same screenshot. The player glides the
   * camera from one area to the next without cutting, so they play as one scene.
   */
  const addAreaOnSameScreenshot = useCallback(
    (afterIndex, imageId) => {
      if (!course || course.steps.length >= MAX_STEPS) {
        notify(`A course can have up to ${MAX_STEPS} steps`, 'error');
        return;
      }
      const newStep = { ...createStep(afterIndex + 2), imageId };
      const steps = [...course.steps];
      steps.splice(afterIndex + 1, 0, newStep);
      updateCourse({ steps: renumberDefaultLabels(steps) });
      setActiveStepId(newStep.id);
      setDrawMode(true); // straight into "drag a box"
    },
    [course, updateCourse, notify],
  );

  const addStep = useCallback(() => {
    if (course) insertStep(course.steps.length);
  }, [course, insertStep]);

  /** Removes a step plus its recording and (unshared) screenshot. */
  const deleteStep = useCallback(
    (stepId) => {
      if (!course) return;
      const step = course.steps.find((s) => s.id === stepId);
      const remainingSteps = course.steps.filter((s) => s.id !== stepId);
      updateCourse({ steps: renumberDefaultLabels(remainingSteps) });
      if (activeStepId === stepId) {
        setActiveStepId(remainingSteps[0]?.id || null);
        setDrawMode(false);
      }
      if (step?.audioId) deleteMedia(step.audioId); // no orphaned audio
      if (step?.imageId) releaseImage(step.imageId, stepId);
    },
    [course, updateCourse, activeStepId, releaseImage],
  );

  /** Moves the step at index `from` to index `to` (StepRail drag & drop). */
  const reorderSteps = useCallback(
    (from, to) => {
      if (!course) return;
      const steps = [...course.steps];
      const [moved] = steps.splice(from, 1);
      steps.splice(to, 0, moved);
      updateCourse({ steps: renumberDefaultLabels(steps) });
    },
    [course, updateCourse],
  );

  // ── Screenshot + area ────────────────────────────────────────────────────

  /**
   * Sets the active step's screenshot. A new screenshot invalidates the old
   * area (it pointed at pixels of the previous image), so the region resets.
   */
  const setStepImage = useCallback(
    (newImageId) => {
      if (!activeStep) return;
      const oldImageId = activeStep.imageId;
      updateStep(activeStep.id, { imageId: newImageId, region: null });
      if (oldImageId && oldImageId !== newImageId) releaseImage(oldImageId, activeStep.id);
      setDrawMode(false);
    },
    [activeStep, updateStep, releaseImage],
  );

  /** Upload / drop / paste handler for the active step's screenshot. */
  const handleImageFile = useCallback(
    async (file) => {
      if (!activeStep) return;
      if (!file.type.startsWith('image/')) {
        notify('Please choose an image file (PNG, JPG, ...)', 'error');
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        notify('Image must be under 10MB', 'error');
        return;
      }
      const mediaId = nextId('media');
      await putMedia(mediaId, file);
      setStepImage(mediaId);
      notify('Screenshot added — now select the feature area', 'success');
    },
    [activeStep, notify, setStepImage],
  );

  /** "Change screenshot" button. */
  const pickReplacementImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => input.files?.[0] && handleImageFile(input.files[0]);
    input.click();
  };

  // Nearest earlier step that has a screenshot → offered as "Use step N's screenshot".
  // Steps in a row that use the active step's screenshot = its "areas".
  const sameScreenSteps = [];
  let sameScreenLastIndex = activeStepIndex;
  if (course && activeStep) {
    const imageId = getStepImageId(course, activeStep);
    if (imageId) {
      let start = activeStepIndex;
      while (start > 0 && getStepImageId(course, course.steps[start - 1]) === imageId) start--;
      let end = activeStepIndex;
      while (
        end < course.steps.length - 1 &&
        getStepImageId(course, course.steps[end + 1]) === imageId
      )
        end++;
      for (let i = start; i <= end; i++) sameScreenSteps.push({ step: course.steps[i], index: i });
      sameScreenLastIndex = end;
    }
  }

  let reuseSourceIndex = -1;
  if (course && activeStepIndex > 0) {
    for (let i = activeStepIndex - 1; i >= 0; i--) {
      if (getStepImageId(course, course.steps[i])) {
        reuseSourceIndex = i;
        break;
      }
    }
  }
  const reusePreviousImage = () => {
    if (reuseSourceIndex < 0) return;
    setStepImage(getStepImageId(course, course.steps[reuseSourceIndex]));
  };

  /** Canvas callback: after drawing a box, leave draw mode so it can be adjusted. */
  const handleRegionChange = (region) => {
    if (!activeStep) return;
    updateStep(activeStep.id, { region });
    if (drawMode && region) setDrawMode(false);
  };

  // ── Actions ──────────────────────────────────────────────────────────────

  /** A step is ready when it has a screenshot and a selected area. */
  const isStepReady = (step) => !!getStepImageId(course, step) && !!step.region;

  /** Validates every step, marks the course done and opens the share dialog. */
  const markDone = () => {
    if (!course) return;
    if (course.steps.length === 0) {
      notify('Add at least one step first', 'error');
      return;
    }
    const missingIndex = course.steps.findIndex((s) => !isStepReady(s));
    if (missingIndex >= 0) {
      const step = course.steps[missingIndex];
      notify(
        getStepImageId(course, step)
          ? `Step ${missingIndex + 1}: select the feature area first`
          : `Step ${missingIndex + 1} needs a screenshot`,
        'error',
      );
      selectStep(step.id);
      return;
    }
    // publishedAt is refreshed every time, so "changed since you shared it"
    // compares against the latest Mark done.
    updateCourse({ status: 'published', publishedAt: Date.now() });
    setShowDone(true);
  };

  // ── Title / page name ────────────────────────────────────────────────────

  const startTitleEdit = () => {
    titleBeforeEditRef.current = course.title;
    setEditingTitle(true);
  };

  /** On blur/Enter: refuse empty or duplicate titles, restoring the old one. */
  const finishTitleEdit = async () => {
    setEditingTitle(false);
    const previous = titleBeforeEditRef.current;
    const next = course.title.trim();
    if (!next) {
      updateCourse({ title: previous });
      return;
    }
    const clash = await findCourseByTitle(next, course.id);
    if (clash) {
      notify(`“${next}” is already used by another course — title not changed`, 'error');
      updateCourse({ title: previous });
      return;
    }
    if (next !== course.title) updateCourse({ title: next });
  };

  // "Convert all voices to text": every recording becomes its step's text,
  // then the AI voice reads it (for people who talk instead of typing).
  const [convertingAll, setConvertingAll] = useState(null); // null | { done, total }
  const convertAllVoices = async () => {
    const withVoice = course.steps.filter((st) => st.audioId);
    if (withVoice.length === 0) return;
    setConvertingAll({ done: 0, total: withVoice.length });
    let failed = 0;
    for (let n = 0; n < withVoice.length; n++) {
      const st = withVoice[n];
      try {
        const blob = await getMedia(st.audioId);
        const text = blob ? await transcribeRecording(blob) : '';
        if (text) {
          updateStep(st.id, { text, audioId: null });
          await deleteMedia(st.audioId);
        } else failed++;
      } catch {
        failed++;
      }
      setConvertingAll({ done: n + 1, total: withVoice.length });
    }
    setConvertingAll(null);
    if (failed)
      notify(`${failed} recording${failed > 1 ? 's' : ''} could not be converted`, 'error');
    else notify('All voices converted to text — the AI voice reads them now', 'success');
  };

  const saveNow = async () => {
    await saveCourse(course);
    setConfirmedAt(course.updatedAt);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
    notify('All changes saved', 'success');
  };

  const handleExport = async () => {
    if (!course) return;
    try {
      await exportCourseZip(course);
      notify('Backup ZIP downloaded', 'success');
    } catch {
      notify('Export failed', 'error');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) return <PageSpinner />;
  if (!course) return null;

  const readyCount = course.steps.filter(isStepReady).length;
  const allReady = course.steps.length > 0 && readyCount === course.steps.length;
  const isDone = course.status === 'published';
  // Edited after the last Mark done? (small tolerance: Mark done itself bumps updatedAt)
  const changedSinceDone = isDone && course.updatedAt - (course.publishedAt ?? 0) > 1500;
  const hasNewEdits = course.updatedAt > confirmedAt;
  const deletesOn = new Date(getCourseExpiry(course)).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-4">
      {/* ── Header row ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/')}
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors flex-shrink-0"
            aria-label="Back to home"
          >
            <ArrowLeft className="w-5 h-5 text-ink-soft dark:text-ink-soft-dark" />
          </button>

          {/* Click-to-edit title (saved on every keystroke) */}
          {editingTitle ? (
            <input
              type="text"
              value={course.title}
              onChange={(e) => updateCourse({ title: e.target.value })}
              onBlur={finishTitleEdit}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              autoFocus
              className="text-lg font-bold bg-transparent outline-none text-ink dark:text-ink-soft-dark border-b border-accent flex-1 min-w-0"
            />
          ) : (
            <button onClick={startTitleEdit} className="flex items-center gap-1.5 group min-w-0">
              <h1 className="text-lg font-bold text-ink dark:text-ink-soft-dark truncate">
                {course.title}
              </h1>
              <Pencil className="w-3.5 h-3.5 text-ink-faint dark:text-ink-faint-dark opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </button>
          )}

          {/* Page name chip (click to edit) */}
          {editingPageName ? (
            <input
              type="text"
              value={course.pageName || ''}
              onChange={(e) => updateCourse({ pageName: e.target.value })}
              onBlur={() => {
                setEditingPageName(false);
                updateCourse({ pageName: (course.pageName || '').trim() });
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              autoFocus
              placeholder="Page name"
              className="text-xs font-medium px-2.5 py-1 rounded-full bg-paper-2 dark:bg-paper-2-dark border border-accent outline-none w-40 flex-shrink-0"
            />
          ) : (
            <button
              onClick={() => setEditingPageName(true)}
              className="hidden sm:flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-paper-2 dark:bg-paper-2-dark text-ink-soft dark:text-ink-soft-dark hover:ring-1 hover:ring-accent/40 flex-shrink-0 max-w-[14rem]"
              title="Page name — click to edit"
            >
              <Tag className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{course.pageName || 'Add page name'}</span>
            </button>
          )}

          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[course.status]}`}
          >
            {STATUS_LABELS[course.status]}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {(convertingAll || course.steps.some((st) => st.audioId)) && (
            <button
              onClick={convertAllVoices}
              disabled={!!convertingAll}
              className={OUTLINE_BUTTON_CLASS}
              title="Turn every recorded voice into text; the AI voice then reads it"
            >
              {convertingAll ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Converting{' '}
                  {convertingAll.done + 1 > convertingAll.total
                    ? convertingAll.total
                    : convertingAll.done + 1}{' '}
                  of {convertingAll.total}…
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">Convert all voices to text</span>
                </>
              )}
            </button>
          )}
          <button
            onClick={handleExport}
            className={OUTLINE_BUTTON_CLASS}
            title="Download a ZIP backup"
          >
            <Archive className="w-4 h-4" />
            <span className="hidden sm:inline">Export ZIP</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* ── Left: step list ── */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <h2 className="text-xs font-semibold text-ink-faint dark:text-ink-faint-dark uppercase tracking-wider mb-3">
            Steps
          </h2>
          <StepRail
            steps={course.steps}
            activeStepId={activeStepId}
            onSelect={selectStep}
            onAdd={addStep}
            onInsert={insertStep}
            onDelete={(id) => setConfirmDeleteStep(id)}
            onReorder={reorderSteps}
            maxSteps={MAX_STEPS}
            fallbackImageId={course.baseImageId ?? null}
          />
        </div>

        {/* ── Main column ── */}
        <div className="min-w-0">
          {activeStep ? (
            <div className="space-y-4">
              {/* What to do next for this step: ① screenshot ② area ③ explain */}
              <StepGuide
                stepNumber={activeStepIndex + 1}
                hasImage={!!activeImageId}
                hasRegion={!!activeStep.region}
                hasExplanation={!!activeStep.text?.trim() || !!activeStep.audioId}
                onSelectArea={() => setDrawMode(true)}
                onExplain={() => {
                  const box = document.getElementById('step-description');
                  box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  box?.focus({ preventScroll: true });
                }}
              />

              {/* Step label + screenshot action */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <input
                  type="text"
                  value={activeStep.label}
                  onChange={(e) => updateStep(activeStep.id, { label: e.target.value })}
                  placeholder="Step label, e.g. “Open graph data”"
                  className="text-sm font-medium bg-transparent outline-none text-ink dark:text-ink-soft-dark border-b border-transparent focus:border-line dark:focus:border-line-dark flex-1 min-w-0"
                />
                {activeImageId && (
                  <button onClick={pickReplacementImage} className={OUTLINE_BUTTON_CLASS}>
                    <Upload className="w-4 h-4" /> Change screenshot
                  </button>
                )}
              </div>

              {!activeImageId ? (
                <StepScreenshotUpload
                  stepNumber={activeStepIndex + 1}
                  onFile={handleImageFile}
                  reuseFromStepNumber={reuseSourceIndex >= 0 ? reuseSourceIndex + 1 : null}
                  onReuse={reusePreviousImage}
                />
              ) : (
                <>
                  <FeatureSelector
                    imageUrl={imageUrl}
                    region={activeStep.region}
                    onRegionChange={handleRegionChange}
                    drawMode={drawMode}
                    number={sameScreenSteps.length > 1 ? activeStepIndex + 1 : undefined}
                    otherAreas={sameScreenSteps
                      .filter((a) => a.step.id !== activeStep.id && a.step.region)
                      .map((a) => ({ id: a.step.id, number: a.index + 1, region: a.step.region }))}
                    onSelectArea={selectStep}
                  />
                  <RegionActionBar
                    hasRegion={!!activeStep.region}
                    drawMode={drawMode}
                    action={getStepAction(activeStep)}
                    onStartSelect={() => setDrawMode(true)}
                    onCancelSelect={() => setDrawMode(false)}
                    onActionChange={(action) => updateStep(activeStep.id, { action })}
                  />
                  {activeStep.region && !drawMode && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-faint-dark mr-1">
                        Areas on this screenshot
                      </span>
                      {sameScreenSteps.map((a) => (
                        <button
                          key={a.step.id}
                          onClick={() => selectStep(a.step.id)}
                          className={`w-8 h-8 rounded-full text-xs font-bold transition-colors ${
                            a.step.id === activeStep.id
                              ? 'bg-accent text-white shadow-glow'
                              : 'border border-line dark:border-line-dark text-ink-soft dark:text-ink-soft-dark hover:border-accent'
                          }`}
                          aria-label={`Step ${a.index + 1}`}
                        >
                          {a.index + 1}
                        </button>
                      ))}
                      <button
                        onClick={() => addAreaOnSameScreenshot(sameScreenLastIndex, activeImageId)}
                        className="flex items-center gap-1.5 px-3 h-8 rounded-full bg-accent/10 text-accent text-sm font-semibold hover:bg-accent/15"
                      >
                        <Plus className="w-4 h-4" /> Add another area
                      </button>
                    </div>
                  )}
                </>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className={SECTION_LABEL_CLASS}>Step Description</label>
                  <DescriptionField
                    id="step-description"
                    value={activeStep.text}
                    onChange={(text) => updateStep(activeStep.id, { text })}
                    label={activeStep.label}
                    pageName={course.pageName}
                    action={getStepAction(activeStep)}
                  />
                  <p className="text-xs text-ink-faint dark:text-ink-faint-dark mt-1.5">
                    No voice recorded? The AI voice reads this.
                  </p>
                </div>
                <div>
                  <label className={SECTION_LABEL_CLASS}>Voice Guidance</label>
                  <AudioRecorderPanel
                    step={activeStep}
                    onSave={(audioId) => updateStep(activeStep.id, { audioId })}
                    onDelete={() => updateStep(activeStep.id, { audioId: null })}
                    onTranscribed={(text) => updateStep(activeStep.id, { text, audioId: null })}
                  />
                </div>
              </div>
            </div>
          ) : (
            // No steps yet
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-sm text-ink-soft dark:text-ink-soft-dark mb-4">
                Add a step, then upload the screenshot the user sees at that step
              </p>
              <button
                onClick={addStep}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white font-semibold hover:bg-accent-dark transition-colors"
              >
                Add First Step
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom bar: readiness + Preview + Mark done ── */}
      <div className="sticky bottom-4 z-20 mt-10">
        <div className="flex flex-wrap items-center gap-3 justify-between rounded-2xl border border-line dark:border-line-dark bg-panel/90 dark:bg-panel-dark/90 backdrop-blur-xl shadow-2xl px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1" aria-hidden="true">
              {course.steps.map((step) => (
                <span
                  key={step.id}
                  className={`h-1.5 rounded-full transition-all ${
                    isStepReady(step) ? 'w-5 bg-teal' : 'w-3 bg-line dark:bg-line-dark'
                  }`}
                />
              ))}
            </div>
            <p className="text-sm text-ink-soft dark:text-ink-soft-dark">
              <span className="font-semibold text-ink dark:text-ink-soft-dark">
                {readyCount} of {course.steps.length}
              </span>{' '}
              step{course.steps.length !== 1 ? 's' : ''} ready
            </p>
            {changedSinceDone && (
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                Changed since you shared it — share or download again
              </span>
            )}
            <span
              className="hidden lg:inline text-xs text-ink-faint dark:text-ink-faint-dark"
              title="Every edit restarts the countdown"
            >
              Kept until {deletesOn}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {hasNewEdits ? (
              <button
                onClick={saveNow}
                className="flex items-center gap-1.5 px-4 h-10 rounded-xl border-2 border-accent text-accent text-sm font-semibold hover:bg-accent/10 transition-colors"
                title="Your work is also saved automatically"
              >
                <Save className="w-4 h-4" /> Save changes
              </button>
            ) : (
              <span
                key={savedFlash ? 'flash' : 'idle'}
                className={`flex items-center gap-1.5 px-3 h-10 text-sm font-semibold ${
                  savedFlash
                    ? 'hs-saved-pop rounded-xl bg-teal/10 text-teal dark:text-teal-dark'
                    : 'text-ink-faint dark:text-ink-faint-dark'
                }`}
              >
                <Check className="w-4 h-4" /> Saved
              </span>
            )}
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-1.5 px-4 h-10 rounded-xl border border-line dark:border-line-dark text-sm font-medium text-ink dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors"
            >
              <Eye className="w-4 h-4" /> Preview &amp; edit
            </button>
            {isDone && (
              <button
                onClick={() => sharing.copyLink(course)}
                disabled={sharing.linkBusy}
                className="flex items-center gap-1.5 px-4 h-10 rounded-xl border border-line dark:border-line-dark text-sm font-medium text-ink dark:text-ink-soft-dark hover:bg-paper-2 dark:hover:bg-paper-2-dark transition-colors disabled:opacity-50"
              >
                <Link2 className="w-4 h-4" /> Copy link
              </button>
            )}
            <button
              onClick={markDone}
              className={`flex items-center gap-1.5 px-5 h-10 rounded-xl text-sm font-bold text-white shadow-lg transition-all ${
                allReady
                  ? 'bg-accent hover:bg-accent-dark shadow-accent/25'
                  : 'bg-accent/60 hover:bg-accent/70 shadow-none'
              }`}
            >
              {isDone ? (
                <>
                  <Share2 className="w-4 h-4" /> Share / Download
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Mark done
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Overlays ── */}
      {showPreview && (
        <PreviewStudio
          course={course}
          onSave={(next) => {
            setCourse(next);
            saveCourse(next);
            setConfirmedAt(next.updatedAt);
          }}
          onClose={(stepId) => {
            setShowPreview(false);
            if (stepId && course.steps.some((st) => st.id === stepId)) selectStep(stepId);
          }}
        />
      )}

      {showDone && (
        <CourseDoneDialog
          course={course}
          onCopyLink={() => sharing.copyLink(course)}
          onCopyEmbed={() => sharing.copyEmbed(course)}
          onDownloadVideo={() => sharing.downloadVideo(course)}
          linkBusy={sharing.linkBusy}
          videoBusy={sharing.isExportingVideo}
          onClose={() => setShowDone(false)}
          onGoToLibrary={() => navigate('/')}
        />
      )}
      {sharing.overlays}

      <ConfirmDialog
        open={!!confirmDeleteStep}
        title="Delete Step"
        message="Are you sure you want to delete this step? This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (confirmDeleteStep) deleteStep(confirmDeleteStep);
          setConfirmDeleteStep(null);
        }}
        onCancel={() => setConfirmDeleteStep(null)}
      />
    </div>
  );
}
